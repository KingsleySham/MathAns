// Unit tests for the roster retention window and the admin settings sanitizer.
// These decide what gets deleted from prefect:roster, so a silent error here
// throws away duty days nobody asked to remove. Run with: npm run test:prefects
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  MAX_RETENTION_DAYS,
  MAX_ROSTER_DAYS,
  pruneRoster,
  sanitizeRoster,
  sanitizeSettings,
  splitRoster,
} from './prefect-duty-status-logic.js';

const TODAY = '2026-08-12';
const day = (date, extra = {}) => ({ date, location: 'Front gate', time: '7:45am', team: 'A', names: ['Calissa'], ...extra });
const dates = (list) => list.map((d) => d.date);

// ── pruneRoster ─────────────────────────────────────────────────────────────

test('drops days older than the retention window and keeps the rest', () => {
  const roster = [day('2026-08-01'), day('2026-08-04'), day('2026-08-05'), day('2026-08-11'), day(TODAY), day('2026-08-20')];
  const { kept, removed } = pruneRoster(roster, TODAY, { enabled: true, days: 7 });

  // Cutoff is 2026-08-05, and the boundary day itself is kept.
  assert.deepEqual(dates(removed), ['2026-08-01', '2026-08-04']);
  assert.deepEqual(dates(kept), ['2026-08-05', '2026-08-11', TODAY, '2026-08-20']);
});

test('retention disabled is a no-op, however old the entries are', () => {
  const roster = [day('2020-01-01'), day(TODAY)];
  const { kept, removed } = pruneRoster(roster, TODAY, { enabled: false, days: 0 });

  assert.deepEqual(kept, roster);
  assert.deepEqual(removed, []);
});

test('days: 0 removes yesterday but never today — the morning check still finds its duty', () => {
  const roster = [day('2026-08-10'), day('2026-08-11'), day(TODAY), day('2026-08-13')];
  const { kept, removed } = pruneRoster(roster, TODAY, { enabled: true, days: 0 });

  assert.deepEqual(dates(removed), ['2026-08-10', '2026-08-11']);
  assert.ok(dates(kept).includes(TODAY), "today's duty must survive any retention setting");
  assert.deepEqual(dates(kept), [TODAY, '2026-08-13']);
});

test("today's duty survives every valid retention value", () => {
  for (let days = 0; days <= MAX_RETENTION_DAYS; days += 1) {
    const { kept } = pruneRoster([day(TODAY)], TODAY, { enabled: true, days });
    assert.equal(kept.length, 1, `today was purged at days=${days}`);
  }
});

test('a missing or malformed today keeps everything rather than guessing', () => {
  const roster = [day('2020-01-01')];
  assert.deepEqual(pruneRoster(roster, '', DEFAULT_SETTINGS.retention).kept, roster);
  assert.deepEqual(pruneRoster(roster, '12/08/2026', DEFAULT_SETTINGS.retention).kept, roster);
});

test('missing retention falls back to the 7-day default', () => {
  const roster = [day('2026-08-01'), day('2026-08-11')];
  assert.deepEqual(dates(pruneRoster(roster, TODAY, undefined).kept), ['2026-08-11']);
  assert.deepEqual(dates(pruneRoster(roster, TODAY, {}).kept), ['2026-08-11']);
});

test('a non-array roster prunes to an empty result instead of throwing', () => {
  assert.deepEqual(pruneRoster(null, TODAY, DEFAULT_SETTINGS.retention), { kept: [], removed: [] });
});

// ── splitRoster ─────────────────────────────────────────────────────────────

test('splitRoster puts today in upcoming, not in the archive', () => {
  const { upcoming, past } = splitRoster([day('2026-08-11'), day(TODAY), day('2026-08-13')], TODAY);

  assert.deepEqual(dates(upcoming), [TODAY, '2026-08-13']);
  assert.deepEqual(dates(past), ['2026-08-11']);
});

// ── sanitizeSettings ────────────────────────────────────────────────────────

test('clamps the retention window to 0…90 days', () => {
  assert.equal(sanitizeSettings({ retention: { days: 400 } }).retention.days, MAX_RETENTION_DAYS);
  assert.equal(sanitizeSettings({ retention: { days: -5 } }).retention.days, 0);
  assert.equal(sanitizeSettings({ retention: { days: 7.9 } }).retention.days, 7);
  assert.equal(sanitizeSettings({ retention: { days: 'soon' } }).retention.days, DEFAULT_SETTINGS.retention.days);
});

test('rejects a team outside A/B/C and trims the duty defaults', () => {
  const s = sanitizeSettings({ defaults: { location: '  Front gate  ', time: ' 7:45am ', team: 'z' } });

  assert.deepEqual(s.defaults, { location: 'Front gate', time: '7:45am', team: '' });
  assert.equal(sanitizeSettings({ defaults: { team: 'b' } }).defaults.team, 'B');
});

test('drops unknown keys and garbage input rather than merging them through', () => {
  const s = sanitizeSettings({ defaults: { location: 'Gate' }, evil: true, retention: { enabled: false, days: 3, evil: 1 } });

  assert.deepEqual(Object.keys(s).sort(), ['defaults', 'lastPurge', 'notion', 'retention']);
  assert.deepEqual(Object.keys(s.retention).sort(), ['days', 'enabled']);
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings('nope'), DEFAULT_SETTINGS);
});

test('keeps a well-formed lastPurge stamp and discards a broken one', () => {
  assert.deepEqual(
    sanitizeSettings({ lastPurge: { at: '2026-08-12T06:00:00.000Z', removed: 3 } }).lastPurge,
    { at: '2026-08-12T06:00:00.000Z', removed: 3 },
  );
  assert.equal(sanitizeSettings({ lastPurge: { at: 'yesterday', removed: 3 } }).lastPurge, null);
  assert.equal(sanitizeSettings({ lastPurge: { at: '2026-08-12T06:00:00.000Z' } }).lastPurge.removed, 0);
});

// ── sanitizeRoster ──────────────────────────────────────────────────────────

test('over the cap, sanitizeRoster keeps the earliest days rather than the first submitted', () => {
  // Submitted newest-first, which is how the old positional slice lost new days.
  const roster = Array.from({ length: MAX_ROSTER_DAYS + 5 }, (_, i) => day(`2026-09-${String(30 - i).padStart(2, '0')}`))
    .filter((d) => d.date >= '2026-09-01');
  const padded = [...roster, ...Array.from({ length: MAX_ROSTER_DAYS }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, '0')}`))];

  const out = sanitizeRoster(padded);
  assert.equal(out.length, MAX_ROSTER_DAYS);
  assert.equal(out[0].date, '2026-09-01', 'the earliest day must survive truncation');
  assert.deepEqual(dates(out), [...dates(out)].sort(), 'output is date-sorted');
});

test('sanitizeRoster still drops undated rows and normalises the fields', () => {
  const out = sanitizeRoster([
    { date: '', location: 'Nowhere' },
    { date: '2026-08-13', location: '  Side gate ', time: ' 7:30am ', team: 'c', names: [' Ana ', '', 'Bo'] },
  ]);

  assert.deepEqual(out, [{ date: '2026-08-13', location: 'Side gate', time: '7:30am', team: 'C', names: ['Ana', 'Bo'] }]);
});
