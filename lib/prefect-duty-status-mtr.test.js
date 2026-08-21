// Unit tests for the MTR half of the duty status.
//
// The case that prompted these: an ETA of 0 minutes used to sail under the
// threshold and produce no alert at all, so a station with nothing scheduled
// looked identical to a station with a train two minutes out. Silence meaning
// "fine" is the worst possible reading of "no service".
//
// Run with: npm run test:prefects
import test from 'node:test';
import assert from 'node:assert/strict';
import { DUTY_WINDOW, LINES, evaluateLine, summarizeTransport } from './prefect-duty-status-logic.js';

const TWL = LINES.find((l) => l.line === 'TWL'); // threshold 8, station SSP
const IN_WINDOW = 7 * 60;                        // 07:00, inside 06:30–08:30
const BEFORE_WINDOW = 5 * 60;                    // 05:00

// A Next Train response for TWL-SSP with the given first-train ETAs.
const feed = (up, down = up, extra = {}) => ({
  status: 1,
  data: {
    'TWL-SSP': {
      isdelay: 'N',
      ...(up === null ? {} : { UP: [{ seq: '1', ttnt: String(up) }, { seq: '2', ttnt: '14' }] }),
      ...(down === null ? {} : { DOWN: [{ seq: '1', ttnt: String(down) }] }),
      ...extra,
    },
  },
});

// ── the zero case ───────────────────────────────────────────────────────────

test('an ETA of 0 reports the station out of service', () => {
  const alert = evaluateLine(TWL, feed(0), IN_WINDOW);

  assert.ok(alert, 'zero minutes must not pass silently as "all fine"');
  assert.match(alert.reason, /Out of service/);
  assert.equal(alert.label, 'Tsuen Wan Line');
  assert.equal(alert.severity, 'amber', 'MTR alerts stay advisory — they never suspend duty');
});

test('it does not claim a wait of "0 minutes"', () => {
  const alert = evaluateLine(TWL, feed(0), IN_WINDOW);
  assert.doesNotMatch(alert.reason, /0 minutes away/);
});

test('one direction still running is not out of service', () => {
  // The station has service; only one platform has nothing listed.
  const alert = evaluateLine(TWL, feed(0, 3), IN_WINDOW);
  assert.equal(alert, null, 'a train in three minutes is not an out-of-service station');
});

test('a zero alongside a slow train reports the slow train, not a closure', () => {
  const alert = evaluateLine(TWL, feed(0, 11), IN_WINDOW);

  assert.match(alert.reason, /11 minutes away/);
  assert.doesNotMatch(alert.reason, /Out of service/);
});

test('every direction at zero is out of service', () => {
  const alert = evaluateLine(TWL, feed(0, 0), IN_WINDOW);
  assert.match(alert.reason, /Out of service/);
});

test('out of service is only reported inside the duty window', () => {
  // Before 06:30 the line genuinely is not running yet, and saying so at 05:00
  // would be noise on a page prefects check on their way out of the door.
  assert.equal(evaluateLine(TWL, feed(0), BEFORE_WINDOW), null);
  assert.equal(evaluateLine(TWL, feed(0), DUTY_WINDOW[1] + 1), null);
  assert.ok(evaluateLine(TWL, feed(0), DUTY_WINDOW[0]), 'the window edge still counts');
});

// ── the cases that must not change ──────────────────────────────────────────

test('a normal short wait is still silent', () => {
  assert.equal(evaluateLine(TWL, feed(3), IN_WINDOW), null);
});

test('a wait at or over the threshold still alerts', () => {
  assert.match(evaluateLine(TWL, feed(8), IN_WINDOW).reason, /8 minutes away/);
  assert.match(evaluateLine(TWL, feed(12), IN_WINDOW).reason, /12 minutes away/);
});

test('the worst of the two directions is the one reported', () => {
  assert.match(evaluateLine(TWL, feed(3, 15), IN_WINDOW).reason, /15 minutes away/);
});

test('special service arrangements still outrank everything', () => {
  const alert = evaluateLine(TWL, { status: 0, message: 'Special arrangements' }, IN_WINDOW);
  assert.equal(alert.severity, 'red');
  assert.match(alert.reason, /Special arrangements/);
});

test('a flagged delay still alerts, and outside the window too', () => {
  const delayed = feed(3, 3, { isdelay: 'Y' });
  assert.match(evaluateLine(TWL, delayed, IN_WINDOW).reason, /flagged a delay/);
  assert.match(evaluateLine(TWL, delayed, BEFORE_WINDOW).reason, /flagged a delay/,
    'a delay is worth knowing whatever the hour');
});

test('a missing or malformed feed says nothing rather than guessing', () => {
  assert.equal(evaluateLine(TWL, null, IN_WINDOW), null);
  assert.equal(evaluateLine(TWL, { status: 1, data: {} }, IN_WINDOW), null);
  assert.equal(evaluateLine(TWL, feed(null, null), IN_WINDOW), null, 'no seq=1 entries is a feed gap');
  assert.equal(evaluateLine(TWL, feed('abc'), IN_WINDOW), null, 'unparseable is not zero');
});

test('a line that does not serve the school is only checked for status and delays', () => {
  // These are sampled at one representative station for network-wide status, so
  // their ETAs are not read at all — an out-of-service platform on the
  // Disneyland Resort Line is not news to a prefect on their way to duty.
  const drl = LINES.find((l) => l.line === 'DRL');
  assert.equal(drl.threshold, undefined);

  const zero = { status: 1, data: { 'DRL-SUN': { isdelay: 'N', UP: [{ seq: '1', ttnt: '0' }] } } };
  assert.equal(evaluateLine(drl, zero, IN_WINDOW), null);

  // But a citywide problem on that same line still gets through.
  const delayed = { status: 1, data: { 'DRL-SUN': { isdelay: 'Y' } } };
  assert.match(evaluateLine(drl, delayed, IN_WINDOW).reason, /flagged a delay/);
});

test('all three school-serving lines report out of service', () => {
  for (const line of ['TWL', 'TML', 'TCL']) {
    const cfg = LINES.find((l) => l.line === line);
    const zero = { status: 1, data: { [`${cfg.line}-${cfg.sta}`]: { isdelay: 'N', UP: [{ seq: '1', ttnt: '0' }] } } };
    assert.match(evaluateLine(cfg, zero, IN_WINDOW).reason, /Out of service/, `${line} should report it`);
  }
});

// ── how it surfaces ─────────────────────────────────────────────────────────

test('an out-of-service line makes the transport summary amber, not green', () => {
  const alerts = [evaluateLine(TWL, feed(0), IN_WINDOW)].filter(Boolean);
  const summary = summarizeTransport(alerts);

  assert.equal(summary.ok, false);
  assert.equal(summary.severity, 'amber');
  assert.equal(summary.alerts.length, 1);
});
