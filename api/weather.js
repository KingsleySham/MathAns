// Prefect Hub — HKO proxy and duty-arrangement resolution.
//
// Prefects' phones never call the Observatory directly: this function fetches
// the warning summary behind a 5-minute cache, resolves it against the
// school's duty table, and returns one answer. It must always return
// something usable — a stale answer beats no answer at 6 a.m.
//
// Served at /api/weather; the static app lives at /prefect-hub.

import {
  WEATHER_RULES_ORDERED,
  applyStickiness,
  fetchWarnsum,
  hkDateKey,
  listLiveSignals,
  resolveArrangement,
} from '../lib/prefect-weather.mjs';

// Per-day suspension stickiness. Instance-local for now, which is why the
// response says how it was resolved; Firestore-backed persistence lands with
// the Head Prefect override phase.
let daily = null;

export default async function handler(req, res) {
  const now = Date.now();
  const date = hkDateKey(now);

  const warnsum = await fetchWarnsum();

  // Overrides (Pre-No.8, manual) arrive in a later phase; until then the
  // answer comes from HKO plus the seed rules.
  const resolved = resolveArrangement(warnsum.data ?? {}, undefined, undefined, now);

  const stored = daily && daily.date === date ? daily : null;
  const sticky = applyStickiness(resolved, stored, date, now);
  if (sticky.persist) daily = sticky.persist;

  // Short shared-cache window; the in-memory cache is what protects HKO.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    arrangement: sticky.serve,
    suspendedForToday: sticky.suspendedForToday,
    liveSignals: listLiveSignals(warnsum.data ?? {}),
    rules: WEATHER_RULES_ORDERED,
    hko: {
      fetchedAt: warnsum.fetchedAt,
      lastCheckedAt: warnsum.lastCheckedAt,
      stale: warnsum.stale,
      unavailable: warnsum.data === null,
    },
    serverNow: now,
    hkDate: date,
  });
}
