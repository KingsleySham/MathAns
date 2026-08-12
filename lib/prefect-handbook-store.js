// Redis state for the handbook read-check.
//
//   prefect:handbook-secret   the HMAC key behind the rotating code
//   prefect:handbook          { round, confirmed } — reset when a round starts
//
// Split out from lib/prefect-messenger.js so the public status endpoint can
// serve the code without importing the whole WhatsApp stack: that endpoint is
// the one the Notion embed depends on, and it should stay as light and as
// hard to break as possible. Same reason lib/prefect-roster-store.js exists.
//
// The code generation itself is pure, in lib/prefect-handbook.js.

import { getRedisClient } from './prefect-redis-client.js';
import { PERIOD_MS, currentCode, newHandbookSecret, sanitizeHandbook } from './prefect-handbook.js';

const SECRET_KEY = 'prefect:handbook-secret';
const STATE_KEY = 'prefect:handbook';

async function kvGet(key) {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  try {
    const redis = await getRedisClient();
    await redis.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const readHandbook = async () => sanitizeHandbook(await kvGet(STATE_KEY));
export const writeHandbook = (v) => kvSet(STATE_KEY, sanitizeHandbook(v));

// Made on first use and kept, rather than asking for another env var. Rotating
// it invalidates every code currently on screen — which is exactly what
// starting a fresh round should do, so a round start rotates it.
export async function handbookSecret({ rotate = false } = {}) {
  const stored = await kvGet(SECRET_KEY);
  if (stored && !rotate) return stored;
  const secret = newHandbookSecret();
  await kvSet(SECRET_KEY, secret);
  return secret;
}

// What the handbook page shows.
export async function handbookCodeNow() {
  const [secret, state] = await Promise.all([handbookSecret(), readHandbook()]);
  const now = Date.now();
  return {
    code: currentCode(secret, now),
    expiresIn: PERIOD_MS - (now % PERIOD_MS),
    periodMs: PERIOD_MS,
    // The page uses this to say whether a check is actually running, so a
    // prefect who wanders in off-season is not left copying a pointless code.
    open: Boolean(state.round),
  };
}
