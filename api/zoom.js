// Vercel Serverless Function: Zoom integration (OAuth callback + meeting creation).
//
// Serves two public endpoints, unchanged for callers:
//   GET  /api/zoom/callback  -> ?op=callback
//   POST /api/zoom/meetings  -> ?op=meetings
// Both are routed here by rewrites in vercel.json. They live in one function
// because the Hobby plan caps a deployment at 12 serverless functions, and
// they were already two halves of the same job: the OAuth handshake that
// gets a Zoom access token, and the API call that spends it to create a
// meeting.

const ZOOM_TOKEN_URL    = "https://zoom.us/oauth/token";
const ZOOM_USER_URL     = "https://api.zoom.us/v2/users/me";
const ZOOM_MEETINGS_URL = "https://api.zoom.us/v2/users/me/meetings";

// GET /api/zoom/callback
// Receives the OAuth "code" from Zoom, exchanges it for an access token,
// fetches the Zoom user profile, then redirects back to the admin page
// with the tokens attached as query params so the client can store them.
async function callback(req, res) {
  const clientId     = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const appBaseUrl   = process.env.APP_BASE_URL;
  const redirectUri  = process.env.ZOOM_REDIRECT_URI;

  if (!clientId || !clientSecret || !appBaseUrl || !redirectUri) {
    return res.status(500).send(
      "Server misconfigured — set ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, " +
      "APP_BASE_URL and ZOOM_REDIRECT_URI in Vercel env vars."
    );
  }

  const code = req.query.code;
  if (!code) return res.status(400).send("Missing ?code parameter from Zoom.");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokRes = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  const tok = await tokRes.json();
  if (!tok.access_token) {
    return res.status(400).json({ error: "Zoom token exchange failed", zoom: tok });
  }

  let userEmail = "", userId = "";
  try {
    const meRes = await fetch(ZOOM_USER_URL, {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    if (meRes.ok) {
      const me = await meRes.json();
      userEmail = me.email || "";
      userId    = me.id    || "";
    }
  } catch (_) { /* non-fatal */ }

  const params = new URLSearchParams({
    zoom_access_token:  tok.access_token,
    zoom_refresh_token: tok.refresh_token || "",
    zoom_expires_at:    String(Date.now() + (tok.expires_in || 3600) * 1000),
    zoom_user_email:    userEmail,
    zoom_user_id:       userId
  });

  res.redirect(302, `${appBaseUrl}/roster/admin.html?${params.toString()}`);
}

// POST /api/zoom/meetings
// Thin proxy to Zoom's "create meeting" API. The admin page forwards the
// user's OAuth access token in the Authorization header; we just relay it.
async function meetings(req, res) {
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

export default async function handler(req, res) {
  const op = req.query.op;
  if (op === "callback") return callback(req, res);
  if (op === "meetings") return meetings(req, res);
  return res.status(400).json({ error: "Unknown op" });
}
