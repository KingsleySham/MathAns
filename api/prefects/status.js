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
  sanitizeReminders, sanitizeRoster,
} from '../../lib/prefect-duty-status-logic.js';

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';
const MTR = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';

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
// Reminders and this-week's-duty-roster.
//
// Plain admin-edited content, not derived from HKO/MTR. No expiry — these
// persist until prefects/status/update.html overwrites them again. If Redis is
// unavailable, GET just returns empty arrays (the page hides those sections)
// rather than failing the whole response.
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

async function readRoster() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get('prefect:roster');
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function writeRoster(list) {
  try {
    const redis = await getRedisClient();
    await redis.set('prefect:roster', JSON.stringify(list));
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
    const roster = sanitizeRoster(body.roster);
    const [remindersOk, rosterOk] = await Promise.all([writeReminders(reminders), writeRoster(roster)]);
    if (!remindersOk || !rosterOk) return res.status(502).json({ error: 'Could not save to Redis' });

    return res.status(200).json({ ok: true, reminders, roster });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const debug = process.env.DEBUG === '1' ? {} : null;

  try {
    const [weather, transport, reminders, roster] = await Promise.all([
      getWeather(debug),
      getTransport(debug),
      readReminders(),
      readRoster(),
    ]);
    res.status(200).json({
      weather,
      transport,
      reminders,
      roster,
      updated: hkNow().toISOString().slice(11, 16),
      ...(debug ? { raw: debug } : {}),
    });
  } catch (err) {
    // Fail loud, not silent — an empty card on a rainstorm morning is worse than an error.
    res.status(200).json({
      weather: {
        level: 'amber',
        headline: 'Status unavailable',
        warnings: [],
        detail: 'Could not reach the weather service. Check the WhatsApp group and the HKO app directly.',
        latchAvailable: false,
      },
      transport: { ok: true, severity: 'green', alerts: [] },
      reminders: [],
      roster: [],
      updated: hkNow().toISOString().slice(11, 16),
      error: String(err.message || err),
    });
  }
}
