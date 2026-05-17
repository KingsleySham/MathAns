// Vercel Serverless Function: POST /api/upload-note
// Receives a note/mock-paper upload from finals.mathans.app and commits it
// to the repo under finals-uploads/{noteId}/{filename}. Mirrors the pattern
// in /api/upload.js (image uploads for the maths diagrams) but stores files
// at a different path and returns a raw.githubusercontent.com download URL
// so the file is reachable the moment the commit lands (no wait for Vercel
// redeploy).

const GITHUB_OWNER = "KingsleySham";
const GITHUB_REPO  = "MathAns";
const GITHUB_BRANCH = "main";
const GITHUB_API = "https://api.github.com";

// Vercel serverless function bodies are capped at 4.5 MB. base64 inflates
// binary by ~4/3, so 3 MB binary ≈ 4 MB base64 — safely under the cap.
const MAX_BYTES = 3 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/html",
]);
const ALLOWED_EXT = new Set(["pdf", "doc", "docx", "png", "jpg", "jpeg", "webp", "txt", "html", "htm"]);
const ALLOWED_TYPES = new Set(["notes", "mock_paper"]);

function bad(res, code, msg) { return res.status(code).json({ error: msg }); }

function safeFilename(name) {
  return String(name || "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 120);
}

function newNoteId() {
  // RFC4122-ish: timestamp + 16 hex chars of randomness. No crypto.randomUUID
  // dependency for older Node runtimes.
  const r = (n) => [...Array(n)].map(() =>
    Math.floor(Math.random() * 16).toString(16)).join("");
  return Date.now().toString(36) + "-" + r(16);
}

async function githubPut(path, body, token) {
  return fetch(`${GITHUB_API}${path}`, {
    method: "PUT",
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

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return bad(res, 400, "Invalid JSON body"); }

  const {
    uploaderName, title, subject, type, description,
    fileName, fileMime, fileBase64
  } = body || {};

  // Validate text fields.
  if (typeof uploaderName !== "string" || !uploaderName.trim() || uploaderName.length > 80)
    return bad(res, 400, "Invalid name");
  if (typeof title !== "string" || !title.trim() || title.length > 200)
    return bad(res, 400, "Invalid title");
  if (typeof subject !== "string" || subject.length > 50)
    return bad(res, 400, "Invalid subject");
  if (!ALLOWED_TYPES.has(type))
    return bad(res, 400, "Invalid type");
  if (description != null && (typeof description !== "string" || description.length > 1000))
    return bad(res, 400, "Invalid description");

  // Validate file.
  if (typeof fileName !== "string" || !fileName)
    return bad(res, 400, "Missing file name");
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext))
    return bad(res, 400, "Unsupported file extension");
  if (fileMime && !ALLOWED_MIME.has(fileMime))
    return bad(res, 400, "Unsupported MIME type");
  if (typeof fileBase64 !== "string" || !fileBase64)
    return bad(res, 400, "Missing file data");

  // Strip data URI prefix if present.
  const base64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
  // Roughly compute decoded size (base64 length × 3/4 minus padding).
  const padding = (base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0));
  const approxBytes = Math.floor(base64.length * 3 / 4) - padding;
  if (approxBytes > MAX_BYTES)
    return bad(res, 413, `File too large (max ${Math.floor(MAX_BYTES / (1024 * 1024))} MB)`);

  // Build repo path.
  const noteId = newNoteId();
  const cleanFile = safeFilename(fileName);
  const filePath = `finals-uploads/${noteId}/${cleanFile}`;
  const apiPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  const commitMsg = `Finals upload: ${title.slice(0, 80)} (${type})`;
  const commitRes = await githubPut(apiPath, {
    message: commitMsg,
    content: base64,
    branch: GITHUB_BRANCH,
  }, token);

  if (!commitRes.ok) {
    let detail;
    try { detail = (await commitRes.json()).message; } catch { detail = commitRes.statusText; }
    return bad(res, 500, `GitHub commit failed: ${detail || commitRes.status}`);
  }

  const downloadUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;

  return res.status(200).json({
    ok: true,
    noteId,
    filePath,
    downloadUrl,
    fileSize: approxBytes,
  });
}

// Bump the body parser cap a hair above the binary cap so 3 MB binaries
// (~4 MB base64) fit comfortably inside the JSON envelope.
export const config = {
  api: {
    bodyParser: { sizeLimit: "5mb" },
  },
};
