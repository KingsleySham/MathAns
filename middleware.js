// Edge middleware — basic auth over the flights planner and its API.
//
// /flights exposes travel plans and its watches API accepts writes; left
// open, anyone could add watches and burn the Amadeus quota. The matcher is
// deliberately narrow: nothing else on mathans.app changes behaviour, and
// the cron endpoint (/api/flights/cron/track) is NOT matched — it carries
// its own Bearer CRON_SECRET check inside api/flights.js, and basic auth
// here would lock the scheduler out.
//
// The watches API is served under /flights/api/* so the browser reuses the
// credentials it cached when the page itself authenticated. The bare
// /api/flights function path is defended by the same check inside the
// function, so skipping it here opens nothing.
//
// Fails closed: no FLIGHTS_USER/FLIGHTS_PASS configured means 401, not open.

export const config = {
  matcher: ['/flights', '/flights/:path*'],
};

function deny(message) {
  return new Response(message, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="flights"' },
  });
}

export default function middleware(request) {
  const user = process.env.FLIGHTS_USER;
  const pass = process.env.FLIGHTS_PASS;
  if (!user || !pass) return deny('flights auth not configured');

  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return deny('authentication required');

  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return deny('authentication required');
  }
  const i = decoded.indexOf(':');
  const okUser = i !== -1 && constantTimeEqual(decoded.slice(0, i), user);
  const okPass = i !== -1 && constantTimeEqual(decoded.slice(i + 1), pass);
  if (!(okUser && okPass)) return deny('authentication required');

  // Returning nothing lets the request continue to the static page or API.
  return undefined;
}

function constantTimeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
