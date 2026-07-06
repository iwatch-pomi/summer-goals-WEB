// SummerGoals 先行予約 受付エンドポイント（Vercel サーバーレス関数）
//
// フロント（index.html）から POST /api/preregister に {email} が送られてくる。
// 受け取ったメールを外部ストレージ（Supabase）へ保存する。
// Supabase の認証情報は Vercel の環境変数に置き、クライアントには一切露出しない。
//
// ── 必要な環境変数（Vercel > Project > Settings > Environment Variables）──
//   SUPABASE_URL               : プロジェクトURL（例: https://xxxx.supabase.co）
//   SUPABASE_SERVICE_ROLE_KEY  : service_role キー（サーバー専用の秘密鍵。絶対に公開しない）
//   SUPABASE_TABLE             : テーブル名（未設定なら "preregistrations"）
//
//   ── 登録完了メール（任意・未設定ならメール送信はスキップ） ──
//   GMAIL_USER                 : 送信元Gmailアドレス（例: iwase.workslab@gmail.com）
//   GMAIL_APP_PASSWORD         : Googleアカウントのアプリパスワード（16桁。通常のログインPWではない）
//
// Supabase 側テーブルの想定カラム:
//   id(bigint, identity) / email(text) / source(text) / created_at(timestamptz, default now())
//
// ※ ストレージを Airtable / Google Sheets 等へ差し替える場合は、下部の
//    saveToStorage() の中身だけ入れ替えれば良い（呼び出し側は変更不要）。

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Vercel は Content-Type: application/json の body を自動パースする。
  // 念のため文字列で来た場合もパースを試みる。
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const email = (body && typeof body.email === 'string') ? body.email.trim() : '';

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  try {
    await saveToStorage(email, req);
  } catch (err) {
    // 設定不足はサーバー側の問題として 500、ストレージ側エラーは 502
    const status = err && err.code === 'not_configured' ? 500 : 502;
    return res.status(status).json({ error: err && err.code ? err.code : 'storage_error' });
  }

  // 登録完了メールはベストエフォート：失敗しても登録自体は成功扱い（200）にする。
  try {
    await sendConfirmationEmail(email);
  } catch (err) {
    console.error('[preregister] confirmation email failed', err && err.message ? err.message : err);
  }

  return res.status(200).json({ ok: true });
}

// ── ストレージ保存（Supabase 実装 / PostgREST 経由） ──
async function saveToStorage(email, req) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_TABLE || 'preregistrations';

  if (!url || !key) {
    const e = new Error('storage_not_configured');
    e.code = 'not_configured';
    throw e;
  }

  // SUPABASE_URL に末尾スラッシュや `/rest/v1` が付いていても正しく正規化する
  const base = url.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const endpoint = `${base}/rest/v1/${encodeURIComponent(table)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify([{
      email: email,
      source: 'LP',
      created_at: new Date().toISOString(),
    }]),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    // Vercel の Logs に Supabase の生エラーを出す（原因特定用）
    console.error('[preregister] supabase insert failed', {
      status: resp.status,
      endpoint,
      table,
      detail,
    });
    const e = new Error(`supabase_error ${resp.status} ${detail}`);
    e.code = 'storage_error';
    throw e;
  }
}

// ── 登録完了メールの本文組み立て（純粋関数・テスト用に分離） ──
export function buildConfirmationMail(to, fromUser) {
  const text = [
    'この度は SummerGoals の先行予約ありがとうございます。',
    '以下の内容でご登録を受け付けました。',
    '',
    `　メールアドレス：${to}`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    'SummerGoals とは',
    '━━━━━━━━━━━━━━━━━━',
    '開始日を8月12日〜9月10日から選び、選んだ日から30日間、',
    '平日に報告して完走すれば、預けた継続保証金3,000円が',
    '全額返金される、大学生のための習慣化プログラムです。',
    '',
    '・開始日は8月12日〜9月10日から自由に選択（選んだ日から30日間）',
    '・報告方法は3つから選択：①写真 ②ボタン ③タイマー',
    '　└ ③タイマーは規定時間アプリ内で集中しないと報告できない＝サボれない設計',
    '・土日はお休みOK（その30日間の土日／開始日により約8〜10日）',
    '・失効するのは平日分のみ（1日100円・開始日ごとに自動計算）',
    '・参加費500円 ＋ 継続保証金3,000円（完走で全額返金）',
    '・決済はスタート確定後にご案内します',
    '',
    '開始日が近づきましたら、改めて詳細をご連絡します。',
    'いましばらくお待ちください。',
    '',
    '※本メールは送信専用アドレスから配信しています。',
    '― SummerGoals 運営',
  ].join('\n');

  const html = `
  <div style="font-family:'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif; color:#15314b; line-height:1.8; max-width:520px;">
    <div style="background:linear-gradient(120deg,#0ea5e9,#22c55e); color:#fff; padding:20px 24px; border-radius:14px 14px 0 0;">
      <div style="font-weight:900; font-size:18px;">SummerGoals</div>
      <div style="font-size:13px; opacity:.9; margin-top:4px;">先行予約を受け付けました 🎉</div>
    </div>
    <div style="border:1px solid #e3eef5; border-top:none; padding:22px 24px; border-radius:0 0 14px 14px;">
      <p style="margin:0 0 14px;">この度は SummerGoals の先行予約ありがとうございます。<br>以下の内容でご登録を受け付けました。</p>
      <p style="margin:0 0 18px; background:#f6fafd; border-radius:10px; padding:12px 14px; font-size:14px;">
        メールアドレス：<b>${escapeHtml(to)}</b>
      </p>
      <p style="font-weight:900; margin:0 0 6px;">SummerGoals とは</p>
      <p style="margin:0 0 14px; font-size:14px;">開始日を8月12日〜9月10日から選び、選んだ日から30日間、平日に報告して完走すれば、預けた継続保証金3,000円が全額返金される、大学生のための習慣化プログラムです。</p>
      <ul style="margin:0 0 16px; padding-left:20px; font-size:14px;">
        <li><b>開始日は8月12日〜9月10日から自由に選択</b>（選んだ日から30日間）</li>
        <li><b>報告方法は3つから選択</b>：①写真 ②ボタン ③タイマー<br><span style="font-size:12.5px; color:#5d7488;">③タイマーは規定時間アプリ内で集中しないと報告できない＝<b>サボれない設計</b></span></li>
        <li><b>土日はお休みOK</b>（その30日間の土日／開始日により約8〜10日）</li>
        <li>失効するのは平日分のみ（1日100円・開始日ごとに自動計算）</li>
        <li>参加費500円 ＋ 継続保証金3,000円（完走で全額返金）</li>
        <li>決済はスタート確定後にご案内します</li>
      </ul>
      <p style="margin:0 0 4px; font-size:14px;">開始日が近づきましたら、改めて詳細をご連絡します。いましばらくお待ちください。</p>
      <p style="margin:18px 0 0; font-size:11px; color:#9bafc1;">※本メールは送信専用アドレスから配信しています。<br>― SummerGoals 運営</p>
    </div>
  </div>`;

  return {
    from: `SummerGoals <${fromUser}>`,
    to,
    bcc: fromUser, // 運営にも控えが届く（不要なら削除）
    subject: '【SummerGoals】先行予約を受け付けました',
    text,
    html,
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── 登録完了メール送信（Gmail SMTP / nodemailer） ──
async function sendConfirmationEmail(to) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  // 未設定ならスキップ（登録自体は成功させる）
  if (!user || !pass) {
    console.warn('[preregister] email not configured (GMAIL_USER/GMAIL_APP_PASSWORD) — skip sending');
    return;
  }

  // nodemailer は送信時のみ動的 import（未設定時に依存を読み込まない）
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail(buildConfirmationMail(to, user));
}
