// Cathay fare tracker — consolidated API (one function, ?op= multiplexed,
// same pattern and same reason as api/whatsapp/tasks.js and api/notes.js:
// the Hobby plan's function budget). Public paths via vercel.json rewrites:
//
//   GET/POST/PATCH /api/flights/watches    -> ?op=watches   manage tracked routes
//   GET/POST/PATCH /flights/api/watches    -> ?op=watches   same, under /flights so the
//                                             browser reuses the page's basic-auth creds
//   GET            /api/flights/cron/track -> ?op=track     the twice-daily sweep
//                                             (add ?force=1 to override freshness)
//
// Auth: watches requires basic auth (FLIGHTS_USER/FLIGHTS_PASS) — checked
// here as well as in middleware, because the bare /api/flights path is
// reachable without passing the middleware matcher. track requires
// `Authorization: Bearer ${CRON_SECRET}`.
//
// Nothing here logs credentials or full offer payloads.

import { timingSafeEqual } from 'node:crypto';
import { dbConfigured, query } from '../lib/flights/db.js';
import {
  AmadeusRateLimited,
  amadeusConfigured,
  amadeusEnvironment,
  fareTypeFromBrand,
  searchFlightOffers,
} from '../lib/flights/amadeus.js';
import { LCC_BLOCKLIST, offerPassesCarrierFilter } from '../lib/flights/carriers.js';
import { AIRPORTS, greatCircleMiles, statusPoints, zoneForSector } from '../lib/flights/status-points.js';

const CABINS = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];

export default async function handler(req, res) {
  const op = req.query?.op;
  try {
    if (op === 'watches') return await watchesOp(req, res);
    if (op === 'track') return await trackOp(req, res);
    return res.status(404).json({ error: 'unknown op' });
  } catch (err) {
    console.error('flights api error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
}

// ---------------------------------------------------------------------------
// Auth

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still burn a comparison so length alone doesn't short-circuit timing.
    timingSafeEqual(bb, bb);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function basicAuthOk(req) {
  const user = process.env.FLIGHTS_USER;
  const pass = process.env.FLIGHTS_PASS;
  if (!user || !pass) return false; // fail closed
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i === -1) return false;
  return safeEqual(decoded.slice(0, i), user) & safeEqual(decoded.slice(i + 1), pass);
}

function cronAuthOk(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') && safeEqual(header.slice(7), secret);
}

// ---------------------------------------------------------------------------
// op=watches — GET list, POST create, PATCH activate/deactivate

async function watchesOp(req, res) {
  if (!basicAuthOk(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="flights"');
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!dbConfigured()) {
    // Reads degrade gracefully — the planner works without a database and
    // the UI says so plainly. Writes fail loudly.
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, dbConfigured: false, watches: [] });
    }
    return res.status(503).json({ error: 'DATABASE_URL not set' });
  }

  if (req.method === 'GET') {
    const { rows } = await query(
      `select w.*,
              s.observations, s.all_time_low, s.median_price, s.latest_price,
              s.last_checked, s.best_cpp,
              q.carrier as latest_carrier, q.booking_class as latest_class,
              q.fare_type as latest_fare_type, q.status_points as latest_points,
              q.points_upper_bound as latest_points_upper_bound,
              q.environment as latest_environment, q.depart_date as latest_depart_date
         from watches w
         left join watch_stats s on s.watch_id = w.id
         left join lateral (
           select * from quotes q where q.watch_id = w.id
           order by q.fetched_at desc limit 1
         ) q on true
        order by w.created_at desc`,
    );
    return res.status(200).json({ ok: true, dbConfigured: true, watches: rows });
  }

  if (req.method === 'POST') {
    const b = jsonBody(req);
    const bad = validateWatch(b);
    if (bad) return res.status(400).json({ error: bad });
    const { rows } = await query(
      `insert into watches
         (origin, destination, depart_from, depart_to, trip_days, cabin,
          airlines_only, exclude_lcc, max_price, target_cpp, active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
       returning *`,
      [
        b.origin.toUpperCase(), b.destination.toUpperCase(),
        b.depart_from, b.depart_to,
        b.trip_days ?? null,
        b.cabin ?? 'ECONOMY',
        b.airlines_only?.length ? b.airlines_only.map((c) => String(c).toUpperCase()) : null,
        b.exclude_lcc !== false,
        b.max_price ?? null,
        b.target_cpp ?? null,
      ],
    );
    return res.status(201).json({ ok: true, watch: rows[0] });
  }

  if (req.method === 'PATCH') {
    const b = jsonBody(req);
    if (!Number.isInteger(b.id) || typeof b.active !== 'boolean') {
      return res.status(400).json({ error: 'expected { id, active }' });
    }
    const { rows } = await query('update watches set active = $2 where id = $1 returning *', [b.id, b.active]);
    if (!rows.length) return res.status(404).json({ error: 'no such watch' });
    return res.status(200).json({ ok: true, watch: rows[0] });
  }

  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).json({ error: 'method not allowed' });
}

function jsonBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function validateWatch(b) {
  const iata = /^[A-Za-z]{3}$/;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!iata.test(b.origin ?? '')) return 'origin must be a 3-letter IATA code';
  if (!iata.test(b.destination ?? '')) return 'destination must be a 3-letter IATA code';
  if (!date.test(b.depart_from ?? '') || !date.test(b.depart_to ?? '')) {
    return 'depart_from and depart_to must be YYYY-MM-DD';
  }
  if (b.depart_from > b.depart_to) return 'depart_from must not be after depart_to';
  if (b.trip_days != null && (!Number.isInteger(b.trip_days) || b.trip_days < 1 || b.trip_days > 60)) {
    return 'trip_days must be an integer 1–60';
  }
  if (b.cabin != null && !CABINS.includes(b.cabin)) return `cabin must be one of ${CABINS.join(', ')}`;
  if (b.airlines_only != null && (!Array.isArray(b.airlines_only) || b.airlines_only.some((c) => !/^[A-Za-z0-9]{2}$/.test(c)))) {
    return 'airlines_only must be an array of 2-character airline codes';
  }
  if (b.max_price != null && !(Number(b.max_price) > 0)) return 'max_price must be positive';
  if (b.target_cpp != null && !(Number(b.target_cpp) > 0)) return 'target_cpp must be positive';
  return null;
}

// ---------------------------------------------------------------------------
// op=track — the twice-daily sweep

async function trackOp(req, res) {
  if (!cronAuthOk(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!dbConfigured()) return res.status(503).json({ error: 'DATABASE_URL not set' });
  if (!amadeusConfigured()) return res.status(503).json({ error: 'Amadeus credentials not set' });

  const force = req.query?.force === '1';
  const minGapHours = Number(process.env.MIN_GAP_HOURS || 10);
  const maxDates = Number(process.env.MAX_DATES_PER_WATCH || 5);
  const environment = amadeusEnvironment();

  const { rows: watches } = await query(
    `select w.*, (select max(fetched_at) from quotes q where q.watch_id = w.id) as last_fetched
       from watches w where w.active order by w.id`,
  );

  const results = [];
  const alertsSent = [];
  let stoppedOn429 = false;

  for (const watch of watches) {
    if (stoppedOn429) { results.push({ watch: watch.id, status: 'skipped_rate_limited' }); continue; }

    // Freshness guard: manual triggers and platform retries must not
    // double-spend quota. ?force=1 overrides.
    if (!force && watch.last_fetched && Date.now() - new Date(watch.last_fetched).getTime() < minGapHours * 3600_000) {
      results.push({ watch: watch.id, status: 'skipped_fresh' });
      continue;
    }

    const dates = sampleDates(watch.depart_from, watch.depart_to, maxDates);
    let best = null;
    try {
      for (const departureDate of dates) {
        const offers = await searchFlightOffers({
          origin: watch.origin,
          destination: watch.destination,
          departureDate,
          returnDate: watch.trip_days ? addDays(departureDate, watch.trip_days) : undefined,
          cabin: watch.cabin,
          // Allowlist preferred; blocklist only when there is no allowlist.
          includedAirlineCodes: watch.airlines_only ?? undefined,
          excludedAirlineCodes: !watch.airlines_only?.length && watch.exclude_lcc ? LCC_BLOCKLIST : undefined,
        });
        for (const offer of offers) {
          // Safety net: re-filter client-side whatever the API claimed to do.
          if (!offerPassesCarrierFilter(offer, { airlinesOnly: watch.airlines_only, excludeLcc: watch.exclude_lcc })) continue;
          const scored = scoreOffer(offer, departureDate);
          if (!scored) continue;
          if (!best || compareScored(scored, best) < 0) best = scored;
        }
      }
    } catch (err) {
      if (err instanceof AmadeusRateLimited || err.rateLimited) {
        // Degrade to partial coverage rather than hammering a limited API.
        stoppedOn429 = true;
        results.push({ watch: watch.id, status: 'stopped_on_429' });
        continue;
      }
      console.error(`watch ${watch.id} sweep error:`, err.message);
      results.push({ watch: watch.id, status: 'error' });
      continue;
    }

    if (!best) { results.push({ watch: watch.id, status: 'no_offers' }); continue; }

    // Baselines BEFORE inserting the new quote, so the new price cannot
    // dilute its own comparison.
    const { rows: [base] } = await query(
      `select min(price) as all_time_low,
              count(*) as observations,
              percentile_cont(0.5) within group (order by price)
                filter (where fetched_at > now() - interval '60 days') as median60,
              count(*) filter (where fetched_at > now() - interval '60 days') as observations60
         from quotes where watch_id = $1`,
      [watch.id],
    );

    const { rows: [quote] } = await query(
      `insert into quotes
         (watch_id, environment, depart_date, return_date, price, carrier,
          booking_class, fare_type, status_points, points_upper_bound, cpp, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [
        watch.id, environment, best.departDate, best.returnDate, best.price,
        best.carrier, best.bookingClass, best.fareType, best.points,
        best.pointsUpperBound, best.cpp, JSON.stringify(best.raw),
      ],
    );

    const newAlerts = await raiseAlerts(watch, best, base, quote.id);
    alertsSent.push(...newAlerts);
    results.push({
      watch: watch.id, status: 'quoted', price: best.price, cpp: best.cpp,
      points: best.points, upperBound: best.pointsUpperBound, alerts: newAlerts.map((a) => a.reason),
    });
  }

  if (alertsSent.length) await sendAlertEmail(alertsSent);

  return res.status(200).json({ ok: true, environment, forced: force, stoppedOn429, results });
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// pg hands date columns back as JS Date objects; normalise either shape.
function isoDay(v) {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

/** Spread up to n sample dates evenly across the window, today onwards. */
export function sampleDates(from, to, n) {
  const today = new Date().toISOString().slice(0, 10);
  const start = isoDay(from) > today ? isoDay(from) : today;
  const end = isoDay(to);
  if (start > end) return [];
  const startD = new Date(`${start}T00:00:00Z`);
  const span = Math.round((new Date(`${end}T00:00:00Z`) - startD) / 86400_000);
  const count = Math.min(n, span + 1);
  const dates = [];
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : Math.round((i * span) / (count - 1));
    dates.push(addDays(start, offset));
  }
  return [...new Set(dates)];
}

/**
 * Price, carrier, class, brand and status points for one offer.
 *
 * Points policy (FLIGHTS.md §6): CX-marketed segments with a known brand
 * score exactly. A CX segment whose brand Amadeus omitted scores the Flex
 * row and marks the whole quote as an UPPER BOUND — never presented as
 * exact. Any partner-marketed segment makes the total null; ranking then
 * falls back to raw price.
 */
export function scoreOffer(offer, departDate) {
  const price = Number(offer.price?.grandTotal ?? offer.price?.total);
  if (!(price > 0)) return null;

  const fareBySegment = new Map();
  for (const fd of offer.travelerPricings?.[0]?.fareDetailsBySegment ?? []) {
    fareBySegment.set(fd.segmentId, fd);
  }

  let points = 0;
  let pointsKnown = true;
  let upperBound = false;
  let firstSegment = null;
  let returnDate = null;

  const itineraries = offer.itineraries ?? [];
  for (let i = 0; i < itineraries.length; i++) {
    for (const seg of itineraries[i].segments ?? []) {
      if (i > 0 && !returnDate) returnDate = seg.departure?.at?.slice(0, 10) ?? null;
      const fd = fareBySegment.get(seg.id);
      const bookingClass = fd?.class ?? null;
      const brand = fareTypeFromBrand(fd?.brandedFare, fd?.brandedFareLabel);
      if (!firstSegment) firstSegment = { carrier: seg.carrierCode, bookingClass, fareType: brand };

      const a = AIRPORTS[seg.departure?.iataCode];
      const b = AIRPORTS[seg.arrival?.iataCode];
      const zone = a && b ? zoneForSector(greatCircleMiles(a, b), a.country, b.country) : null;

      const exact = statusPoints({ marketingCarrier: seg.carrierCode, bookingClass, fareType: brand, zone });
      if (exact != null) { points += exact; continue; }

      if (seg.carrierCode === 'CX' && brand == null && zone) {
        // Brand missing — assume Flex, flag as optimistic.
        const flex = statusPoints({ marketingCarrier: 'CX', bookingClass, fareType: 'flex', zone });
        if (flex != null) { points += flex; upperBound = true; continue; }
      }
      pointsKnown = false; // partner segment or unmodelled combination
    }
  }

  const totalPoints = pointsKnown ? points : null;
  return {
    price,
    carrier: firstSegment?.carrier ?? null,
    bookingClass: firstSegment?.bookingClass ?? null,
    fareType: firstSegment?.fareType ?? (upperBound ? 'unknown' : null),
    points: totalPoints,
    pointsUpperBound: pointsKnown && upperBound,
    cpp: totalPoints ? round2(price / totalPoints) : null,
    departDate,
    returnDate,
    raw: offer,
  };
}

/**
 * Rank by cost per status point where points are known, falling back to raw
 * price where they aren't. Exact-brand quotes outrank upper-bound ones,
 * which outrank points-unknown ones.
 */
export function compareScored(a, b) {
  const tier = (s) => (s.points == null ? 2 : s.pointsUpperBound ? 1 : 0);
  if (tier(a) !== tier(b)) return tier(a) - tier(b);
  if (tier(a) < 2 && a.cpp !== b.cpp) return a.cpp - b.cpp;
  return a.price - b.price;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function raiseAlerts(watch, best, base, quoteId) {
  const candidates = [];
  const observations = Number(base?.observations ?? 0);
  const allTimeLow = base?.all_time_low != null ? Number(base.all_time_low) : null;
  const median60 = base?.median60 != null ? Number(base.median60) : null;
  const observations60 = Number(base?.observations60 ?? 0);

  if (observations > 0 && allTimeLow != null && best.price < allTimeLow) {
    candidates.push({ reason: 'new_low', detail: `HK$${best.price} beats previous low HK$${allTimeLow}` });
  }
  if (watch.max_price != null && best.price <= Number(watch.max_price)) {
    candidates.push({ reason: 'under_ceiling', detail: `HK$${best.price} ≤ ceiling HK$${watch.max_price}` });
  }
  // Only exact points trigger cpp alerts — an upper-bound cpp is optimistic.
  if (watch.target_cpp != null && best.cpp != null && !best.pointsUpperBound && best.cpp <= Number(watch.target_cpp)) {
    candidates.push({ reason: 'cpp_target', detail: `HK$${best.cpp}/pt ≤ target HK$${watch.target_cpp}/pt` });
  }
  if (observations60 >= 5 && median60 != null && best.price <= 0.88 * median60) {
    candidates.push({ reason: 'big_drop', detail: `HK$${best.price} is ≥12% below the 60-day median HK$${round2(median60)}` });
  }

  // 12-hour dedup bucket, computed here — see schema.sql for why the index
  // cannot derive it from sent_at.
  const now = new Date();
  const bucket = `${now.toISOString().slice(0, 10)}T${now.getUTCHours() < 12 ? '00' : '12'}`;

  const sent = [];
  for (const c of candidates) {
    const { rows } = await query(
      `insert into alerts (watch_id, quote_id, reason, bucket, detail)
       values ($1,$2,$3,$4,$5)
       on conflict (watch_id, reason, bucket) do nothing
       returning id`,
      [watch.id, quoteId, c.reason, bucket, c.detail],
    );
    if (rows.length) sent.push({ ...c, watch });
  }
  return sent;
}

async function sendAlertEmail(alerts) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // optional — skip silently
  const from = process.env.ALERT_FROM;
  const to = process.env.ALERT_TO;
  if (!from || !to) return;
  const lines = alerts.map((a) => `• ${a.watch.origin}–${a.watch.destination} [${a.reason}] ${a.detail}`);
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Fare alert: ${alerts.length} hit${alerts.length === 1 ? '' : 's'}`,
        text: `${lines.join('\n')}\n\nhttps://www.mathans.app/flights/`,
      }),
    });
  } catch (err) {
    console.error('alert email failed:', err.message);
  }
}
