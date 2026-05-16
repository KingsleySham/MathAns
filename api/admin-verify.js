// Vercel Serverless Function: POST /api/admin-verify
// Dedicated passcode-check endpoint for the finals admin page.
// Returns:
//   200 { ok: true }      — passcode matches FINALS_ADMIN_SECRET
//   401 { error: "..." }  — wrong passcode
//   500 { error: "..." }  — server misconfigured (env var missing)

function bad(res, code, msg) { return res.status(code).json({ error: msg }); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const secret = process.env.FINALS_ADMIN_SECRET;
  if (!secret) return bad(res, 500, "Server misconfigured: FINALS_ADMIN_SECRET is not set in Vercel.");

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return bad(res, 400, "Invalid JSON body"); }

  const { passcode } = body || {};
  if (typeof passcode !== "string" || !passcode) return bad(res, 400, "Missing passcode");

  if (passcode !== secret) return bad(res, 401, "Wrong passcode");

  return res.status(200).json({ ok: true });
}
