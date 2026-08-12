// The handbook read-check: a rotating code shown on the handbook page, which a
// prefect sends back over WhatsApp to confirm they opened it.
//
// Pure functions only — the Redis state and the messaging live in
// lib/prefect-messenger.js, so the code itself can be unit-tested without either.
//
// WHAT THIS DOES AND DOES NOT PROVE
//
// The handbook page is a public Notion embed with no login, so every prefect
// sees the same code and the first one to open it can paste it into the group
// chat. This is an attendance code, not authentication: it shows a prefect had
// the page open in the last ten minutes, and nothing stronger. The rotation is
// what stops a code being passed around days later, which is the realistic
// failure — not a determined forger.
//
// The scheme is TOTP in all but name: HMAC-SHA256 over a counter derived from
// the clock, truncated to six digits. Written out rather than pulled from a
// library because it is fifteen lines and the repo has no runtime dependencies
// beyond redis/pg/node-ical.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Ten minutes: long enough to read a page, copy the code and switch to
// WhatsApp without hurrying; short enough that yesterday's code is dead.
export const PERIOD_MS = 10 * 60 * 1000;
export const CODE_LENGTH = 6;

// How many past windows still verify. One means a code stays good for between
// ten and twenty minutes depending on when in the window it was read — the
// slack that stops "it says wrong code" the moment someone is slow to switch app.
export const GRACE_WINDOWS = 1;

export const counterFor = (nowMs, periodMs = PERIOD_MS) => Math.floor(nowMs / periodMs);

// Milliseconds until the code on screen changes — drives the countdown on the
// handbook page.
export const msUntilNextCode = (nowMs, periodMs = PERIOD_MS) => periodMs - (nowMs % periodMs);

export function newHandbookSecret() {
  return randomBytes(32).toString('hex');
}

// Dynamic truncation, as in RFC 4226: take the low nibble of the last byte as an
// offset, read four bytes there, mask the sign bit, then take the last digits.
export function handbookCode(secret, counter) {
  const mac = createHmac('sha256', String(secret || '')).update(String(counter)).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24)
    | ((mac[offset + 1] & 0xff) << 16)
    | ((mac[offset + 2] & 0xff) << 8)
    | (mac[offset + 3] & 0xff);
  return String(binary % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, '0');
}

export const currentCode = (secret, nowMs) => handbookCode(secret, counterFor(nowMs));

// Prefects type these into WhatsApp, so accept the shapes a phone keyboard and a
// clipboard produce: spaces, non-breaking spaces, and the odd stray dash.
export const normalizeCode = (input) =>
  String(input ?? '').replace(/[\s -]/g, '');

export const looksLikeCode = (input) =>
  new RegExp(`^\\d{${CODE_LENGTH}}$`).test(normalizeCode(input));

// Pulls a code out of a message that is not only the code — "the code is
// 481920" is what people actually send. The run has to stand alone, so a date
// or a phone number does not get mistaken for one.
export function extractCode(input) {
  const text = String(input ?? '').trim();
  if (looksLikeCode(text)) return normalizeCode(text);
  const match = text.match(new RegExp(`(?<!\\d)\\d{${CODE_LENGTH}}(?!\\d)`));
  return match ? match[0] : '';
}

// Whether a message reads as *an attempt* at the code, even a failed one — a
// digit short, a stray letter, a half-copied string. Without this, a fumbled
// code falls through to the generic "this is a no-reply number" reply, which
// tells a prefect who is trying to comply exactly nothing.
export const looksLikeCodeAttempt = (input) => /\d/.test(String(input ?? ''));

// Constant-time compare. The code is six digits and rotates, so a timing attack
// is not a realistic threat here — this is cheap and avoids having to argue
// about it later.
function sameCode(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Returns true when `input` matches the code for the current window or one of
// the previous GRACE_WINDOWS. Never looks forward: a prefect cannot have read a
// code that has not been shown yet, and accepting future windows would widen
// the guessing surface for no benefit.
export function verifyCode(secret, input, nowMs, grace = GRACE_WINDOWS) {
  if (!secret || !looksLikeCode(input)) return false;
  const given = normalizeCode(input);
  const now = counterFor(nowMs);
  for (let back = 0; back <= grace; back++) {
    if (sameCode(given, handbookCode(secret, now - back))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Round state — one round per "change", reset when the VHP starts a new one.
// ---------------------------------------------------------------------------

export const DEFAULT_HANDBOOK = {
  round: null,      // { id, startedAt, url, sent }
  confirmed: {},    // phone -> { name, at }
};

export function sanitizeHandbook(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const round = raw.round && typeof raw.round === 'object' ? raw.round : null;
  const confirmed = raw.confirmed && typeof raw.confirmed === 'object' ? raw.confirmed : {};
  const text = (v, max) => String(v ?? '').trim().slice(0, max);

  return {
    round: round && text(round.id, 40)
      ? {
        id: text(round.id, 40),
        startedAt: text(round.startedAt, 40),
        url: text(round.url, 500),
        sent: Math.max(0, Math.trunc(Number(round.sent)) || 0),
      }
      : null,
    confirmed: Object.fromEntries(
      Object.entries(confirmed)
        .slice(0, 200)
        .map(([phone, v]) => [
          text(phone, 40),
          { name: text(v?.name, 80), at: text(v?.at, 40) },
        ])
        .filter(([phone]) => phone),
    ),
  };
}

// Who has and has not confirmed, for the admin panel. Matching is by phone,
// which is what the webhook records; `contacts` supplies the names and the
// full list to measure against.
export function handbookTally(handbook, contacts) {
  const confirmed = handbook?.confirmed || {};
  const rows = (contacts || [])
    .filter((c) => c.optIn && c.phone)
    .map((c) => ({
      name: c.name,
      phone: c.phone,
      at: confirmed[c.phone]?.at || '',
      done: Boolean(confirmed[c.phone]),
    }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name));

  return { rows, done: rows.filter((r) => r.done).length, total: rows.length };
}
