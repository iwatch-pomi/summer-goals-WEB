// ススメ 先行登録 受付エンドポイント（Vercel サーバーレス関数）
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
    'この度は「ススメ」の先行登録ありがとうございます。',
    '以下の内容でご登録を受け付けました。',
    '',
    `　メールアドレス：${to}`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    'ススメ とは',
    '━━━━━━━━━━━━━━━━━━',
    '参考書・教科書の「進んだページ数」を記録して、',
    '全国の受験生・資格勢とランキングで競い合える、',
    '完全無料の進捗アプリです。',
    '',
    '・勉強した“時間”ではなく“進んだページ”で勝負',
    '・週間ページ数と連続記録（ストリーク）で全国ランキング',
    '・科目で絞り込み、同じ志望のライバルが見つかる',
    '・仲間から届く「応援（Cheer）」でモチベUP',
    '・利用料金はぜんぶ無料（匿名ニックネームOK）',
    '',
    'ローンチが決まりましたら、真っ先にお知らせします。',
    'いましばらくお待ちください。',
    '',
    '※本メールは送信専用アドレスから配信しています。',
    '― ススメ 運営',
  ].join('\n');

  const html = `
  <div style="font-family:'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif; color:#15314b; line-height:1.8; max-width:520px;">
    <div style="background:linear-gradient(120deg,#0ea5e9,#22c55e); color:#fff; padding:20px 24px; border-radius:14px 14px 0 0;">
      <div style="font-weight:900; font-size:18px;">ススメ</div>
      <div style="font-size:13px; opacity:.9; margin-top:4px;">先行登録を受け付けました 🎉</div>
    </div>
    <div style="border:1px solid #e3eef5; border-top:none; padding:22px 24px; border-radius:0 0 14px 14px;">
      <p style="margin:0 0 14px;">この度は「ススメ」の先行登録ありがとうございます。<br>以下の内容でご登録を受け付けました。</p>
      <p style="margin:0 0 18px; background:#f6fafd; border-radius:10px; padding:12px 14px; font-size:14px;">
        メールアドレス：<b>${escapeHtml(to)}</b>
      </p>
      <p style="font-weight:900; margin:0 0 6px;">ススメ とは</p>
      <p style="margin:0 0 14px; font-size:14px;">参考書・教科書の「進んだページ数」を記録して、全国の受験生・資格勢とランキングで競い合える、完全無料の進捗アプリです。</p>
      <ul style="margin:0 0 16px; padding-left:20px; font-size:14px;">
        <li>勉強した“時間”ではなく<b>“進んだページ”で勝負</b></li>
        <li><b>週間ページ数と連続記録（ストリーク）</b>で全国ランキング</li>
        <li>科目で絞り込み、同じ志望のライバルが見つかる</li>
        <li>仲間から届く「応援（Cheer）」でモチベUP</li>
        <li>利用料金は<b>ぜんぶ無料</b>（匿名ニックネームOK）</li>
      </ul>
      <p style="margin:0 0 4px; font-size:14px;">ローンチが決まりましたら、真っ先にお知らせします。いましばらくお待ちください。</p>
      <p style="margin:18px 0 0; font-size:11px; color:#9bafc1;">※本メールは送信専用アドレスから配信しています。<br>― ススメ 運営</p>
    </div>
  </div>`;

  return {
    from: `ススメ <${fromUser}>`,
    to,
    bcc: fromUser, // 運営にも控えが届く（不要なら削除）
    subject: '【ススメ】先行登録を受け付けました',
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
