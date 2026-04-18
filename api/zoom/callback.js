// Vercel Serverless Function: GET /api/zoom/callback
// Receives the OAuth "code" from Zoom, exchanges it for an access token,
// fetches the Zoom user profile, then redirects back to the admin page
// with the tokens attached as query params so the client can store them.

const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const ZOOM_USER_URL  = "https://api.zoom.us/v2/users/me";

export default async function handler(req, res) {
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
