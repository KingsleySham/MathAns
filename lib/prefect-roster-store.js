// Redis I/O for the duty roster and the admin settings that govern it.
//
//   prefect:roster    [{ date, location, time, team, names }]  — no TTL
//   prefect:settings  { defaults, retention, lastPurge }       — no TTL
//
// Both are plain admin-edited content written by prefects/status/update.html,
// not derived from HKO/MTR. They live here rather than inside api/prefects/
// status.js because the daily purge also has to run from the WhatsApp cron
// (api/whatsapp/tasks.js), and two copies of these key names is one too many.
//
// Every read fails soft — a Redis outage degrades the page to "no roster"
// rather than failing the whole status response. The decisions themselves are
// pure functions in lib/prefect-duty-status-logic.js, unit-tested without Redis.

import { getRedisClient } from './prefect-redis-client.js';
import { DEFAULT_SETTINGS, pruneRoster, sanitizeSettings } from './prefect-duty-status-logic.js';

const ROSTER_KEY = 'prefect:roster';
const SETTINGS_KEY = 'prefect:settings';

export async function readRoster() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(ROSTER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function writeRoster(list) {
  try {
    const redis = await getRedisClient();
    await redis.set(ROSTER_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export async function readSettings() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    // Falls back to retention ON but nothing gets purged — purging needs the
    // same Redis that just failed, so this can only ever under-delete.
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(settings) {
  try {
    const redis = await getRedisClient();
    await redis.set(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Automatic clean-up of ended duties.
//
// prefect:roster is one array rather than a key per day, so it cannot carry a
// TTL the way prefect:duty:{date} does — expiry has to be explicit. This runs
// on every uncached GET of the status endpoint and on every admin save, plus
// once per cron so a quiet week still gets cleaned. Idempotent, and it writes
// only when something actually goes.
//
// `settings` is returned stamped with the purge so the update page can show
// "Last purge: …". If the roster write fails the stamp is not saved, so the
// page never claims a clean-up that did not land.
// ---------------------------------------------------------------------------

export async function purgeEndedDuties(roster, settings, todayDateStr) {
  const { kept, removed } = pruneRoster(roster, todayDateStr, settings.retention);
  if (!removed.length) return { roster, settings, removed: 0 };

  if (!(await writeRoster(kept))) return { roster, settings, removed: 0 };

  const stamped = { ...settings, lastPurge: { at: new Date().toISOString(), removed: removed.length } };
  await writeSettings(stamped);
  return { roster: kept, settings: stamped, removed: removed.length };
}
