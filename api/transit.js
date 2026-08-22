// Public-transport proxies — one function, ?op= multiplexed, same pattern and
// same reason as api/flights.js and api/whatsapp/tasks.js: the Vercel Hobby
// plan allows twelve serverless functions per deployment and they are all
// spoken for. Public paths via vercel.json rewrites:
//
//   GET /api/kmb-route  -> ?op=kmb     KMB bus ETAs along a route (Hong Kong)
//   GET /api/trains     -> ?op=trains  live Chatswood ⇄ Hurstville departures
//
// The KMB half is the former api/kmb-route.js, moved here unchanged; its
// public path and response are exactly as they were, so 3062470030624770
// keeps working without a change.

import { mapTripJourneys } from '../lib/trains/live.js';

export default async function handler(req, res) {
  const op = req.query?.op;
  try {
    if (op === 'trains') return await trainsOp(req, res);
    // No op means the KMB route board, which is what /api/kmb-route rewrites to.
    return await kmbOp(req, res);
  } catch (err) {
    console.error('transit api error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
}

// ---------------------------------------------------------------------------
// KMB bus ETAs (Hong Kong)

const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;
const timeoutFetch = async (url) => {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), 10000);
  try { const r = await fetch(url, { signal: ctl.signal }); return r.json(); }
  finally { clearTimeout(id); }
};

async function kmbOp(req, res) {
  const { route, direction, serviceType = 1, departureStopId, arrivalStopId } = req.query;
  if (!route || !direction || !departureStopId || !arrivalStopId) return res.status(400).json({ error: 'Missing params' });
  const key = `${route}:${direction}:${serviceType}`;
  let seqData = cache.get(key);
  if (!seqData || Date.now() - seqData.t > TTL) {
    const seq = await timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${direction}/${serviceType}`);
    seqData = { t: Date.now(), data: seq.data || [] }; cache.set(key, seqData);
  }
  const a = seqData.data.findIndex(s => s.stop === departureStopId || s.stop_id === departureStopId);
  const b = seqData.data.findIndex(s => s.stop === arrivalStopId || s.stop_id === arrivalStopId);
  if (a < 0 || b < 0 || b < a) return res.status(400).json({ error: 'Invalid stop range' });
  const slice = seqData.data.slice(a, b + 1).map(s => ({ stopId: s.stop || s.stop_id, seq: s.seq }));
  const names = await Promise.all(slice.map(s => timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${s.stopId}`)));
  const depEta = await timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${departureStopId}/${route}/${serviceType}`);
  const first = depEta.data?.find(x => x.eta)?.eta;
  if (!first) return res.status(200).json({ noService: true, stops: [] });
  const t0 = new Date(first);
  const etas = await Promise.all(slice.map(s => timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${s.stopId}/${route}/${serviceType}`)));
  const stops = slice.map((s, i) => {
    const eta = etas[i].data?.find(x => x.eta)?.eta;
    const offsetMinutes = eta ? Math.round((new Date(eta) - t0) / 60000) : 0;
    const projectedTime = new Date(t0.getTime() + offsetMinutes * 60000).toISOString();
    return { stopId: s.stopId, nameEn: names[i].data?.name_en || '', nameTc: names[i].data?.name_tc || '', seq: s.seq, isDeparture: i === 0, isArrival: i === slice.length - 1, projectedTime, offsetMinutes };
  });
  res.status(200).json({ departureTime: t0.toISOString(), totalMinutes: stops.at(-1)?.offsetMinutes || 0, noService: false, stops });
}

// ---------------------------------------------------------------------------
// Live departures for the Chatswood ⇄ Hurstville board
//
// The page works with no key at all — it falls back to the timetable model in
// lib/trains/plan.js and labels itself as estimated. Set TFNSW_API_KEY (free
// from opendata.transport.nsw.gov.au) and this asks the real Trip Planner
// instead, so the board shows the delay a train is actually running and the
// platform it is actually leaving from.
//
// Every failure answers { live: false } with HTTP 200 rather than an error
// status: the caller is two people standing at Chatswood who need a board,
// and the estimated board is a better answer than a red screen.

const TRIP_ENDPOINT = 'https://api.transport.nsw.gov.au/v1/tp/trip';

// Station coordinates rather than stop IDs: they cannot drift with a data
// release, and the Trip Planner resolves them to the same two stations.
const PLACES = {
  chatswood: { coord: '151.18017:-33.79680:EPSG:4326' },
  hurstville: { coord: '151.10270:-33.96730:EPSG:4326' },
};

const ROUTES = {
  toHurstville: { origin: 'chatswood', destination: 'hurstville' },
  toChatswood: { origin: 'hurstville', destination: 'chatswood' },
};

const TRIP_TTL = 45 * 1000;
const TRIP_TIMEOUT = 8000;
const tripCache = new Map();

async function trainsOp(req, res) {
  const key = String(req.query?.direction || 'toHurstville');
  const route = ROUTES[key];
  if (!route) return res.status(400).json({ error: 'unknown direction' });

  const apiKey = process.env.TFNSW_API_KEY;
  if (!apiKey) {
    return trainsRespond(res, { live: false, reason: 'not-configured', direction: key });
  }

  const now = new Date();
  const cached = tripCache.get(key);
  if (cached && now - cached.at < TRIP_TTL) {
    return trainsRespond(res, { ...cached.body, cached: true });
  }

  let payload;
  try {
    payload = await fetchTrip(route, apiKey);
  } catch (err) {
    // Nothing here logs the key or the full upstream body.
    console.error('trip planner:', err.message);
    return trainsRespond(res, { live: false, reason: 'upstream', direction: key });
  }

  const journeys = mapTripJourneys(payload, {
    now,
    origin: route.origin,
    destination: route.destination,
  });

  if (journeys.length === 0) {
    return trainsRespond(res, { live: false, reason: 'no-usable-journeys', direction: key });
  }

  const body = {
    live: true,
    source: 'tfnsw-trip-planner',
    generatedAt: now.toISOString(),
    direction: key,
    origin: route.origin,
    destination: route.destination,
    journeys,
  };
  tripCache.set(key, { at: now, body });
  return trainsRespond(res, body);
}

function trainsRespond(res, body) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  return res.status(200).json(body);
}

async function fetchTrip(route, apiKey) {
  const params = new URLSearchParams({
    outputFormat: 'rapidJSON',
    coordOutputFormat: 'EPSG:4326',
    depArrMacro: 'dep',
    type_origin: 'coord',
    name_origin: PLACES[route.origin].coord,
    type_destination: 'coord',
    name_destination: PLACES[route.destination].coord,
    calcNumberOfTrips: '8',
    TfNSWTR: 'true',
    version: '10.2.1.42',
    // Rail only. A bus replacement is a real answer, but not one this board
    // knows how to draw, and half-drawing it would be worse than saying so.
    excludedMeans: 'checkbox',
    exclMOT_4: '1',
    exclMOT_5: '1',
    exclMOT_7: '1',
    exclMOT_9: '1',
    exclMOT_11: '1',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIP_TIMEOUT);
  try {
    const response = await fetch(`${TRIP_ENDPOINT}?${params}`, {
      headers: { Authorization: `apikey ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`trip planner responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
