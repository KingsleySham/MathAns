// api/prefects/status.js  →  serves at https://mathans.app/api/prefects/status
//
// Sources
//   HKO warning summary  https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum
//   MTR next train       https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php
//
// The duty-mapping and MTR-alert decisions live in lib/prefect-duty-status-logic.js,
// shared with prefects/simulator.html — this file only does the I/O (fetch, KV,
// request/response) around that shared logic.
//
// VERIFY ON FIRST DEPLOY: set DEBUG=1 as an env var and hit the endpoint once. The raw
// payloads come back in the response so you can confirm the warnsum `code` values and
// the Next Train `isdelay` / `ttnt` fields match what this file assumes — and, since the
// LINES list covers all 10 MTR lines, that each added `sta` code is one the
// getSchedule.php API actually recognises for its line (they came from the published
// line/station code list, not a live response).

import { kv } from '@vercel/kv';
import { LINES, SUSPEND, CUTOFF, classifyWeather, evaluateLine, summarizeTransport } from '../../lib/prefect-duty-status-logic.js';

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';
const MTR = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';

const hkNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const hkMinutes = () => { const d = hkNow(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hkDate = () => hkNow().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Whole-day latch.
//
// A Red Rainstorm hoisted at 06:00 and lowered at 06:45 disappears from warnsum, but the
// suspension stands until midnight. So the first sighting after 05:30 is written to KV and
// read back on every later request that day.
//
// Requires a KV store attached to the project. If Vercel has moved you to the Upstash Redis
// integration, swap the import for `import { Redis } from '@upstash/redis'` and replace
// kv.get/kv.set with redis.get/redis.set — the calls are the same shape.
//
// If KV is unavailable the endpoint still works; it just loses the latch and says so in
// `latchAvailable`, so the page can fall back to trusting the live signal only.
// ---------------------------------------------------------------------------

async function readLatch() {
  try {
    const v = await kv.get(`prefect:suspended:${hkDate()}`);
    return { available: true, suspended: Boolean(v), names: Array.isArray(v) ? v : [] };
  } catch {
    return { available: false, suspended: false, names: [] };
  }
}

async function writeLatch(names) {
  try {
    // Expire after 24h so the key cannot outlive the day it describes.
    await kv.set(`prefect:suspended:${hkDate()}`, names, { ex: 86400 });
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
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const debug = process.env.DEBUG === '1' ? {} : null;

  try {
    const [weather, transport] = await Promise.all([getWeather(debug), getTransport(debug)]);
    res.status(200).json({
      weather,
      transport,
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
      updated: hkNow().toISOString().slice(11, 16),
      error: String(err.message || err),
    });
  }
}
