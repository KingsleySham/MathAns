// Vercel Serverless Function: GET /api/pdf?path=finals-uploads/…/file.pdf
//
// Streams a PDF stored at finals-uploads/{noteId}/{filename} back to the
// browser with a clean `application/pdf` Content-Type and `Content-
// Disposition: inline`. Necessary because raw.githubusercontent.com
// serves all files as `application/octet-stream` with `nosniff` and a
// strict CSP sandbox, which together force every PDF to download
// instead of opening in the browser's native viewer.
//
// Locked to finals-uploads/* so it can't be used as an open proxy.

const GITHUB_OWNER = "KingsleySham";
const GITHUB_REPO = "MathAns";
const GITHUB_BRANCH = "main";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("Method not allowed");
  }

  const path = (req.query && req.query.path) || "";
  if (
    typeof path !== "string" ||
    !path.startsWith("finals-uploads/") ||
    path.includes("..") ||
    path.includes("\0")
  ) {
    return res.status(400).send("Invalid path");
  }
  if (!/\.pdf$/i.test(path)) {
    return res.status(400).send("Only .pdf paths are allowed");
  }

  const rawUrl =
    `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/` +
    path.split("/").map(encodeURIComponent).join("/");

  let upstream;
  try {
    upstream = await fetch(rawUrl);
  } catch (err) {
    return res.status(502).send("Upstream fetch failed: " + (err.message || err));
  }
  if (!upstream.ok) {
    return res.status(upstream.status).send("Upstream returned " + upstream.status);
  }

  const filename = (path.split("/").pop() || "file.pdf").replace(/[\r\n"]/g, "");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.status(200).send(buf);
}
