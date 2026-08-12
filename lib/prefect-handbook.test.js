// Unit tests for the handbook read-check code.
//
// The important properties are that a code is stable within its ten-minute
// window, that yesterday's code is dead, and that the grace window is exactly
// one step back and never forward. Get the grace wrong in either direction and
// you either reject prefects who were slow switching apps, or accept a code
// forwarded much later — which is the only thing the rotation is defending
// against.
//
// Run with: npm run test:prefects
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_LENGTH,
  PERIOD_MS,
  counterFor,
  currentCode,
  handbookCode,
  handbookTally,
  looksLikeCode,
  msUntilNextCode,
  newHandbookSecret,
  normalizeCode,
  sanitizeHandbook,
  verifyCode,
} from './prefect-handbook.js';

const SECRET = 'test-secret-abc123';
const T0 = Date.UTC(2026, 7, 12, 9, 0, 0); // exactly on a window boundary

// ── the code itself ─────────────────────────────────────────────────────────

test('the code is six digits, zero-padded', () => {
  for (let i = 0; i < 500; i++) {
    const code = handbookCode(SECRET, i);
    assert.match(code, /^\d{6}$/, `counter ${i} produced "${code}"`);
    assert.equal(code.length, CODE_LENGTH);
  }
});

test('the same window always gives the same code', () => {
  const a = currentCode(SECRET, T0);
  const b = currentCode(SECRET, T0 + PERIOD_MS - 1);
  assert.equal(a, b, 'the code must not change while a prefect is copying it');
});

test('the next window gives a different code', () => {
  assert.notEqual(currentCode(SECRET, T0), currentCode(SECRET, T0 + PERIOD_MS));
});

test('a different secret gives a different code', () => {
  assert.notEqual(handbookCode(SECRET, 100), handbookCode('another-secret', 100));
});

test('secrets are unique and long enough to matter', () => {
  const a = newHandbookSecret();
  const b = newHandbookSecret();
  assert.notEqual(a, b);
  assert.ok(a.length >= 64, `expected a 32-byte hex secret, got ${a.length} chars`);
});

// ── verification and its grace window ───────────────────────────────────────

test('the current code verifies', () => {
  assert.equal(verifyCode(SECRET, currentCode(SECRET, T0), T0), true);
});

test('the previous window still verifies — the slack for switching apps', () => {
  const earlier = currentCode(SECRET, T0 - PERIOD_MS);
  assert.equal(verifyCode(SECRET, earlier, T0), true);
});

test('two windows back does not verify', () => {
  const old = currentCode(SECRET, T0 - 2 * PERIOD_MS);
  assert.equal(verifyCode(SECRET, old, T0), false, 'a code from 20+ minutes ago is stale');
});

test("yesterday's code is dead", () => {
  const yesterday = currentCode(SECRET, T0 - 24 * 60 * 60 * 1000);
  assert.equal(verifyCode(SECRET, yesterday, T0), false);
});

test('a future code is never accepted', () => {
  const future = currentCode(SECRET, T0 + PERIOD_MS);
  assert.equal(verifyCode(SECRET, future, T0), false,
    'nobody can have read a code that has not been shown yet');
});

test('a wrong or malformed code is refused, and never throws', () => {
  for (const bad of ['', null, undefined, '000', '1234567', 'abcdef', '12 34', {}, []]) {
    assert.equal(verifyCode(SECRET, bad, T0), false, `should refuse ${JSON.stringify(bad)}`);
  }
  assert.equal(verifyCode(SECRET, '999999', T0) && currentCode(SECRET, T0) !== '999999', false);
});

test('no secret means nothing verifies', () => {
  assert.equal(verifyCode('', currentCode(SECRET, T0), T0), false);
  assert.equal(verifyCode(null, '123456', T0), false);
});

// ── what a phone keyboard actually sends ────────────────────────────────────

test('accepts a code with the spacing a copy-paste leaves behind', () => {
  const code = currentCode(SECRET, T0);
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  assert.equal(verifyCode(SECRET, spaced, T0), true);
  assert.equal(verifyCode(SECRET, ` ${code} `, T0), true);
  assert.equal(verifyCode(SECRET, `${code.slice(0, 3)}-${code.slice(3)}`, T0), true);
});

test('looksLikeCode is the discriminator against an absence reason', () => {
  assert.equal(looksLikeCode('123456'), true);
  assert.equal(looksLikeCode('123 456'), true);
  assert.equal(looksLikeCode('I am sick today'), false);
  assert.equal(looksLikeCode('12345'), false);
  assert.equal(looksLikeCode('1234567'), false);
  assert.equal(normalizeCode(' 12 34-56 '), '123456');
});

// ── the countdown on the page ───────────────────────────────────────────────

test('the countdown runs from a full period down to the next boundary', () => {
  assert.equal(msUntilNextCode(T0), PERIOD_MS, 'on the boundary, a whole window remains');
  assert.equal(msUntilNextCode(T0 + 1000), PERIOD_MS - 1000);
  assert.equal(msUntilNextCode(T0 + PERIOD_MS - 1), 1);
});

test('counterFor advances exactly once per period', () => {
  assert.equal(counterFor(T0 + PERIOD_MS) - counterFor(T0), 1);
  assert.equal(counterFor(T0), counterFor(T0 + PERIOD_MS - 1));
});

// ── round state ─────────────────────────────────────────────────────────────

test('sanitizeHandbook keeps a well-formed round and drops a broken one', () => {
  const out = sanitizeHandbook({
    round: { id: 'r1', startedAt: '2026-08-12T09:00:00.000Z', url: 'https://notion.so/x', sent: 4 },
    confirmed: { 85210000001: { name: 'Calissa', at: '2026-08-12T09:05:00.000Z' } },
    evil: true,
  });

  assert.deepEqual(Object.keys(out).sort(), ['confirmed', 'round']);
  assert.equal(out.round.id, 'r1');
  assert.equal(out.round.sent, 4);
  assert.equal(out.confirmed['85210000001'].name, 'Calissa');

  assert.equal(sanitizeHandbook({ round: { startedAt: 'x' } }).round, null, 'a round needs an id');
  assert.deepEqual(sanitizeHandbook(null), { round: null, confirmed: {} });
  assert.deepEqual(sanitizeHandbook('nope'), { round: null, confirmed: {} });
});

// ── the admin tally ─────────────────────────────────────────────────────────

const CONTACTS = [
  { name: 'Calissa', phone: '85210000001', optIn: true },
  { name: 'Angelia', phone: '85210000002', optIn: true },
  { name: 'Mo', phone: '85210000003', optIn: false }, // never messaged, never counted
];

test('the tally lists who is outstanding first', () => {
  const handbook = { confirmed: { 85210000001: { name: 'Calissa', at: '2026-08-12T09:05:00.000Z' } } };
  const { rows, done, total } = handbookTally(handbook, CONTACTS);

  assert.equal(total, 2, 'opted-out contacts are not chased for something they never got');
  assert.equal(done, 1);
  assert.equal(rows[0].name, 'Angelia', 'the ones still to do come first — that is the actionable half');
  assert.equal(rows[0].done, false);
  assert.equal(rows[1].done, true);
  assert.equal(rows[1].at, '2026-08-12T09:05:00.000Z');
});

test('an empty round reports everyone outstanding rather than throwing', () => {
  const { rows, done, total } = handbookTally(null, CONTACTS);
  assert.equal(done, 0);
  assert.equal(total, 2);
  assert.ok(rows.every((r) => !r.done));
});
