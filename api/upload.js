// Vercel Serverless Function: POST /api/upload
// Receives an image upload for a specific section+question,
// commits the image file and updates diagrams.json in the GitHub repo.

const GITHUB_OWNER = "KingsleySham";
const GITHUB_REPO  = "MathAns";
const GITHUB_BRANCH = "main";
const GITHUB_API = "https://api.github.com";

const VALID_SECTIONS = ["4.1","4.2","4.3","5.1","5.2","6.1","6.3","7.1","UT"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "image/gif":  "gif",
  "image/webp": "webp",
};

async function githubGet(path, token) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return res;
}

async function githubPut(path, body, token) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res;
}

export default async function handler(req, res) {
  // CORS headers so the editor page can call this from a different origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Server misconfiguration: missing GITHUB_TOKEN" });
  }

  // Parse body
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { section, question, imageBase64, mimeType } = body || {};

  // Validate section
  if (!section || !VALID_SECTIONS.includes(section)) {
    return res.status(400).json({ error: "Invalid section" });
  }

  // Validate question (allow numeric strings and UT keys like "Ch4_1")
  if (!question || typeof question !== "string" || question.trim() === "") {
    return res.status(400).json({ error: "Invalid question" });
  }
  const cleanQuestion = question.trim();

  // Validate mimeType
  const ext = MIME_EXT[mimeType];
  if (!ext) {
    return res.status(400).json({ error: "Unsupported image type. Use JPEG, PNG, GIF, or WebP." });
  }

  // Validate image data
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return res.status(400).json({ error: "Missing image data" });
  }

  // Rough size check (base64 is ~4/3 of binary)
  if (imageBase64.length > MAX_BYTES * 1.4) {
    return res.status(400).json({ error: "Image too large (max 5 MB)" });
  }

  // Build file path in repo
  const safeSection = section.replace(/[^A-Za-z0-9._-]/g, "_");
  const safeQuestion = cleanQuestion.replace(/[^A-Za-z0-9._-]/g, "_");
  const imagePath = `images/${safeSection}/Q${safeQuestion}.${ext}`;
  const repoContentPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${imagePath}`;

  // Check if file already exists (to get SHA for update)
  let existingSha;
  const existingRes = await githubGet(repoContentPath, token);
  if (existingRes.ok) {
    const existingData = await existingRes.json();
    existingSha = existingData.sha;
  }

  // Commit the image file
  const imagePayload = {
    message: `Add diagram for ${section} Q${cleanQuestion}`,
    content: imageBase64,
    branch: GITHUB_BRANCH,
  };
  if (existingSha) imagePayload.sha = existingSha;

  const imageCommitRes = await githubPut(repoContentPath, imagePayload, token);
  if (!imageCommitRes.ok) {
    const errData = await imageCommitRes.json().catch(() => ({}));
    return res.status(500).json({ error: "Failed to commit image to GitHub", details: errData.message });
  }

  // Read current diagrams.json
  const diagramsPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/diagrams.json`;
  let currentDiagrams = {};
  let diagramsSha;

  const diagramsRes = await githubGet(diagramsPath, token);
  if (diagramsRes.ok) {
    const diagramsData = await diagramsRes.json();
    diagramsSha = diagramsData.sha;
    try {
      currentDiagrams = JSON.parse(Buffer.from(diagramsData.content, "base64").toString("utf8"));
    } catch {
      currentDiagrams = {};
    }
  }

  // Merge in the new entry
  if (!currentDiagrams[section]) currentDiagrams[section] = {};
  currentDiagrams[section][cleanQuestion] = imagePath;

  const updatedJson = JSON.stringify(currentDiagrams, null, 2) + "\n";
  const updatedBase64 = Buffer.from(updatedJson, "utf8").toString("base64");

  const diagramsPayload = {
    message: `Update diagrams.json for ${section} Q${cleanQuestion}`,
    content: updatedBase64,
    branch: GITHUB_BRANCH,
  };
  if (diagramsSha) diagramsPayload.sha = diagramsSha;

  const diagramsCommitRes = await githubPut(diagramsPath, diagramsPayload, token);
  if (!diagramsCommitRes.ok) {
    const errData = await diagramsCommitRes.json().catch(() => ({}));
    return res.status(500).json({ error: "Failed to update diagrams.json", details: errData.message });
  }

  return res.status(200).json({ ok: true, path: imagePath });
}
