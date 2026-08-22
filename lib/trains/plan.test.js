// node --test lib/trains/plan.test.js

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONNECTION_BUFFER,
  METRO_SOUTH,
  T4_PEAK_LIMITED,
  SLOW_WALK_EXTRA,
  TRANSFERS,
  callAt,
} from './network.js';
import { formatClock, planJourneys, serviceAnchors, sydneyClock } from './plan.js';

// August is AEST (UTC+10) — daylight saving does not start until October.
const AEST = (dayIso, hhmm) => new Date(`${dayIso}T${hhmm}:00+10:00`);

const MONDAY = '2026-08-24';
const SATURDAY = '2026-08-22';

test('sydney wall clock is read in Sydney, whatever the device is set to', () => {
  const clock = sydneyClock(AEST(MONDAY, '08:00'));
  assert.equal(clock.minuteOfDay, 8 * 60);
  assert.equal(clock.weekday, 'Mon');
  assert.equal(clock.isWeekend, false);

  assert.equal(sydneyClock(AEST(SATURDAY, '13:45')).isWeekend, true);
});

test('clock formatting pads and wraps past midnight', () => {
  assert.equal(formatClock(5 * 60 + 7), '05:07');
  assert.equal(formatClock(23 * 60 + 59), '23:59');
  assert.equal(formatClock(24 * 60 + 15), '00:15');
});

test('anchors follow the headway of each daypart', () => {
  // Metro runs every 4 minutes through the morning peak.
  const peak = serviceAnchors(METRO_SOUTH, false, 7 * 60, 7 * 60 + 20);
  assert.deepEqual(peak, [420, 424, 428, 432, 436, 440]);

  // ...and every 5 in the interpeak, from the same definition.
  const interpeak = serviceAnchors(METRO_SOUTH, false, 11 * 60, 11 * 60 + 12);
  assert.deepEqual(interpeak, [660, 665, 670]);
});

test('a weekday morning board only offers journeys leaving in the next 30 minutes', () => {
  const now = AEST(MONDAY, '08:00');
  const plan = planJourneys({ now });

  assert.ok(plan.journeys.length >= 3, 'expected a board with several options');
  assert.equal(plan.extended, false);
  assert.equal(plan.inService, true);

  for (const journey of plan.journeys) {
    assert.ok(journey.departMinute >= plan.nowMinute, 'no journey has already left');
    assert.ok(journey.departMinute <= plan.nowMinute + 30, 'no journey beyond the window');
    assert.equal(journey.leg1.from, 'chatswood');
    assert.equal(journey.leg2.to, 'hurstville');
    assert.equal(journey.leg1.to, journey.via);
    assert.equal(journey.leg2.from, journey.via);
  }
});

test('every connection leaves time to walk, including the slower walk', () => {
  for (const slowWalk of [false, true]) {
    for (const hhmm of ['06:40', '08:15', '11:00', '17:30', '21:10']) {
      for (const direction of ['toHurstville', 'toChatswood']) {
        const plan = planJourneys({ now: AEST(MONDAY, hhmm), direction, slowWalk });
        for (const journey of plan.journeys) {
          const expectedWalk = TRANSFERS[journey.via].walkMinutes + (slowWalk ? SLOW_WALK_EXTRA : 0);
          assert.equal(journey.transfer.walkMinutes, expectedWalk);
          assert.ok(
            journey.leg2.departMinute >= journey.leg1.arriveMinute + expectedWalk + CONNECTION_BUFFER,
            `${hhmm} ${direction} via ${journey.via}: connection is too tight`,
          );
          assert.ok(journey.waitMinutes >= CONNECTION_BUFFER);
        }
      }
    }
  }
});

test('the highlighted journey is the one that arrives first', () => {
  for (const hhmm of ['07:20', '10:30', '16:45', '19:30']) {
    const plan = planJourneys({ now: AEST(MONDAY, hhmm) });
    const best = plan.journeys.find((j) => j.isBest);
    assert.ok(best, `${hhmm}: something must be marked best`);
    assert.equal(plan.journeys.indexOf(best), 0);
    for (const journey of plan.journeys) {
      assert.ok(best.arriveMinute <= journey.arriveMinute, `${hhmm}: a later-ranked journey arrives sooner`);
    }
  }
});

test('platform numbers come through, and only where they are known', () => {
  const plan = planJourneys({ now: AEST(MONDAY, '08:00') });
  const expected = { martinPlace: '2', central: '25', sydenham: '3 / 4' };

  for (const journey of plan.journeys) {
    assert.equal(journey.leg1.boardPlatform, '1 / 2', 'Chatswood Metro platform');
    assert.equal(journey.leg2.boardPlatform, expected[journey.via]);
    assert.equal(journey.transfer.toPlatform, journey.leg2.boardPlatform);
  }

  // Northbound platforms were never documented, so the app must be told to
  // say "read the indicator board" rather than shown an invented number.
  const back = planJourneys({ now: AEST(MONDAY, '08:00'), direction: 'toChatswood' });
  for (const journey of back.journeys) {
    assert.equal(journey.leg1.boardPlatform, null);
    assert.equal(journey.leg2.boardPlatform, null);
    assert.ok(journey.leg1.headsign.en.length > 0, 'the headsign stands in for the platform');
  }
});

test('South Coast expresses are offered in the peak and not outside it', () => {
  const peak = planJourneys({ now: AEST(MONDAY, '07:30'), maxPerInterchange: 5 });
  const sco = peak.journeys.find((j) => j.leg2.line === 'SCO');
  assert.ok(sco, 'a peak board should be able to reach an SCO express');
  assert.equal(sco.via, 'central', 'SCO is boarded at Central');
  assert.equal(sco.leg2.stopCount, 2, 'Redfern and Wolli Creek, then Hurstville');

  for (const hhmm of ['11:00', '13:20', '21:00']) {
    const offPeak = planJourneys({ now: AEST(MONDAY, hhmm), maxPerInterchange: 5 });
    assert.ok(
      !offPeak.journeys.some((j) => j.leg2.line === 'SCO'),
      `${hhmm}: SCO expresses do not run off-peak`,
    );
  }

  const weekend = planJourneys({ now: AEST(SATURDAY, '11:00'), maxPerInterchange: 5 });
  assert.ok(!weekend.journeys.some((j) => j.leg2.line === 'SCO'));
});

test('peak limited-stops trains run past Sydenham, so Sydenham cannot offer them', () => {
  assert.equal(callAt(T4_PEAK_LIMITED, 'sydenham'), undefined);
  const plan = planJourneys({ now: AEST(MONDAY, '08:00'), maxPerInterchange: 5 });
  const offered = [...plan.journeys, ...plan.journeys.flatMap((j) => j.sameTrainAlso || [])];
  for (const journey of plan.journeys) {
    if (journey.leg2.serviceId !== 't4-peak-limited') continue;
    assert.notEqual(journey.via, 'sydenham');
    for (const alt of journey.sameTrainAlso) assert.notEqual(alt.via, 'sydenham');
  }
  assert.ok(offered.length >= plan.journeys.length);
});

test('the stop list is what a passenger counts, and it ends at the right station', () => {
  const plan = planJourneys({ now: AEST(MONDAY, '10:00') });
  const viaMartinPlace = plan.journeys.find((j) => j.via === 'martinPlace');
  assert.ok(viaMartinPlace);

  assert.deepEqual(
    viaMartinPlace.leg1.stops.map((s) => s.station),
    ['crowsNest', 'victoriaCross', 'barangaroo'],
  );
  assert.equal(viaMartinPlace.leg1.stopCount, 3, 'three stops, then Martin Place is the fourth');
  assert.equal(viaMartinPlace.leg1.rideMinutes, 11);
  assert.ok(viaMartinPlace.leg2.stops.every((s) => s.station !== 'hurstville'));
});

test('one connecting train is never offered twice', () => {
  const plan = planJourneys({ now: AEST(MONDAY, '08:00'), maxPerInterchange: 5 });
  const seen = new Set();
  for (const journey of plan.journeys) {
    const key = `${journey.via}|${journey.leg2.serviceId}|${journey.leg2.departMinute}`;
    assert.ok(!seen.has(key), 'the same connection appeared twice');
    seen.add(key);
  }
});

test('a duplicate connection keeps the departure that waits least', () => {
  // Metro every 4 minutes into a T4 every 15 guarantees several feeds per
  // connecting train; the board should show the last one that still makes it.
  const plan = planJourneys({ now: AEST(MONDAY, '08:00'), maxPerInterchange: 5 });
  const metroHeadway = 4;
  const windowEnd = plan.nowMinute + plan.windowMinutes;
  for (const journey of plan.journeys) {
    // Skip the edge of the window, where the better-timed Metro simply has
    // not been offered yet.
    if (journey.departMinute + metroHeadway > windowEnd) continue;
    const latestUsable = journey.leg2.departMinute - journey.transfer.walkMinutes - CONNECTION_BUFFER;
    assert.ok(
      latestUsable - journey.leg1.arriveMinute < metroHeadway,
      `via ${journey.via}: a later Metro would have caught the same train`,
    );
  }
});

test('the same train is never listed once per interchange', () => {
  const plan = planJourneys({ now: AEST(MONDAY, '08:00'), maxPerInterchange: 5 });
  const trains = new Set();
  for (const journey of plan.journeys) {
    const key = `${journey.leg2.serviceId}@${journey.leg2.anchor}`;
    assert.ok(!trains.has(key), 'one train produced two rows on the board');
    trains.add(key);
    // The interchanges it collapsed are kept, because boarding earlier along
    // the line is how you get a seat.
    for (const alt of journey.sameTrainAlso) {
      assert.notEqual(alt.via, journey.via);
      assert.ok(alt.totalMinutes >= journey.totalMinutes, 'the shortest of the group was kept');
    }
  }
});

test('after the last train the board looks further ahead instead of going blank', () => {
  const plan = planJourneys({ now: AEST(MONDAY, '02:30') });
  assert.equal(plan.inService, false);
  assert.equal(plan.extended, true);
  assert.ok(plan.journeys.length > 0, 'the reader is shown when service resumes');
  for (const journey of plan.journeys) {
    assert.ok(journey.leg1.departMinute >= 5 * 60, 'nothing runs before the first train');
  }
});

test('a journey boarded before midnight and finished after it stays one journey', () => {
  const plan = planJourneys({ now: AEST(MONDAY, '23:45') });
  assert.ok(plan.journeys.length > 0, 'trains still run just before midnight');
  const crossing = plan.journeys.find((j) => j.arriveMinute >= 24 * 60);
  assert.ok(crossing, 'a late departure should arrive after midnight');
  assert.equal(crossing.totalMinutes, crossing.arriveMinute - crossing.departMinute);
  assert.equal(formatClock(crossing.arriveMinute), formatClock(crossing.arriveMinute % 1440));
});

test('after the last connection the board shows the first trains of the morning', () => {
  // 00:30 is still Sunday's service day by the timetable's reckoning, but the
  // last usable connection has gone.
  const plan = planJourneys({ now: new Date('2026-08-23T00:30:00+10:00') });
  assert.equal(plan.nextDay, true);
  assert.equal(plan.extended, true);
  assert.ok(plan.journeys.length > 0);
  assert.equal(formatClock(plan.journeys[0].departMinute).slice(0, 2), '05', 'the first is at five');
  for (const journey of plan.journeys) {
    assert.ok(journey.departMinute > plan.nowMinute, 'nothing in the past is offered');
    assert.ok(journey.departMinute >= 1440 + 5 * 60, 'the morning was carried onto tonight\'s clock');
    assert.ok(journey.leg2.arriveMinute > journey.leg1.departMinute, 'the legs stayed in order');
  }
});

test('the small hours show the morning, not an empty board', () => {
  for (const hhmm of ['01:05', '02:00', '03:30']) {
    const plan = planJourneys({ now: AEST(MONDAY, hhmm) });
    assert.equal(plan.inService, false, `${hhmm}: nothing is running`);
    assert.equal(plan.extended, true, `${hhmm}: the board looked further ahead`);
    assert.ok(plan.journeys.length > 0, `${hhmm}: the reader is told when trains resume`);
    for (const journey of plan.journeys) {
      assert.ok(journey.departMinute >= 5 * 60);
      assert.ok(journey.departMinute > plan.nowMinute);
    }
  }
});

test('the return trip is planned end to end as well', () => {
  const plan = planJourneys({ now: AEST(SATURDAY, '15:00'), direction: 'toChatswood' });
  assert.equal(plan.origin, 'hurstville');
  assert.equal(plan.destination, 'chatswood');
  assert.ok(plan.journeys.length > 0);

  for (const journey of plan.journeys) {
    assert.equal(journey.leg1.from, 'hurstville');
    assert.equal(journey.leg1.mode, 'train');
    assert.equal(journey.leg2.mode, 'metro');
    assert.equal(journey.leg2.to, 'chatswood');
    assert.ok(journey.totalMinutes > 0);
    assert.equal(journey.totalMinutes, journey.arriveMinute - journey.departMinute);
  }
});

test('total journey times stay in the range the brief describes', () => {
  for (const hhmm of ['08:00', '12:00', '17:30']) {
    const plan = planJourneys({ now: AEST(MONDAY, hhmm), maxPerInterchange: 5 });
    const best = plan.journeys[0];
    assert.ok(
      best.totalMinutes >= 30 && best.totalMinutes <= 75,
      `${hhmm}: best journey of ${best.totalMinutes} min is outside anything believable`,
    );
    // Riding time alone, with no waiting, is the brief's ~34–41 minutes.
    const riding = best.leg1.rideMinutes + best.transfer.walkMinutes + best.leg2.rideMinutes;
    assert.ok(riding >= 30 && riding <= 50, `${hhmm}: ${riding} min of riding is outside the brief`);
  }
});

test('fast services are labelled so they can be spotted on the board', () => {
  const peak = planJourneys({ now: AEST(MONDAY, '07:30'), maxPerInterchange: 5 });
  const sco = peak.journeys.find((j) => j.leg2.line === 'SCO');
  assert.equal(sco.leg2.speed.key, 'express');

  for (const journey of peak.journeys) {
    assert.ok(['express', 'limited', 'allStops'].includes(journey.leg2.speed.key));
    assert.ok(journey.leg2.speed.zh.length > 0, 'the label is bilingual');
  }
});

test('nothing is offered before there is time to reach the platform', () => {
  const plan = planJourneys({ now: AEST(MONDAY, '08:00') });
  for (const journey of plan.journeys) {
    assert.ok(
      journey.departMinute - plan.nowMinute >= plan.minLeadMinutes,
      'a train nobody could catch was offered',
    );
  }
});
