// Vercel Serverless Function: POST /api/zoom/meetings
// Thin proxy to Zoom's "create meeting" API. The admin page forwards the
// user's OAuth access token in the Authorization header; we just relay it.

const ZOOM_MEETINGS_URL = "https://api.zoom.us/v2/users/me/meetings";

export default async function handler(req, res) {
  // CORS (in case the admin page is loaded from a different origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token. Connect Zoom from the admin UI first." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { topic, start_time, duration, agenda, timezone } = body;
  if (!topic || !start_time) {
    return res.status(400).json({ error: "topic and start_time are required" });
  }

  const zres = await fetch(ZOOM_MEETINGS_URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      type: 2, // scheduled meeting
      start_time,
      duration: Number(duration) || 60,
      agenda: agenda || "",
      timezone: timezone || "Asia/Hong_Kong",
      settings: {
        join_before_host: true,
        waiting_room: false,
        mute_upon_entry: true
      }
    })
  });

  const json = await zres.json().catch(() => ({}));
  return res.status(zres.status).json(json);
}
