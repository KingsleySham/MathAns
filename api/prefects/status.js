// api/prefects/status.js  →  serves at https://mathans.app/api/prefects/status
//
// GET  — public. Returns the live weather/MTR status plus whatever reminders and
//        this-week's-duty-roster the admin page has saved.
// POST — admin-only (x-admin-secret header or body.secret, checked against
//        PREFECT_ADMIN_SECRET — same secret/header already used by
//        api/whatsapp/send-duty.js). Body: { reminders: string[], roster: RosterDay[] }.
//        Overwrites the saved reminders/roster in Redis. Used by
//        prefects/status/update.html.
//
// Sources
//   HKO warning summary  https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum
//   MTR next train       https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php
//
// The duty-mapping and MTR-alert decisions live in lib/prefect-duty-status-logic.js,
// shared with prefects/status/test.html — this file only does the I/O (fetch, Redis,
// request/response) around that shared logic.
//
// VERIFY ON FIRST DEPLOY: set DEBUG=1 as an env var and hit the endpoint once. The raw
// payloads come back in the response so you can confirm the warnsum `code` values and
// the Next Train `isdelay` / `ttnt` fields match what this file assumes — and, since the
// LINES list covers all 10 MTR lines, that each added `sta` code is one the
// getSchedule.php API actually recognises for its line (they came from the published
// line/station code list, not a live response).

import { getRedisClient } from '../../lib/prefect-redis-client.js';
import {
  LINES, SUSPEND, CUTOFF, classifyWeather, evaluateLine, summarizeTransport,
  sanitizeReminders, sanitizeRoster, nextDuty,
  DEFAULT_SETTINGS, sanitizeSettings, pruneRoster,
} from '../../lib/prefect-duty-status-logic.js';
import {
  readRoster, writeRoster, readSettings, writeSettings, purgeEndedDuties,
} from '../../lib/prefect-roster-store.js';

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';
const MTR = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';

// The amber "we don't know" card. Shown when HKO is unreachable — a blank card
// on a rainstorm morning is the worst outcome in this project.
const UNAVAILABLE_WEATHER = {
  level: 'amber',
  headline: 'Status unavailable',
  warnings: [],
  detail: 'Could not reach the weather service. Check the WhatsApp group and the HKO app directly.',
  latchAvailable: false,
};

const hkNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const hkMinutes = () => { const d = hkNow(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hkDate = () => hkNow().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Whole-day latch.
//
// A Red Rainstorm hoisted at 06:00 and lowered at 06:45 disappears from warnsum, but the
// suspension stands until midnight. So the first sighting after 05:30 is written to Redis and
// read back on every later request that day.
//
// Requires REDIS_URL set in the project's env vars, pointing at a Redis-compatible database
// (see lib/prefect-redis-client.js). Values round-trip through JSON — the raw client only
// speaks strings.
//
// If Redis is unavailable the endpoint still works; it just loses the latch and says so in
// `latchAvailable`, so the page can fall back to trusting the live signal only.
// ---------------------------------------------------------------------------

async function readLatch() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(`prefect:suspended:${hkDate()}`);
    const v = raw ? JSON.parse(raw) : null;
    return { available: true, suspended: Boolean(v), names: Array.isArray(v) ? v : [] };
  } catch {
    return { available: false, suspended: false, names: [] };
  }
}

async function writeLatch(names) {
  try {
    const redis = await getRedisClient();
    // Expire after 24h so the key cannot outlive the day it describes.
    await redis.set(`prefect:suspended:${hkDate()}`, JSON.stringify(names), { expiration: { type: 'EX', value: 86400 } });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reminders.
//
// Plain admin-edited content, not derived from HKO/MTR. No expiry — these
// persist until prefects/status/update.html overwrites them again. If Redis is
// unavailable, GET just returns an empty array (the page hides the section)
// rather than failing the whole response.
//
// The duty roster and the admin settings live in lib/prefect-roster-store.js,
// because the automatic clean-up of ended duties also runs from the WhatsApp
// cron and both callers need the same keys.
// ---------------------------------------------------------------------------

async function readReminders() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get('prefect:reminders');
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function writeReminders(list) {
  try {
    const redis = await getRedisClient();
    await redis.set('prefect:reminders', JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

async function getWeather(debug) {
  const res = await fetch(HKO);
  if (!res.ok) throw new Error('HKO ' + res.status);
  const json = await res.json();
  if (debug) debug.hko = json;

  const active = Object.values(json).filter(w => w && w.code && w.actionCode !== 'CANCEL');
  const minutes = hkMinutes();
  const afterCutoff = minutes >= CUTOFF;

  const suspendingNow = active.filter(w => SUSPEND.has(w.code)).map(w => w.name);
  if (suspendingNow.length && afterCutoff) await writeLatch(suspendingNow);

  const latch = await readLatch();
  return classifyWeather(active, minutes, latch);
}

async function getLine(cfg, debug) {
  try {
    const res = await fetch(`${MTR}?line=${cfg.line}&sta=${cfg.sta}&lang=en`);
    if (!res.ok) return null;
    const json = await res.json();
    if (debug) debug[`mtr_${cfg.line}_${cfg.sta}`] = json;
    return evaluateLine(cfg, json, hkMinutes());
  } catch {
    return null;
  }
}

async function getTransport(debug) {
  const results = await Promise.all(LINES.map(l => getLine(l, debug)));
  return summarizeTransport(results.filter(Boolean));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const secret = process.env.PREFECT_ADMIN_SECRET;
    if (!secret) return res.status(500).json({ error: 'PREFECT_ADMIN_SECRET is not set on the server' });

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const provided = req.headers['x-admin-secret'] || body.secret;
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

    const reminders = sanitizeReminders(body.reminders);
    // Settings are optional in the body: the roster editor and the settings
    // pane save independently, so an old client that only sends reminders and
    // roster must not wipe the saved defaults.
    const settings = 'settings' in body ? sanitizeSettings(body.settings) : await readSettings();

    // Prune on the way in as well as on read, so a save that re-submits an old
    // day the admin never noticed doesn't resurrect it past its window.
    const { kept: roster } = pruneRoster(sanitizeRoster(body.roster), hkDate(), settings.retention);

    const [remindersOk, rosterOk, settingsOk] = await Promise.all([
      writeReminders(reminders),
      writeRoster(roster),
      writeSettings(settings),
    ]);
    if (!remindersOk || !rosterOk || !settingsOk) return res.status(502).json({ error: 'Could not save to Redis' });

    return res.status(200).json({ ok: true, reminders, roster, settings });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const debug = process.env.DEBUG === '1' ? {} : null;

  try {
    // getWeather is caught here rather than left to the outer handler: it is the
    // only upstream that can reject, and letting it abort the whole Promise.all
    // used to blank `roster` too. The admin page saves back what it loaded, so a
    // blank roster on an HKO outage was one Save away from wiping the real one.
    let weatherError = null;
    const [weather, transport, reminders, storedRoster, storedSettings] = await Promise.all([
      getWeather(debug).catch((err) => { weatherError = err; return UNAVAILABLE_WEATHER; }),
      getTransport(debug),
      readReminders(),
      readRoster(),
      readSettings(),
    ]);

    // The response is s-maxage=60, so this write-back only fires on a cache
    // miss — often enough to keep the roster clean, rarely enough to be cheap.
    const { roster, settings } = await purgeEndedDuties(storedRoster, storedSettings, hkDate());

    res.status(200).json({
      weather,
      transport,
      reminders,
      roster,
      settings,
      nextDuty: nextDuty(roster, hkDate()),
      updated: hkNow().toISOString().slice(11, 16),
      ...(weatherError ? { error: String(weatherError.message || weatherError) } : {}),
      ...(debug ? { raw: debug } : {}),
    });
  } catch (err) {
    // Fail loud, not silent — an empty card on a rainstorm morning is worse than an error.
    res.status(200).json({
      weather: UNAVAILABLE_WEATHER,
      transport: { ok: true, severity: 'green', alerts: [] },
      reminders: [],
      roster: [],
      settings: DEFAULT_SETTINGS,
      nextDuty: null,
      updated: hkNow().toISOString().slice(11, 16),
      // The admin page keys off this to refuse to overwrite a roster it never
      // managed to load — see the `loaded` guard in prefects/status/update.html.
      error: String(err.message || err),
    });
  }
}
