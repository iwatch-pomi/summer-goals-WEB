// SummerGoals 先行予約 受付エンドポイント（Vercel サーバーレス関数）
//
// フロント（index.html）から POST /api/preregister に {email} が送られてくる。
// 受け取ったメールを外部ストレージ（Airtable）へ保存する。
// Airtable の認証情報は Vercel の環境変数に置き、クライアントには一切露出しない。
//
// ── 必要な環境変数（Vercel > Project > Settings > Environment Variables）──
//   AIRTABLE_TOKEN    : Airtable の Personal Access Token（data.records:write 権限）
//   AIRTABLE_BASE_ID  : 保存先 Base の ID（app... で始まる）
//   AIRTABLE_TABLE    : テーブル名（未設定なら "PreRegistrations"）
//
// Airtable 側テーブルのフィールド想定: Email(1行テキスト) / CreatedAt(1行テキスト or 日時) / Source(1行テキスト)
//
// ※ ストレージを Supabase / Google Sheets 等へ差し替える場合は、下部の
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

// ── ストレージ保存（Airtable 実装） ──
async function saveToStorage(email, req) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE || 'PreRegistrations';

  if (!token || !baseId) {
    const e = new Error('storage_not_configured');
    e.code = 'not_configured';
    throw e;
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      typecast: true,
      records: [{
        fields: {
          Email: email,
          CreatedAt: new Date().toISOString(),
          Source: 'LP',
        },
      }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    const e = new Error(`airtable_error ${resp.status} ${detail}`);
    e.code = 'storage_error';
    throw e;
  }
}
