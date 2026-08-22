// node --test lib/trains/live.test.js

import assert from 'node:assert/strict';
import test from 'node:test';

import { mapTripJourneys, platformFrom, stationKeyFor } from './live.js';

const NOW = new Date('2026-08-24T08:00:00+10:00');
const at = (hhmm) => `2026-08-24T${hhmm}:00+10:00`;

const stop = (name, hhmm, platform) => ({
  parent: { name: `${name} Station` },
  name: `${name} Station, Platform ${platform || '1'}`,
  disassembledName: `Platform ${platform || '1'}`,
  arrivalTimePlanned: at(hhmm),
  departureTimePlanned: at(hhmm),
  properties: platform ? { platform } : {},
});

const railLeg = ({ product, line, destination, from, to, stops }) => ({
  transportation: {
    product,
    disassembledName: line,
    destination: { name: destination },
  },
  origin: {
    ...from,
    departureTimePlanned: from.departureTimePlanned,
    departureTimeEstimated: from.departureTimeEstimated,
  },
  destination: to,
  stopSequence: stops,
});

const metroLeg = railLeg({
  product: { class: 2, name: 'Sydney Metro Network' },
  line: 'M1',
  destination: 'Sydenham Station',
  from: {
    parent: { name: 'Chatswood Station' },
    name: 'Chatswood Station, Platform 1',
    properties: { platform: '1' },
    departureTimePlanned: at('08:04'),
    departureTimeEstimated: at('08:05'),
  },
  to: { parent: { name: 'Martin Place Station' }, arrivalTimePlanned: at('08:16') },
  stops: [
    stop('Chatswood', '08:05', '1'),
    stop('Crows Nest', '08:09'),
    stop('Victoria Cross', '08:11'),
    stop('Barangaroo', '08:14'),
    stop('Martin Place', '08:16'),
  ],
});

const t4Leg = railLeg({
  product: { class: 1, name: 'Sydney Trains Network' },
  line: 'T4',
  destination: 'Cronulla Station',
  from: {
    parent: { name: 'Martin Place Station' },
    name: 'Martin Place Station, Platform 2',
    properties: { platform: '2' },
    departureTimePlanned: at('08:19'),
  },
  to: { parent: { name: 'Hurstville Station' }, arrivalTimePlanned: at('08:45') },
  stops: [
    stop('Martin Place', '08:19', '2'),
    stop('Town Hall', '08:21'),
    stop('Central', '08:24'),
    stop('Redfern', '08:27'),
    stop('Wolli Creek', '08:37'),
    stop('Kogarah', '08:42'),
    stop('Hurstville', '08:45'),
  ],
});

const walkLeg = {
  transportation: { product: { class: 99, name: 'footpath' } },
  origin: { parent: { name: 'Martin Place Station' }, departureTimePlanned: at('08:16') },
  destination: { parent: { name: 'Martin Place Station' }, arrivalTimePlanned: at('08:18') },
  stopSequence: [],
};

const payload = { journeys: [{ legs: [metroLeg, walkLeg, t4Leg] }] };
const options = { now: NOW, origin: 'chatswood', destination: 'hurstville' };

test('station names are matched however the API dresses them up', () => {
  assert.equal(stationKeyFor('Chatswood Station'), 'chatswood');
  assert.equal(stationKeyFor('Martin Place Station, Platform 2'), 'martinPlace');
  assert.equal(stationKeyFor('Wolli Creek'), 'wolliCreek');
  assert.equal(stationKeyFor('Bondi Junction Station'), null);
  assert.equal(stationKeyFor(''), null);
});

test('platform numbers are read from properties or from the name', () => {
  assert.equal(platformFrom({ properties: { platform: '25' } }), '25');
  assert.equal(platformFrom({ disassembledName: 'Platform 3' }), '3');
  assert.equal(platformFrom({ name: 'Central Station' }), null);
});

test('a live journey comes out in the same shape the board already renders', () => {
  const [journey] = mapTripJourneys(payload, options);
  assert.ok(journey, 'the journey was mapped');

  assert.equal(journey.via, 'martinPlace');
  assert.equal(journey.isBest, true);
  assert.equal(journey.leg1.mode, 'metro');
  assert.equal(journey.leg2.mode, 'train');
  assert.equal(journey.leg1.from, 'chatswood');
  assert.equal(journey.leg2.to, 'hurstville');

  // 08:05 (estimated, one minute late) through to 08:45.
  assert.equal(journey.departMinute, 8 * 60 + 5);
  assert.equal(journey.arriveMinute, 8 * 60 + 45);
  assert.equal(journey.totalMinutes, 40);
  assert.equal(journey.realtime, true, 'the estimated time was preferred over the planned one');
});

test('platforms and alighting points survive the mapping', () => {
  const [journey] = mapTripJourneys(payload, options);
  assert.equal(journey.leg1.boardPlatform, '1');
  assert.equal(journey.leg2.boardPlatform, '2');
  assert.equal(journey.transfer.toPlatform, '2');
  assert.equal(journey.leg1.to, 'martinPlace', 'where to get off the Metro');
  assert.equal(journey.leg2.to, 'hurstville', 'where to get off the train');
});

test('the stop list is the stops in between, not the ends', () => {
  const [journey] = mapTripJourneys(payload, options);
  assert.deepEqual(
    journey.leg1.stops.map((s) => s.station),
    ['crowsNest', 'victoriaCross', 'barangaroo'],
  );
  assert.equal(journey.leg1.stopCount, 3);
  assert.deepEqual(
    journey.leg2.stops.map((s) => s.station),
    ['townHall', 'central', 'redfern', 'wolliCreek', 'kogarah'],
  );
  assert.equal(journey.leg2.speed.key, 'limited', 'five stops is a limited-stops run');
});

test('the walk and the wait are split out of the gap between trains', () => {
  const [journey] = mapTripJourneys(payload, options);
  // 08:16 off the Metro, 08:19 onto the T4: two minutes of walking, one waiting.
  assert.equal(journey.transfer.walkMinutes, 2);
  assert.equal(journey.waitMinutes, 1);
});

test('a two-stop express is labelled as one', () => {
  const express = structuredClone(payload);
  express.journeys[0].legs[2].stopSequence = [
    stop('Martin Place', '08:19', '2'),
    stop('Redfern', '08:27'),
    stop('Wolli Creek', '08:37'),
    stop('Hurstville', '08:45'),
  ];
  const [journey] = mapTripJourneys(express, options);
  assert.equal(journey.leg2.speed.key, 'express');
  assert.equal(journey.leg2.stopCount, 2);
});

test('journeys the board cannot draw are dropped, not half-rendered', () => {
  const busReplacement = structuredClone(payload);
  busReplacement.journeys[0].legs[2].transportation.product = { class: 5, name: 'Sydney Buses' };
  assert.deepEqual(mapTripJourneys(busReplacement, options), []);

  const wrongEnd = structuredClone(payload);
  wrongEnd.journeys[0].legs[2].destination.parent.name = 'Cronulla Station';
  assert.deepEqual(mapTripJourneys(wrongEnd, options), []);

  const noTimes = structuredClone(payload);
  delete noTimes.journeys[0].legs[0].origin.departureTimePlanned;
  delete noTimes.journeys[0].legs[0].origin.departureTimeEstimated;
  assert.deepEqual(mapTripJourneys(noTimes, options), []);

  assert.deepEqual(mapTripJourneys({}, options), []);
  assert.deepEqual(mapTripJourneys(null, options), []);
});

test('journeys are ranked by arrival, soonest first', () => {
  const two = structuredClone(payload);
  const later = structuredClone(payload.journeys[0]);
  later.legs[0].origin.departureTimePlanned = at('08:10');
  later.legs[0].origin.departureTimeEstimated = at('08:10');
  later.legs[2].destination.arrivalTimePlanned = at('08:52');
  two.journeys.unshift(later);

  const journeys = mapTripJourneys(two, options);
  assert.equal(journeys.length, 2);
  assert.equal(journeys[0].arriveMinute, 8 * 60 + 45);
  assert.equal(journeys[0].isBest, true);
  assert.equal(journeys[1].isBest, false);
});

test('a departure after midnight is tomorrow, not fourteen hours ago', () => {
  const lateNight = structuredClone(payload);
  lateNight.journeys[0].legs[0].origin.departureTimePlanned = '2026-08-25T00:10:00+10:00';
  lateNight.journeys[0].legs[0].origin.departureTimeEstimated = '2026-08-25T00:10:00+10:00';
  lateNight.journeys[0].legs[2].destination.arrivalTimePlanned = '2026-08-25T00:50:00+10:00';

  const [journey] = mapTripJourneys(lateNight, {
    ...options,
    now: new Date('2026-08-24T23:50:00+10:00'),
  });
  assert.equal(journey.departMinute, 24 * 60 + 10);
  assert.equal(journey.totalMinutes, 40);
});
