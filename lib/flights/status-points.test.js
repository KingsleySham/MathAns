// Unit tests for the earning engine — the piece where a silent error
// produces confident wrong answers. Run with: npm run test:flights
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRPORTS,
  greatCircleMiles,
  ladderSteps,
  pointsNeeded,
  sectorEarning,
  statusPoints,
  zoneForSector,
} from './status-points.js';

function miles(a, b) {
  return greatCircleMiles(AIRPORTS[a], AIRPORTS[b]);
}

test('HKG–TPE is ~501 mi, Ultra-short, K/Flex earns 25', () => {
  const d = miles('HKG', 'TPE');
  assert.ok(Math.abs(d - 501) < 15, `expected ~501, got ${d.toFixed(1)}`);
  const s = sectorEarning({
    origin: 'HKG', destination: 'TPE',
    marketingCarrier: 'CX', bookingClass: 'K', fareType: 'flex',
  });
  assert.equal(s.zone, 'ultra_short');
  assert.equal(s.points, 25);
});

test('HKG–PVG is ~780 mi, just over the boundary into Short T1, K/Flex earns 30', () => {
  const d = miles('HKG', 'PVG');
  assert.ok(Math.abs(d - 780) < 25, `expected ~780, got ${d.toFixed(1)}`);
  assert.ok(d > 750, 'must land above the 750 boundary');
  const s = sectorEarning({
    origin: 'HKG', destination: 'PVG',
    marketingCarrier: 'CX', bookingClass: 'K', fareType: 'flex',
  });
  assert.equal(s.zone, 'short_t1');
  assert.equal(s.points, 30);
});

test('HKG–FUK is ~1,272 mi, Short T2 because Japan, K/Flex earns 35', () => {
  const d = miles('HKG', 'FUK');
  assert.ok(Math.abs(d - 1272) < 40, `expected ~1272, got ${d.toFixed(1)}`);
  const s = sectorEarning({
    origin: 'HKG', destination: 'FUK',
    marketingCarrier: 'CX', bookingClass: 'K', fareType: 'flex',
  });
  assert.equal(s.zone, 'short_t2');
  assert.equal(s.points, 35);
});

test('HKG–LHR is ~5,987 mi, Long, J/Flex earns 130', () => {
  const d = miles('HKG', 'LHR');
  assert.ok(Math.abs(d - 5987) < 100, `expected ~5987, got ${d.toFixed(1)}`);
  const s = sectorEarning({
    origin: 'HKG', destination: 'LHR',
    marketingCarrier: 'CX', bookingClass: 'J', fareType: 'flex',
  });
  assert.equal(s.zone, 'long');
  assert.equal(s.points, 130);
});

test('Green → Diamond costs 2,100 under 2026 reset rules, 1,200 under 2027 rules', () => {
  assert.equal(pointsNeeded('green', 'diamond', 0, true), 2100);
  assert.equal(pointsNeeded('green', 'diamond', 0, false), 1200);
});

test('a partner-marketed segment returns null, never a number', () => {
  assert.equal(
    statusPoints({ marketingCarrier: 'JL', bookingClass: 'Y', fareType: 'flex', zone: 'short_t2' }),
    null,
  );
  const s = sectorEarning({
    origin: 'HKG', destination: 'NRT',
    marketingCarrier: 'QF', bookingClass: 'J', fareType: 'flex',
  });
  assert.equal(s.points, null);
});

test('combinations Cathay does not publish return null (no invented rows)', () => {
  // W exists only as Flex; F/A only as Flex; D/P/I never as Flex.
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'W', fareType: 'light', zone: 'medium' }), null);
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'F', fareType: 'essential', zone: 'long' }), null);
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'D', fareType: 'flex', zone: 'long' }), null);
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'Z', fareType: 'flex', zone: 'long' }), null);
});

test('D/P/I Essential and Light share one row', () => {
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'I', fareType: 'essential', zone: 'ultra_long' }), 120);
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'I', fareType: 'light', zone: 'ultra_long' }), 120);
});

test('the class/brand spread: same ultra-short seat earns 25 in Y-Flex and 3 in Q-Light', () => {
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'Y', fareType: 'flex', zone: 'ultra_short' }), 25);
  assert.equal(statusPoints({ marketingCarrier: 'CX', bookingClass: 'Q', fareType: 'light', zone: 'ultra_short' }), 3);
});

test('zone boundaries fall exactly where published', () => {
  assert.equal(zoneForSector(750, 'HK', 'TW'), 'ultra_short');
  assert.equal(zoneForSector(751, 'HK', 'TW'), 'short_t1');
  assert.equal(zoneForSector(751, 'HK', 'JP'), 'short_t2');
  assert.equal(zoneForSector(2750, 'HK', 'IN'), 'short_t2');
  assert.equal(zoneForSector(2751, 'HK', 'IN'), 'medium');
  assert.equal(zoneForSector(5000, 'HK', 'AU'), 'medium');
  assert.equal(zoneForSector(5001, 'HK', 'GB'), 'long');
  assert.equal(zoneForSector(7500, 'HK', 'GB'), 'long');
  assert.equal(zoneForSector(7501, 'HK', 'US'), 'ultra_long');
});

test('balance offsets the climb in both rule sets', () => {
  assert.equal(pointsNeeded('green', 'silver', 120, true), 180);
  assert.equal(pointsNeeded('silver', 'diamond', 200, true), 1600); // (600-200)+1200
  assert.equal(pointsNeeded('silver', 'diamond', 200, false), 1000); // 1200-200
  assert.equal(pointsNeeded('diamond', 'gold', 0, true), 0);
});

test('ladderSteps shows the 2026 reset penalty per rung', () => {
  const s2026 = ladderSteps('green', 'diamond', 0, true);
  assert.deepEqual(s2026.map((s) => s.pointsToFly), [300, 600, 1200]);
  const s2027 = ladderSteps('green', 'diamond', 0, false);
  assert.deepEqual(s2027.map((s) => s.pointsToFly), [300, 300, 600]);
  assert.equal(s2027.reduce((a, s) => a + s.pointsToFly, 0), 1200);
});
