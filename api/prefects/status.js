// api/prefects/status.js  →  serves at https://mathans.app/api/prefects/status
//
// Sources
//   HKO warning summary  https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum
//   MTR next train       https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php
//
// VERIFY ON FIRST DEPLOY: set DEBUG=1 as an env var and hit the endpoint once. The raw
// payloads come back in the response so you can confirm the warnsum `code` values and
// the Next Train `isdelay` / `ttnt` fields match what this file assumes.

import { kv } from '@vercel/kv';

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';
const MTR = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';

// Stations serving the school. Per-line ETA thresholds because off-peak headways differ.
const LINES = [
  { line: 'TWL', sta: 'SSP', label: 'Tsuen Wan Line', threshold: 8 },
  { line: 'TML', sta: 'NAC', label: 'Tuen Ma Line', threshold: 10 },
  { line: 'TCL', sta: 'NAC', label: 'Tung Chung Line', threshold: 12 },
];

const DUTY_WINDOW = [6 * 60 + 30, 8 * 60 + 30];   // only run the ETA check 06:30–08:30
const CUTOFF = 5 * 60 + 30;                        // 05:30 — suspension rule starts here

const SUSPEND = new Set(['WRAINR', 'WRAINB', 'TC8NE', 'TC8SE', 'TC8NW', 'TC8SW', 'TC9', 'TC10']);

const ADVISORY = {
  WHOT:   { text: 'Morning Assembly moves to homerooms or the Assembly Hall.', umbrella: false },
  WCOLD:  { text: 'Assembly moves indoors. Non-school jackets are allowed if a notice has been issued via eClass.', umbrella: false },
  WTS:    { text: 'Assembly moves indoors. Bring an umbrella in case of sudden showers.', umbrella: true },
  WRAINA: { text: 'Assembly moves indoors. Bring an umbrella in case of sudden showers.', umbrella: true },
  TC1:    { text: 'No change to duty — heads up only. If the weather is adverse, Assembly moves indoors.', umbrella: false },
  TC3:    { text: 'No change to duty — heads up only. If the weather is adverse, Assembly moves indoors.', umbrella: false },
};

const SUSPEND_DETAIL =
  'All duties cancelled, no rescheduling. Classes suspended for the whole day. ' +
  'If you have not left for school, stay home. If you are already at school, remain there until it is safe to leave.';

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
  const afterCutoff = hkMinutes() >= CUTOFF;

  const suspendingNow = active.filter(w => SUSPEND.has(w.code)).map(w => w.name);
  if (suspendingNow.length && afterCutoff) await writeLatch(suspendingNow);

  const latch = await readLatch();
  const names = suspendingNow.length ? suspendingNow : latch.names;

  if ((suspendingNow.length && afterCutoff) || latch.suspended) {
    return {
      level: 'red',
      headline: 'Duty suspended — whole day',
      warnings: names,
      detail: SUSPEND_DETAIL + (suspendingNow.length ? '' : ' The signal has since been lowered, but the suspension stands for the whole day.'),
      latchAvailable: latch.available,
    };
  }

  const advisories = active.filter(w => ADVISORY[w.code]);
  if (advisories.length) {
    const umbrella = advisories.some(w => ADVISORY[w.code].umbrella);
    return {
      level: 'amber',
      headline: umbrella ? 'Duty as usual — bring an umbrella' : 'Duty as usual',
      warnings: advisories.map(w => w.name),
      detail: [...new Set(advisories.map(w => ADVISORY[w.code].text))].join(' '),
      latchAvailable: latch.available,
    };
  }

  return {
    level: 'green',
    headline: 'Duty as usual',
    warnings: [],
    detail: 'Front gate 7:45am. Morning Assembly outdoors as normal.',
    latchAvailable: latch.available,
  };
}

async function getLine({ line, sta, label, threshold }, debug) {
  try {
    const res = await fetch(`${MTR}?line=${line}&sta=${sta}&lang=en`);
    if (!res.ok) return null;
    const json = await res.json();
    if (debug) debug[`mtr_${line}_${sta}`] = json;

    if (json.status === 0) {
      return { label, severity: 'red', reason: json.message || 'Special service arrangements in place.' };
    }

    const block = json.data && json.data[`${line}-${sta}`];
    if (!block) return null;

    if (block.isdelay === 'Y') {
      return { label, severity: 'amber', reason: 'MTR has flagged a delay on this line.' };
    }

    const mins = hkMinutes();
    if (mins < DUTY_WINDOW[0] || mins > DUTY_WINDOW[1]) return null;

    const waits = ['UP', 'DOWN']
      .flatMap(dir => (block[dir] || []).filter(t => String(t.seq) === '1'))
      .map(t => parseInt(t.ttnt, 10))
      .filter(Number.isFinite);

    if (!waits.length) return null;
    const worst = Math.max(...waits);
    if (worst >= threshold) {
      return { label, severity: 'amber', reason: `Next train ${worst} minutes away — longer than usual for this time.` };
    }
    return null;
  } catch {
    return null;
  }
}

async function getTransport(debug) {
  const results = await Promise.all(LINES.map(l => getLine(l, debug)));
  const alerts = results.filter(Boolean);
  return {
    ok: alerts.length === 0,
    severity: alerts.some(a => a.severity === 'red') ? 'red' : alerts.length ? 'amber' : 'green',
    alerts,
  };
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
