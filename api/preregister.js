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
    return res.status(200).json({ ok: true });
  } catch (err) {
    // 設定不足はサーバー側の問題として 500、ストレージ側エラーは 502
    const status = err && err.code === 'not_configured' ? 500 : 502;
    return res.status(status).json({ error: err && err.code ? err.code : 'storage_error' });
  }
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
