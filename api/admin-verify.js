// Vercel Serverless Function: POST /api/admin-verify
// Dedicated passcode-check endpoint for the finals admin page.
// Returns:
//   200 { ok: true }      — passcode matches
//   401 { error: "..." }  — wrong passcode
//
// The accepted passcode is hardcoded below. If you'd rather keep it out
// of source, set FINALS_ADMIN_SECRET in Vercel — when present, it takes
// precedence. Same trust model as the existing /edit1125 editor.

const ADMIN_PASSCODE = '20101125';

function bad(res, code, msg) { return res.status(code).json({ error: msg }); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const secret = process.env.FINALS_ADMIN_SECRET || ADMIN_PASSCODE;

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return bad(res, 400, "Invalid JSON body"); }

  const { passcode } = body || {};
  if (typeof passcode !== "string" || !passcode) return bad(res, 400, "Missing passcode");

  if (passcode !== secret) return bad(res, 401, "Wrong passcode");

  return res.status(200).json({ ok: true });
}
