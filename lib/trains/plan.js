// Journey planner for the Chatswood ⇄ Hurstville board.
//
// Given a moment in time it answers one question: of everything leaving in the
// next thirty minutes, which combination of Metro and suburban train puts you
// at the other end soonest, from which platform, and where do you get off.
//
// Pure and deterministic — no clock reads, no network. The caller passes the
// `now` it wants planned, which is what makes the ranking testable and what
// lets the same module run in the browser and under node --test.

import {
  CONNECTION_BUFFER,
  INTERCHANGES,
  METRO_NORTH,
  METRO_SOUTH,
  NORTHBOUND_SUBURBAN,
  SERVICE_END,
  SERVICE_START,
  SLOW_WALK_EXTRA,
  SOUTHBOUND_SUBURBAN,
  TRANSFERS,
  callAt,
  daypartAt,
  daypartsFor,
  stationName,
} from './network.js';

export const DIRECTIONS = {
  toHurstville: {
    key: 'toHurstville',
    origin: 'chatswood',
    destination: 'hurstville',
    label: { en: 'Chatswood → Hurstville', zh: '車士活 → 好市圍' },
    leg1: [METRO_SOUTH],
    leg2: SOUTHBOUND_SUBURBAN,
  },
  toChatswood: {
    key: 'toChatswood',
    origin: 'hurstville',
    destination: 'chatswood',
    label: { en: 'Hurstville → Chatswood', zh: '好市圍 → 車士活' },
    leg1: NORTHBOUND_SUBURBAN,
    leg2: [METRO_NORTH],
  },
};

/** How far ahead to look when nothing at all leaves inside the window. */
const EXTENDED_WINDOW = 180;

/**
 * Departures closer than this are not offered. A board that opens with a
 * train leaving in under a minute is offering something nobody can catch,
 * and for a reader who is still at home it is worse than useless.
 */
export const MIN_LEAD_MINUTES = 3;

// ---------------------------------------------------------------------------
// Sydney wall clock
//
// The grandparents' phones are on Sydney time, but nothing here relies on
// that: the timetable is reasoned about in Sydney wall-clock minutes whatever
// the device is set to, so the board is still right on a phone left on Hong
// Kong time after a visit.

const SYDNEY_PARTS = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney',
  hourCycle: 'h23',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Wall-clock position of a moment in Sydney. */
export function sydneyClock(now) {
  const parts = Object.fromEntries(
    SYDNEY_PARTS.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekday = parts.weekday;
  return {
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    weekday,
    isWeekend: weekday === 'Sat' || weekday === 'Sun',
  };
}

/**
 * The clock a timetable is read against, which is not quite the wall clock:
 * a train at 00:20 belongs to the day that started five hours ago, not to the
 * one that started twenty minutes ago. Before 01:00, time keeps counting up
 * from yesterday — 00:20 is minute 1460 of Saturday, not minute 20 of Sunday.
 */
export function serviceClock(now) {
  const clock = sydneyClock(now);
  if (clock.minuteOfDay + 1440 < SERVICE_END) {
    const yesterday = sydneyClock(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    return {
      minuteOfDay: clock.minuteOfDay + 1440,
      weekday: yesterday.weekday,
      isWeekend: yesterday.isWeekend,
      afterMidnight: true,
    };
  }
  return { ...clock, afterMidnight: false };
}

/** "HH:MM" for a wall-clock minute, wrapping past midnight. */
export function formatClock(minute) {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Departure generation

/**
 * Anchor times (the service's own zero point) at which a pattern runs, across
 * a whole service day. Headways are applied per daypart, so the same pattern
 * thins out in the evening without needing a second definition.
 */
export function serviceAnchors(service, isWeekend, fromAnchor, toAnchor) {
  const anchors = [];
  for (const daypart of daypartsFor(isWeekend)) {
    const headway = service.headways[daypart.key];
    if (!headway) continue;
    const lo = Math.max(daypart.from, fromAnchor, SERVICE_START);
    const hi = Math.min(daypart.to, toAnchor, SERVICE_END);
    if (lo > hi) continue;
    // First anchor at or after `lo` that sits on this daypart's cadence.
    const offset = service.offset % headway;
    let first = Math.ceil((lo - offset) / headway) * headway + offset;
    for (let m = first; m <= hi; m += headway) anchors.push(m);
  }
  return anchors.sort((a, b) => a - b);
}

/** Departures of one service from one station, within a wall-clock window. */
function departuresFrom(service, station, isWeekend, from, to) {
  const call = callAt(service, station);
  if (!call) return [];
  return serviceAnchors(service, isWeekend, from - call.t, to - call.t).map((anchor) => ({
    service,
    anchor,
    departMinute: anchor + call.t,
  }));
}

// ---------------------------------------------------------------------------
// Legs

/** One boarded-to-alighted ride, with the stops in between spelled out. */
function buildLeg(service, anchor, fromStation, toStation) {
  const calls = service.calls;
  const i = calls.findIndex((c) => c.station === fromStation);
  const j = calls.findIndex((c) => c.station === toStation);
  if (i < 0 || j < 0 || j <= i) return null;
  const slice = calls.slice(i, j + 1);
  return {
    serviceId: service.id,
    anchor,
    mode: service.mode,
    line: service.line,
    lineLabel: service.lineLabel,
    speed: service.speed,
    headsign: service.headsign,
    from: fromStation,
    to: toStation,
    boardPlatform: slice[0].platform || null,
    departMinute: anchor + slice[0].t,
    arriveMinute: anchor + slice[slice.length - 1].t,
    rideMinutes: slice[slice.length - 1].t - slice[0].t,
    // Intermediate stops only — "4 stops, then get off" is the number a
    // passenger counts, and it excludes the one they are standing at.
    stops: slice.slice(1, -1).map((c) => ({ station: c.station, minute: anchor + c.t })),
    stopCount: slice.length - 2,
  };
}

// ---------------------------------------------------------------------------
// Planning

/**
 * Every journey leaving `origin` inside the window, ranked by arrival time.
 *
 * @param {object} options
 * @param {Date}   options.now
 * @param {string} [options.direction]   'toHurstville' | 'toChatswood'
 * @param {boolean}[options.slowWalk]    add SLOW_WALK_EXTRA to every transfer
 * @param {number} [options.windowMinutes]
 * @param {number} [options.maxPerInterchange]
 */
export function planJourneys({
  now,
  direction = 'toHurstville',
  slowWalk = false,
  windowMinutes = 30,
  maxPerInterchange = 3,
  minLeadMinutes = MIN_LEAD_MINUTES,
} = {}) {
  const dir = DIRECTIONS[direction] || DIRECTIONS.toHurstville;
  const clock = serviceClock(now);
  const extraWalk = slowWalk ? SLOW_WALK_EXTRA : 0;
  const collectFor = (window) =>
    collect(dir, clock, minLeadMinutes, window, extraWalk, maxPerInterchange);

  let journeys = collectFor(windowMinutes);
  let extended = false;
  let nextDay = false;

  if (journeys.length === 0) {
    // Nothing in the next half hour — late at night, or before the first
    // train. Showing an empty board would leave the reader stuck, so look
    // further ahead and say plainly that this is what comes next.
    const reachMorning = SERVICE_START + 180 - clock.minuteOfDay;
    journeys = collectFor(Math.max(EXTENDED_WINDOW, reachMorning));
    extended = journeys.length > 0;
  }

  if (journeys.length === 0) {
    // Past the last connection of the night. Plan the first services of the
    // next morning instead and carry them back onto the reader's own clock,
    // so "05:03" still reads as five and a half hours away rather than as
    // something that happened before they woke up.
    journeys = planNextMorning(dir, now, clock, extraWalk, maxPerInterchange);
    extended = journeys.length > 0;
    nextDay = extended;
  }

  journeys.forEach((journey, index) => {
    journey.isBest = index === 0;
  });
  const seenInterchange = new Set();
  for (const journey of journeys) {
    journey.isBestForInterchange = !seenInterchange.has(journey.via);
    seenInterchange.add(journey.via);
  }

  return {
    source: 'timetable-model',
    generatedAt: now.toISOString(),
    direction: dir.key,
    origin: dir.origin,
    destination: dir.destination,
    nowMinute: clock.minuteOfDay,
    isWeekend: clock.isWeekend,
    windowMinutes,
    minLeadMinutes,
    extended,
    nextDay,
    inService: daypartAt(clock.minuteOfDay, clock.isWeekend) !== null,
    journeys,
  };
}

/**
 * Trim journeys from either source to the board's window, and re-mark the
 * best of what is left.
 *
 * The model applies this while planning; live data arrives already ranked and
 * unfiltered, so the page runs it over that instead. Both boards then obey
 * the same rule: the next thirty minutes, or — when nothing runs in the next
 * thirty minutes — whatever comes after that, clearly flagged.
 */
export function windowJourneys(
  journeys,
  nowMinute,
  { minLeadMinutes = MIN_LEAD_MINUTES, windowMinutes = 30 } = {},
) {
  const catchable = journeys.filter((j) => j.departMinute >= nowMinute + minLeadMinutes);
  const inWindow = catchable.filter((j) => j.departMinute <= nowMinute + windowMinutes);
  const kept = inWindow.length > 0 ? inWindow : catchable;

  const seenInterchange = new Set();
  kept.forEach((journey, index) => {
    journey.isBest = index === 0;
    journey.isBestForInterchange = !seenInterchange.has(journey.via);
    seenInterchange.add(journey.via);
  });

  return { journeys: kept, extended: inWindow.length === 0 && kept.length > 0 };
}

/** The first services of the next service day, on today's minute scale. */
function planNextMorning(dir, now, clock, extraWalk, maxPerInterchange) {
  const untilMorning =
    (clock.minuteOfDay >= SERVICE_START ? 1440 : 0) + SERVICE_START - clock.minuteOfDay;
  const morning = new Date(now.getTime() + untilMorning * 60000);
  const morningClock = serviceClock(morning);

  const journeys = collect(dir, morningClock, 0, 180, extraWalk, maxPerInterchange);
  const shift = clock.minuteOfDay + untilMorning - morningClock.minuteOfDay;
  if (shift !== 0) for (const journey of journeys) shiftJourney(journey, shift);
  return journeys;
}

/** Move a whole journey along the minute scale, stop times and all. */
function shiftJourney(journey, delta) {
  journey.departMinute += delta;
  journey.arriveMinute += delta;
  for (const leg of [journey.leg1, journey.leg2]) {
    leg.anchor += delta;
    leg.departMinute += delta;
    leg.arriveMinute += delta;
    for (const stop of leg.stops) stop.minute += delta;
  }
  for (const alt of journey.sameTrainAlso || []) {
    alt.departMinute += delta;
    alt.boardMinute += delta;
  }
}

function collect(dir, clock, minLeadMinutes, windowMinutes, extraWalk, maxPerInterchange) {
  const from = clock.minuteOfDay + minLeadMinutes;
  const to = clock.minuteOfDay + windowMinutes;
  const found = [];

  for (const via of INTERCHANGES) {
    const transfer = TRANSFERS[via];
    const perInterchange = [];

    for (const service1 of dir.leg1) {
      for (const { anchor, departMinute } of departuresFrom(service1, dir.origin, clock.isWeekend, from, to)) {
        const leg1 = buildLeg(service1, anchor, dir.origin, via);
        if (!leg1) continue;

        const walkMinutes = transfer.walkMinutes + extraWalk;
        const readyMinute = leg1.arriveMinute + walkMinutes + CONNECTION_BUFFER;

        const connection = earliestConnection(dir.leg2, via, dir.destination, clock.isWeekend, readyMinute);
        if (!connection) continue;

        const { leg2 } = connection;
        perInterchange.push({
          via,
          viaName: stationName(via),
          departMinute: leg1.departMinute,
          arriveMinute: leg2.arriveMinute,
          totalMinutes: leg2.arriveMinute - leg1.departMinute,
          waitMinutes: leg2.departMinute - leg1.arriveMinute - walkMinutes,
          transfer: {
            station: via,
            walkMinutes,
            note: transfer.note,
            toPlatform: leg2.boardPlatform,
          },
          leg1,
          leg2,
        });
      }
    }

    // Several Metro departures can feed the same connecting train. They all
    // arrive together, so keep only the one that leaves home latest — the
    // others are just extra minutes on a platform.
    const byConnection = new Map();
    for (const journey of perInterchange) {
      const key = `${journey.leg2.serviceId}@${journey.leg2.departMinute}`;
      const kept = byConnection.get(key);
      if (!kept || journey.departMinute > kept.departMinute) byConnection.set(key, journey);
    }

    found.push(...byConnection.values());
  }

  return capPerInterchange(rank(mergeSameTrain(found)), maxPerInterchange);
}

/**
 * Martin Place, Central and Sydenham are three doors onto the same train, so
 * the naive board lists one 08:25 arrival three times over. Collapse them to
 * the shortest of the three and keep the others as "you could also board
 * here" — the earlier boarding points are where you get a seat, which is
 * worth saying, but not worth three rows that all arrive in the same minute.
 */
function mergeSameTrain(journeys) {
  const groups = new Map();
  for (const journey of journeys) {
    const key = `${journey.leg2.serviceId}@${journey.leg2.anchor}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(journey);
  }

  return [...groups.values()].map((group) => {
    // Same arrival, so the best of the group is the one that spends least of
    // the journey standing still: shortest overall, then least waiting on the
    // interchange platform, then least walking. That is usually the option
    // that stays on the Metro longest, which is also the warmest and the one
    // with a seat.
    const winner = group.reduce((best, journey) =>
      compareStanding(journey, best) < 0 ? journey : best,
    );
    winner.sameTrainAlso = group
      .filter((journey) => journey !== winner)
      .map((journey) => ({
        via: journey.via,
        viaName: journey.viaName,
        departMinute: journey.departMinute,
        boardMinute: journey.leg2.departMinute,
        platform: journey.leg2.boardPlatform,
        totalMinutes: journey.totalMinutes,
      }))
      .sort((a, b) => a.boardMinute - b.boardMinute);
    return winner;
  });
}

/** Keep the board short: at most a few departures through any one interchange. */
function capPerInterchange(journeys, limit) {
  const counts = new Map();
  return journeys.filter((journey) => {
    const used = counts.get(journey.via) || 0;
    if (used >= limit) return false;
    counts.set(journey.via, used + 1);
    return true;
  });
}

/** The first train from `station` a passenger ready at `readyMinute` can board. */
function earliestConnection(services, station, destination, isWeekend, readyMinute) {
  let best = null;
  for (const service of services) {
    const call = callAt(service, station);
    if (!call || !callAt(service, destination)) continue;
    for (const { anchor, departMinute } of departuresFrom(
      service,
      station,
      isWeekend,
      readyMinute,
      readyMinute + EXTENDED_WINDOW,
    )) {
      if (departMinute < readyMinute) continue;
      const leg2 = buildLeg(service, anchor, station, destination);
      if (!leg2) continue;
      // Earliest arrival wins, not earliest departure: a slow all-stops train
      // leaving first is not the better ride if the semi-fast behind it
      // overtakes on the way.
      if (!best || leg2.arriveMinute < best.leg2.arriveMinute) best = { leg2 };
      break;
    }
  }
  return best;
}

/**
 * Soonest arrival first — for someone deciding now, the journey that puts
 * them at the other end earliest is the shortest commute, whatever its own
 * running time. Ties fall through to the least standing about.
 */
function rank(journeys) {
  return journeys.sort((a, b) => a.arriveMinute - b.arriveMinute || compareStanding(a, b));
}

function compareStanding(a, b) {
  return (
    a.totalMinutes - b.totalMinutes ||
    a.waitMinutes - b.waitMinutes ||
    a.transfer.walkMinutes - b.transfer.walkMinutes ||
    a.via.localeCompare(b.via)
  );
}
