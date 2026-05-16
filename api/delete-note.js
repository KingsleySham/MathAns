// Vercel Serverless Function: POST /api/delete-note
// Admin-only — removes a file from finals-uploads/{noteId}/{filename} in
// the repo. Authentication: the request body must include `passcode`
// matching ADMIN_PASSCODE below (or FINALS_ADMIN_SECRET env var, if set
// — env var takes precedence). The matching Firestore doc is deleted
// client-side after this returns OK.

const GITHUB_OWNER = "KingsleySham";
const GITHUB_REPO  = "MathAns";
const GITHUB_BRANCH = "main";
const GITHUB_API = "https://api.github.com";

const ADMIN_PASSCODE = '20101125';

function bad(res, code, msg) { return res.status(code).json({ error: msg }); }

async function githubGet(path, token) {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function githubDelete(path, body, token) {
  return fetch(`${GITHUB_API}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const token = process.env.GITHUB_TOKEN;
  if (!token) return bad(res, 500, "Server misconfiguration: missing GITHUB_TOKEN");

  const secret = process.env.FINALS_ADMIN_SECRET || ADMIN_PASSCODE;

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return bad(res, 400, "Invalid JSON body"); }

  const { passcode, filePath } = body || {};

  if (typeof passcode !== "string" || passcode !== secret)
    return bad(res, 401, "Invalid admin passcode");

  if (typeof filePath !== "string" || !filePath.startsWith("finals-uploads/"))
    return bad(res, 400, "Invalid file path");

  // Defence-in-depth against `..` traversal even though it can't escape the
  // repo via the Contents API.
  if (filePath.includes("..")) return bad(res, 400, "Invalid file path");

  const apiPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  // Need the file's blob sha for the DELETE call.
  const getRes = await githubGet(apiPath, token);
  if (getRes.status === 404) {
    // Treat as success — file already gone.
    return res.status(200).json({ ok: true, alreadyGone: true });
  }
  if (!getRes.ok) {
    let detail;
    try { detail = (await getRes.json()).message; } catch { detail = getRes.statusText; }
    return bad(res, 500, `GitHub lookup failed: ${detail || getRes.status}`);
  }

  const meta = await getRes.json();
  const sha = meta && meta.sha;
  if (!sha) return bad(res, 500, "GitHub returned no sha for file");

  const delRes = await githubDelete(apiPath, {
    message: `Finals: delete ${filePath}`,
    sha,
    branch: GITHUB_BRANCH,
  }, token);

  if (!delRes.ok) {
    let detail;
    try { detail = (await delRes.json()).message; } catch { detail = delRes.statusText; }
    return bad(res, 500, `GitHub delete failed: ${detail || delRes.status}`);
  }

  return res.status(200).json({ ok: true });
}
