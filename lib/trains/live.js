// Transport for NSW Trip Planner → the board's journey shape.
//
// The timetable model in plan.js is an estimate and says so. When a
// TFNSW_API_KEY is configured, api/trains.js asks the real Trip Planner
// instead and this module reshapes the answer into exactly what plan.js
// produces, so trains/index.html has one renderer and one set of field names
// whichever source it is reading.
//
// It is deliberately strict. A journey it cannot understand — an unexpected
// number of rail legs, a station it cannot place, a missing time — is
// dropped rather than guessed at, and if that leaves nothing the caller falls
// back to the model. A board that quietly shows a wrong platform is worse
// than one that admits it is working from a timetable.

import { STATIONS, TRANSFERS } from './network.js';
import { sydneyClock } from './plan.js';

/** Product classes in the Trip Planner response. */
const CLASS_TRAIN = 1;
const CLASS_METRO = 2;

/** Sydney Trains marks these as "the train is running late/early" text. */
const RAIL_CLASSES = new Set([CLASS_TRAIN, CLASS_METRO]);

/** "Chatswood Station, Platform 1" and friends → 'chatswood'. */
export function stationKeyFor(name) {
  if (!name) return null;
  const cleaned = String(name)
    .split(',')[0]
    .replace(/\b(station|light rail|metro)\b/gi, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
  if (!cleaned) return null;
  return (
    Object.keys(STATIONS).find(
      (key) => STATIONS[key].en.replace(/[^a-z]/gi, '').toLowerCase() === cleaned,
    ) || null
  );
}

/** "Platform 25", "Plat 25", { platform: '25' } → '25'. */
export function platformFrom(place) {
  const fromProperties = place?.properties?.platform || place?.properties?.platformName;
  if (fromProperties) return String(fromProperties).replace(/^(platform|plat)\s*/i, '').trim() || null;
  const match = /\bplat(?:form)?\s*([\w/ -]+)$/i.exec(place?.disassembledName || place?.name || '');
  return match ? match[1].trim() : null;
}

function timeOf(place, kind) {
  return (
    place?.[`${kind}TimeEstimated`] ||
    place?.[`${kind}TimePlanned`] ||
    place?.[`${kind}TimeBaseTimetable`] ||
    null
  );
}

/** Is this leg a real train ride, as opposed to a walk between platforms? */
function isRailLeg(leg) {
  return RAIL_CLASSES.has(Number(leg?.transportation?.product?.class));
}

/**
 * Reshape a Trip Planner payload into ranked journeys.
 *
 * @param {object} payload  parsed rapidJSON response
 * @param {object} options
 * @param {Date}   options.now
 * @param {string} options.origin       station key the board asked for
 * @param {string} options.destination  station key the board asked for
 */
export function mapTripJourneys(payload, { now, origin, destination }) {
  const nowMinute = sydneyClock(now).minuteOfDay;
  // A time before "now" is tomorrow's, not one that has already happened: the
  // board is only ever shown departures ahead of it.
  const toMinute = (iso) => {
    if (!iso) return null;
    const minute = sydneyClock(new Date(iso)).minuteOfDay;
    return minute < nowMinute - 60 ? minute + 1440 : minute;
  };

  const journeys = [];
  for (const journey of payload?.journeys || []) {
    const mapped = mapOne(journey, { toMinute, origin, destination });
    if (mapped) journeys.push(mapped);
  }

  journeys.sort(
    (a, b) => a.arriveMinute - b.arriveMinute || a.totalMinutes - b.totalMinutes,
  );

  const seenInterchange = new Set();
  journeys.forEach((mapped, index) => {
    mapped.isBest = index === 0;
    mapped.isBestForInterchange = !seenInterchange.has(mapped.via);
    seenInterchange.add(mapped.via);
  });

  return journeys;
}

function mapOne(journey, { toMinute, origin, destination }) {
  const railLegs = (journey?.legs || []).filter(isRailLeg);
  // Chatswood ⇄ Hurstville is one Metro leg and one suburban leg. Anything
  // else — a bus replacement, a three-change diversion — is outside what this
  // board knows how to draw, so it is left out rather than half-rendered.
  if (railLegs.length !== 2) return null;

  const legs = railLegs.map(mapLeg(toMinute));
  if (legs.some((leg) => leg === null)) return null;
  const [leg1, leg2] = legs;

  if (leg1.from !== origin || leg2.to !== destination) return null;
  if (leg1.to !== leg2.from) return null;

  const via = leg1.to;
  const transfer = TRANSFERS[via];
  if (!transfer) return null;

  // The walk is whatever is left between getting off and getting on: the real
  // answer for this concourse today, not the brief's estimate.
  const gap = leg2.departMinute - leg1.arriveMinute;
  const walkMinutes = Math.min(transfer.walkMinutes, Math.max(0, gap));

  return {
    via,
    viaName: STATIONS[via],
    departMinute: leg1.departMinute,
    arriveMinute: leg2.arriveMinute,
    totalMinutes: leg2.arriveMinute - leg1.departMinute,
    waitMinutes: Math.max(0, gap - walkMinutes),
    transfer: {
      station: via,
      walkMinutes,
      note: transfer.note,
      toPlatform: leg2.boardPlatform,
    },
    leg1,
    leg2,
    sameTrainAlso: [],
    realtime: legs.some((leg) => leg.realtime),
  };
}

const mapLeg = (toMinute) => (leg) => {
  const from = stationKeyFor(leg?.origin?.parent?.name || leg?.origin?.name);
  const to = stationKeyFor(leg?.destination?.parent?.name || leg?.destination?.name);
  const departMinute = toMinute(timeOf(leg?.origin, 'departure'));
  const arriveMinute = toMinute(timeOf(leg?.destination, 'arrival'));
  if (!from || !to || departMinute === null || arriveMinute === null) return null;

  const product = leg.transportation?.product || {};
  const line = leg.transportation?.disassembledName || leg.transportation?.number || '';
  const sequence = (leg.stopSequence || [])
    .map((stop) => ({
      station: stationKeyFor(stop.parent?.name || stop.name),
      minute: toMinute(timeOf(stop, 'arrival') || timeOf(stop, 'departure')),
      name: stop.parent?.name || stop.name,
    }))
    .filter((stop) => stop.minute !== null);

  // Trim the sequence to what is between boarding and alighting, and drop the
  // two ends: "3 stops, then get off" counts the ones in between.
  const first = sequence.findIndex((stop) => stop.station === from);
  const last = sequence.findLastIndex((stop) => stop.station === to);
  const stops = first >= 0 && last > first ? sequence.slice(first + 1, last) : [];

  return {
    serviceId: `${line || product.name || 'rail'}@${departMinute}`,
    anchor: departMinute,
    mode: Number(product.class) === CLASS_METRO ? 'metro' : 'train',
    line,
    lineLabel: labelFor(line, product),
    speed: speedFor(stops.length, Number(product.class)),
    headsign: headsignFor(leg),
    from,
    to,
    boardPlatform: platformFrom(leg?.origin),
    departMinute,
    arriveMinute,
    rideMinutes: arriveMinute - departMinute,
    stops: stops.map(({ station, minute, name }) => ({ station, minute, name })),
    stopCount: stops.length,
    realtime: Boolean(timeOf(leg?.origin, 'departure') === leg?.origin?.departureTimeEstimated),
  };
};

function labelFor(line, product) {
  if (Number(product.class) === CLASS_METRO) return { en: `Metro ${line || 'M1'}`, zh: `地鐵 ${line || 'M1'}` };
  if (line === 'SCO') return { en: 'South Coast Line', zh: '南海岸線' };
  if (line) return { en: `${line} Line`, zh: `${line} 線` };
  return { en: product.name || 'Train', zh: '火車' };
}

function headsignFor(leg) {
  const name = leg?.transportation?.destination?.name || leg?.transportation?.description || '';
  const trimmed = name.replace(/\s*Station$/i, '').trim();
  if (!trimmed) return { en: '', zh: '' };
  return { en: `towards ${trimmed}`, zh: `往 ${trimmed} 方向` };
}

/**
 * Live data has no pattern name, so the speed label is read off the number of
 * stops actually made — which is what "limited stops" means to a passenger.
 */
function speedFor(stopCount, productClass) {
  if (productClass === CLASS_METRO) return { key: 'allStops', en: 'All stops', zh: '每站停' };
  if (stopCount <= 2) return { key: 'express', en: 'Express', zh: '特快' };
  if (stopCount <= 6) return { key: 'limited', en: 'Limited stops', zh: '快車 · 部分站停' };
  return { key: 'allStops', en: 'All stops', zh: '每站停' };
}
