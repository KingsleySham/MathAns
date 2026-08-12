// Unit tests for the Notion sync rules.
//
// reconcile() decides what gets written and what gets DELETED on both sides, so
// a silent error here loses real duty days or shreds the VHP's Notion history.
// The window tests at the bottom are the important ones: the roster's automatic
// clean-up removes ended duty days, and only the [today, horizon] window stops
// that reaching Notion.
//
// Run with: npm run test:prefects
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entryDiffers,
  entryToNotionProps,
  notionPageToEntry,
  reconcile,
  sanitizeSeen,
} from './prefect-notion-sync.js';
import {
  DEFAULT_NOTION_CONFIG,
  isNotionConfigured,
  sanitizeNotionConfig,
} from './prefect-duty-status-logic.js';
import { normalizeId } from './prefect-notion.js';

const TODAY = '2026-08-12';
const HORIZON = '2026-10-21'; // today + 70

const PROPS = { date: 'Date', location: 'Location', time: 'Time', team: 'Team', names: 'Prefects' };

const hubDay = (date, over = {}) => ({
  date, location: 'Front gate', time: '7:45am', team: 'A', names: ['Calissa'], ...over,
});

const notionDay = (date, over = {}) => ({
  date, location: 'Front gate', time: '7:45am', team: 'A', names: ['Calissa'],
  notionPageId: `page-${date}`, notionEditedAt: '2026-08-10T00:00:00.000Z', ...over,
});

const dates = (list) => list.map((e) => e.date);

// ── the window: the invariant that protects Notion history ──────────────────

test('past duty days are untouched on both sides, so the purge can never reach Notion', () => {
  const hub = [hubDay('2026-01-01', { notionPageId: 'page-old' }), hubDay('2026-08-20')];
  const notion = [notionDay('2026-01-01', { location: 'CHANGED' }), notionDay('2026-08-20')];

  const out = reconcile(hub, notion, TODAY, HORIZON);

  // The old day survives in the hub exactly as it was, and generates no Notion write.
  const old = out.hubNext.find((e) => e.date === '2026-01-01');
  assert.equal(old.location, 'Front gate', 'a past day must not be overwritten from Notion');
  assert.equal(out.toCreate.length, 0);
  assert.equal(out.toUpdate.length, 0);
  assert.equal(out.removed, 0, 'a past day linked to a page must never count as a deletion');
});

test('a hub day beyond the horizon is neither pushed nor dropped', () => {
  const out = reconcile([hubDay('2027-01-01')], [], TODAY, HORIZON);

  assert.deepEqual(dates(out.hubNext), ['2027-01-01']);
  assert.equal(out.toCreate.length, 0);
});

// ── the four pairing cases ──────────────────────────────────────────────────

test('a day only in Notion is added to the hub', () => {
  const out = reconcile([], [notionDay('2026-08-20')], TODAY, HORIZON);

  assert.deepEqual(dates(out.hubNext), ['2026-08-20']);
  assert.equal(out.hubNext[0].notionPageId, 'page-2026-08-20');
  assert.equal(out.hubNext[0].updatedAt, '2026-08-10T00:00:00.000Z');
  assert.equal(out.toCreate.length, 0);
});

test('a never-synced hub day is created in Notion and kept', () => {
  const out = reconcile([hubDay('2026-08-20')], [], TODAY, HORIZON);

  assert.deepEqual(dates(out.toCreate), ['2026-08-20']);
  assert.deepEqual(dates(out.hubNext), ['2026-08-20']);
});

test('a hub day whose Notion page has gone is dropped from the hub', () => {
  const hub = [hubDay('2026-08-20', { notionPageId: 'page-2026-08-20' })];
  const out = reconcile(hub, [], TODAY, HORIZON, ['page-2026-08-20']);

  assert.deepEqual(out.hubNext, [], 'deleting the row in Notion deletes the day here');
  assert.equal(out.removed, 1);
  assert.equal(out.toCreate.length, 0, 'it must not be recreated — that would make deletion impossible');
});

test('the same day with no sync state is kept, not deleted on a guess', () => {
  const hub = [hubDay('2026-08-20', { notionPageId: 'page-2026-08-20' })];
  const out = reconcile(hub, [], TODAY, HORIZON, []); // `seen` empty — state lost

  assert.deepEqual(dates(out.hubNext), ['2026-08-20']);
  assert.equal(out.removed, 0);
  assert.equal(out.toArchive.length, 0);
});

test('an unchanged day on both sides produces no writes at all', () => {
  const hub = [hubDay('2026-08-20', { notionPageId: 'page-2026-08-20', updatedAt: '2026-08-11T00:00:00.000Z' })];
  const out = reconcile(hub, [notionDay('2026-08-20')], TODAY, HORIZON);

  assert.equal(out.toUpdate.length, 0);
  assert.equal(out.toCreate.length, 0);
  assert.equal(out.removed, 0);
});

// ── last-write-wins ─────────────────────────────────────────────────────────

test('the newer hub edit wins and is pushed to Notion', () => {
  const hub = [hubDay('2026-08-20', {
    location: 'Side gate', notionPageId: 'page-2026-08-20', updatedAt: '2026-08-11T09:00:00.000Z',
  })];
  const out = reconcile(hub, [notionDay('2026-08-20')], TODAY, HORIZON); // notion edited 08-10

  assert.deepEqual(dates(out.toUpdate), ['2026-08-20']);
  assert.equal(out.hubNext[0].location, 'Side gate');
});

test('the newer Notion edit wins and overwrites the hub', () => {
  const hub = [hubDay('2026-08-20', {
    location: 'Side gate', notionPageId: 'page-2026-08-20', updatedAt: '2026-08-01T00:00:00.000Z',
  })];
  const notion = [notionDay('2026-08-20', { location: 'Back gate', notionEditedAt: '2026-08-11T00:00:00.000Z' })];

  const out = reconcile(hub, notion, TODAY, HORIZON);

  assert.equal(out.hubNext[0].location, 'Back gate');
  assert.equal(out.toUpdate.length, 0, 'the loser must not also be pushed back');
});

test('an unstamped hub day loses to Notion rather than guessing', () => {
  const hub = [hubDay('2026-08-20', { location: 'Side gate', notionPageId: 'page-2026-08-20' })];
  const out = reconcile(hub, [notionDay('2026-08-20', { location: 'Back gate' })], TODAY, HORIZON);

  assert.equal(out.hubNext[0].location, 'Back gate');
});

test('identical timestamps write nothing — a tie must not ping-pong', () => {
  const stamp = '2026-08-11T00:00:00.000Z';
  const hub = [hubDay('2026-08-20', { location: 'Side gate', notionPageId: 'page-2026-08-20', updatedAt: stamp })];
  const notion = [notionDay('2026-08-20', { location: 'Back gate', notionEditedAt: stamp })];

  const out = reconcile(hub, notion, TODAY, HORIZON);

  assert.equal(out.toUpdate.length, 0);
  assert.equal(out.hubNext[0].location, 'Side gate', 'the hub copy is left as-is');
});

test('an unlinked hub day pairs with a Notion row on the same date instead of duplicating', () => {
  const hub = [hubDay('2026-08-20')]; // no notionPageId — first sync
  const out = reconcile(hub, [notionDay('2026-08-20')], TODAY, HORIZON);

  assert.equal(out.hubNext.length, 1, 'the same day must not appear twice after the first sync');
  assert.equal(out.hubNext[0].notionPageId, 'page-2026-08-20');
  assert.equal(out.toCreate.length, 0);
});

test('the output stays date-sorted', () => {
  const out = reconcile([hubDay('2026-09-05')], [notionDay('2026-08-20')], TODAY, HORIZON);
  assert.deepEqual(dates(out.hubNext), ['2026-08-20', '2026-09-05']);
});

// ── deletions originating in the hub ────────────────────────────────────────

// A hub-side deletion is invisible in the roster by the time a sync runs — the
// admin already removed it. `seen` is the only record that the row was ever
// linked, and it is what stops the Notion row being read back as a new day.
test('a day deleted in the hub is archived in Notion, not resurrected', () => {
  const out = reconcile([], [notionDay('2026-08-20')], TODAY, HORIZON, ['page-2026-08-20']);

  assert.deepEqual(out.toArchive, ['page-2026-08-20']);
  assert.deepEqual(out.hubNext, [], 'it must not come back');
});

test('an unseen Notion row is an addition, not a deletion', () => {
  const out = reconcile([], [notionDay('2026-08-20')], TODAY, HORIZON, []);

  assert.deepEqual(out.toArchive, []);
  assert.deepEqual(dates(out.hubNext), ['2026-08-20']);
});

test('a past Notion row is never archived, even when it was synced before', () => {
  const out = reconcile([], [notionDay('2026-01-01')], TODAY, HORIZON, ['page-2026-01-01']);

  assert.deepEqual(out.toArchive, [], 'history stays put no matter what the sync state says');
  assert.deepEqual(out.hubNext, []);
});

test('seenNext reports the links to carry into the next run', () => {
  const hub = [hubDay('2026-08-20', { notionPageId: 'page-2026-08-20' })];
  const out = reconcile(hub, [notionDay('2026-08-20')], TODAY, HORIZON, ['page-2026-08-20']);

  assert.deepEqual(out.seenNext, ['page-2026-08-20']);
});

test('sanitizeSeen de-duplicates, trims and drops blanks', () => {
  assert.deepEqual(sanitizeSeen([' a ', 'a', '', null, 'b']), ['a', 'b']);
  assert.deepEqual(sanitizeSeen('nope'), []);
});

// ── reading Notion pages ────────────────────────────────────────────────────

const page = (properties, over = {}) => ({
  id: 'page-1', last_edited_time: '2026-08-11T00:00:00.000Z', properties, ...over,
});

test('reads the common property types into a roster entry', () => {
  const entry = notionPageToEntry(page({
    Date: { type: 'date', date: { start: '2026-08-20' } },
    Location: { type: 'title', title: [{ plain_text: 'Front gate' }] },
    Time: { type: 'rich_text', rich_text: [{ plain_text: '7:45am' }] },
    Team: { type: 'select', select: { name: 'B' } },
    Prefects: { type: 'multi_select', multi_select: [{ name: 'Calissa' }, { name: 'Angelia' }] },
  }), PROPS);

  assert.deepEqual(entry, {
    date: '2026-08-20',
    location: 'Front gate',
    time: '7:45am',
    team: 'B',
    names: ['Calissa', 'Angelia'],
    notionPageId: 'page-1',
    notionEditedAt: '2026-08-11T00:00:00.000Z',
  });
});

test('a row with only a date still syncs; a row with none is skipped', () => {
  const bare = notionPageToEntry(page({ Date: { type: 'date', date: { start: '2026-08-20' } } }), PROPS);
  assert.equal(bare.date, '2026-08-20');
  assert.deepEqual(bare.names, []);

  assert.equal(notionPageToEntry(page({ Date: { type: 'date', date: null } }), PROPS), null);
  assert.equal(notionPageToEntry(page({}), PROPS), null);
});

test('a datetime is truncated to the calendar day, and a bad team is dropped', () => {
  const entry = notionPageToEntry(page({
    Date: { type: 'date', date: { start: '2026-08-20T07:45:00.000+08:00' } },
    Team: { type: 'select', select: { name: 'Zebra' } },
  }), PROPS);

  assert.equal(entry.date, '2026-08-20');
  assert.equal(entry.team, '');
});

test('people properties are read, even though the names rarely match contacts', () => {
  const entry = notionPageToEntry(page({
    Date: { type: 'date', date: { start: '2026-08-20' } },
    Prefects: { type: 'people', people: [{ name: 'Calissa Wong' }] },
  }), PROPS);

  assert.deepEqual(entry.names, ['Calissa Wong']);
});

// ── writing back ────────────────────────────────────────────────────────────

test('builds Notion properties matching each column’s own type', () => {
  const out = entryToNotionProps(
    hubDay('2026-08-20', { names: ['Calissa', 'Angelia'] }),
    PROPS,
    { Date: 'date', Location: 'title', Time: 'rich_text', Team: 'select', Prefects: 'multi_select' },
  );

  assert.deepEqual(out.Date, { date: { start: '2026-08-20' } });
  assert.equal(out.Location.title[0].text.content, 'Front gate');
  assert.equal(out.Time.rich_text[0].text.content, '7:45am');
  assert.deepEqual(out.Team, { select: { name: 'A' } });
  assert.deepEqual(out.Prefects, { multi_select: [{ name: 'Calissa' }, { name: 'Angelia' }] });
});

test('unmapped columns are left out, and a people column is never written', () => {
  const out = entryToNotionProps(hubDay('2026-08-20'), { date: 'Date', names: 'Prefects' }, { Prefects: 'people' });

  assert.deepEqual(Object.keys(out), ['Date'], 'contact names cannot be resolved to Notion users');
});

test('an empty select is cleared rather than sent as an invalid empty name', () => {
  const out = entryToNotionProps(hubDay('2026-08-20', { team: '' }), PROPS, { Team: 'select' });
  assert.deepEqual(out.Team, { select: null });
});

// ── config and ids ──────────────────────────────────────────────────────────

test('sanitizes the config and drops unknown keys', () => {
  const cfg = sanitizeNotionConfig({
    enabled: 'yes', databaseId: '  abc  ', props: { date: 'Date', bogus: 'x' }, evil: 1,
  });

  assert.equal(cfg.enabled, false, 'only a real boolean enables the sync');
  assert.equal(cfg.databaseId, 'abc');
  assert.deepEqual(Object.keys(cfg).sort(), ['databaseId', 'enabled', 'lastSync', 'props']);
  assert.deepEqual(Object.keys(cfg.props).sort(), ['date', 'location', 'names', 'team', 'time']);
  assert.deepEqual(sanitizeNotionConfig(null), DEFAULT_NOTION_CONFIG);
});

test('the sync only counts as configured with an enable, an id and a date property', () => {
  assert.equal(isNotionConfigured({ enabled: true, databaseId: 'x', props: { date: 'Date' } }), true);
  assert.equal(isNotionConfigured({ enabled: false, databaseId: 'x', props: { date: 'Date' } }), false);
  assert.equal(isNotionConfigured({ enabled: true, databaseId: '', props: { date: 'Date' } }), false);
  assert.equal(isNotionConfigured({ enabled: true, databaseId: 'x', props: {} }), false);
});

test('accepts a raw id, a dashed id or a pasted Notion URL', () => {
  const dashed = '3a8f2659-86c0-806f-a655-000bfa917049';
  assert.equal(normalizeId(dashed), dashed);
  assert.equal(normalizeId('3a8f265986c0806fa655000bfa917049'), dashed);
  assert.equal(normalizeId('https://www.notion.so/Duty-3a8f265986c0806fa655000bfa917049?v=abc'), dashed);
  assert.equal(normalizeId('nonsense'), '');
});

// ── change detection ────────────────────────────────────────────────────────

test('entryDiffers sees field and name-list changes, including order', () => {
  const base = hubDay('2026-08-20');
  assert.equal(entryDiffers(base, { ...base }), false);
  assert.equal(entryDiffers(base, { ...base, location: 'Side gate' }), true);
  assert.equal(entryDiffers(base, { ...base, names: ['Calissa', 'Bo'] }), true);
  assert.equal(entryDiffers(base, { ...base, names: [] }), true);
  assert.equal(entryDiffers({ ...base, names: ['A', 'B'] }, { ...base, names: ['B', 'A'] }), true);
});
