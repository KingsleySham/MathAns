// Unit tests for the Notion sync rules.
//
// reconcile() decides what gets written and what gets DELETED on both sides, so
// a silent error here loses real duty days or shreds the VHP's Notion history.
// Two groups matter most:
//
//   • the window tests — the roster's automatic clean-up removes ended duty days,
//     and only the [today, horizon] window stops that reaching Notion;
//   • the hub-only-field tests — Notion carries date, time and status and nothing
//     else, so a sync that wins a conflict must not take location, team or names
//     with it. Those names are what the WhatsApp reminders match on.
//
// Run with: npm run test:prefects
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dutyPageTitle,
  entryDiffers,
  entryToNotionProps,
  formatDutyTime,
  fromNotionDate,
  notionPageToEntry,
  parseDutyTime,
  reconcile,
  sanitizeSeen,
  toNotionDate,
} from './prefect-notion-sync.js';
import {
  DEFAULT_NOTION_CONFIG,
  isCancelled,
  isNotionConfigured,
  sanitizeNotionConfig,
} from './prefect-duty-status-logic.js';
import { normalizeId } from './prefect-notion.js';

const TODAY = '2026-08-12';
const HORIZON = '2026-10-21'; // today + 70

// The real database: Date (date), Status (status), Name (title).
const PROPS = { date: 'Date', status: 'Status', title: 'Name' };

// A hub entry carries three synced fields plus the hub-only ones.
const hubDay = (date, over = {}) => ({
  date, time: '7:45am', status: 'On time',
  location: 'Front gate', team: 'A', names: ['Calissa'], ...over,
});

// What a Notion row becomes: only the three synced fields.
const notionDay = (date, over = {}) => ({
  date, time: '7:45am', status: 'On time',
  notionPageId: `page-${date}`, notionEditedAt: '2026-08-10T00:00:00.000Z', ...over,
});

const dates = (list) => list.map((e) => e.date);

// ── the window: the invariant that protects Notion history ──────────────────

test('past duty days are untouched on both sides, so the purge can never reach Notion', () => {
  const hub = [hubDay('2026-01-01', { notionPageId: 'page-old' }), hubDay('2026-08-20')];
  const notion = [notionDay('2026-01-01', { time: '9:00am' }), notionDay('2026-08-20')];

  const out = reconcile(hub, notion, TODAY, HORIZON, ['page-old']);

  const old = out.hubNext.find((e) => e.date === '2026-01-01');
  assert.equal(old.time, '7:45am', 'a past day must not be overwritten from Notion');
  assert.equal(out.toCreate.length, 0);
  assert.equal(out.toUpdate.length, 0);
  assert.equal(out.toArchive.length, 0);
  assert.equal(out.removed, 0, 'a past day linked to a page must never count as a deletion');
});

test('a hub day beyond the horizon is neither pushed nor dropped', () => {
  const out = reconcile([hubDay('2027-01-01')], [], TODAY, HORIZON);

  assert.deepEqual(dates(out.hubNext), ['2027-01-01']);
  assert.equal(out.toCreate.length, 0);
});

// ── hub-only fields must survive a sync ─────────────────────────────────────

test('a Notion win takes date, time and status — never location, team or names', () => {
  const hub = [hubDay('2026-08-20', {
    time: '7:45am', notionPageId: 'page-2026-08-20', updatedAt: '2026-08-01T00:00:00.000Z',
  })];
  const notion = [notionDay('2026-08-20', { time: '8:15am', status: 'Special', notionEditedAt: '2026-08-11T00:00:00.000Z' })];

  const [merged] = reconcile(hub, notion, TODAY, HORIZON, ['page-2026-08-20']).hubNext;

  assert.equal(merged.time, '8:15am', 'the synced fields come from Notion');
  assert.equal(merged.status, 'Special');
  assert.equal(merged.location, 'Front gate', 'Notion has no location column — it must not blank it');
  assert.equal(merged.team, 'A');
  assert.deepEqual(merged.names, ['Calissa'], 'losing these would silently stop the WhatsApp reminders');
});

test('a day arriving from Notion starts with empty hub-only fields, not undefined', () => {
  const [added] = reconcile([], [notionDay('2026-08-20')], TODAY, HORIZON).hubNext;

  assert.equal(added.location, '');
  assert.equal(added.team, '');
  assert.deepEqual(added.names, []);
  assert.equal(added.time, '7:45am');
});

test('editing only a hub-only field is not a difference worth pushing', () => {
  const hub = [hubDay('2026-08-20', {
    location: 'Side gate', names: ['Ana'], notionPageId: 'page-2026-08-20',
    updatedAt: '2026-08-11T00:00:00.000Z',
  })];

  const out = reconcile(hub, [notionDay('2026-08-20')], TODAY, HORIZON, ['page-2026-08-20']);

  assert.equal(out.toUpdate.length, 0, 'Notion cannot store these, so there is nothing to tell it');
  assert.equal(out.hubNext[0].location, 'Side gate');
});

// ── the pairing cases ───────────────────────────────────────────────────────

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
  const out = reconcile(hub, [], TODAY, HORIZON, []);

  assert.deepEqual(dates(out.hubNext), ['2026-08-20']);
  assert.equal(out.removed, 0);
  assert.equal(out.toArchive.length, 0);
});

test('an unchanged day on both sides produces no writes at all', () => {
  const hub = [hubDay('2026-08-20', { notionPageId: 'page-2026-08-20', updatedAt: '2026-08-11T00:00:00.000Z' })];
  const out = reconcile(hub, [notionDay('2026-08-20')], TODAY, HORIZON, ['page-2026-08-20']);

  assert.equal(out.toUpdate.length, 0);
  assert.equal(out.toCreate.length, 0);
  assert.equal(out.removed, 0);
});

// ── last-write-wins ─────────────────────────────────────────────────────────

test('the newer hub edit wins and is pushed to Notion', () => {
  const hub = [hubDay('2026-08-20', {
    time: '8:15am', notionPageId: 'page-2026-08-20', updatedAt: '2026-08-11T09:00:00.000Z',
  })];
  const out = reconcile(hub, [notionDay('2026-08-20')], TODAY, HORIZON, ['page-2026-08-20']);

  assert.deepEqual(dates(out.toUpdate), ['2026-08-20']);
  assert.equal(out.hubNext[0].time, '8:15am');
});

test('an unstamped hub day loses to Notion rather than guessing', () => {
  const hub = [hubDay('2026-08-20', { status: 'Tentative', notionPageId: 'page-2026-08-20' })];
  const out = reconcile(hub, [notionDay('2026-08-20', { status: 'Cancelled' })], TODAY, HORIZON, ['page-2026-08-20']);

  assert.equal(out.hubNext[0].status, 'Cancelled');
});

test('identical timestamps write nothing — a tie must not ping-pong', () => {
  const stamp = '2026-08-11T00:00:00.000Z';
  const hub = [hubDay('2026-08-20', { time: '8:15am', notionPageId: 'page-2026-08-20', updatedAt: stamp })];
  const notion = [notionDay('2026-08-20', { time: '9:00am', notionEditedAt: stamp })];

  const out = reconcile(hub, notion, TODAY, HORIZON, ['page-2026-08-20']);

  assert.equal(out.toUpdate.length, 0);
  assert.equal(out.hubNext[0].time, '8:15am', 'the hub copy is left as-is');
});

test('an unlinked hub day pairs with a Notion row on the same date instead of duplicating', () => {
  const out = reconcile([hubDay('2026-08-20')], [notionDay('2026-08-20')], TODAY, HORIZON);

  assert.equal(out.hubNext.length, 1, 'the same day must not appear twice after the first sync');
  assert.equal(out.hubNext[0].notionPageId, 'page-2026-08-20');
  assert.equal(out.toCreate.length, 0);
});

test('the output stays date-sorted', () => {
  const out = reconcile([hubDay('2026-09-05')], [notionDay('2026-08-20')], TODAY, HORIZON);
  assert.deepEqual(dates(out.hubNext), ['2026-08-20', '2026-09-05']);
});

// ── deletions ───────────────────────────────────────────────────────────────

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

// ── duty time ↔ Notion datetime ─────────────────────────────────────────────

test('parses the time formats the VHP actually types', () => {
  assert.deepEqual(parseDutyTime('7:45am'), { hour: 7, minute: 45 });
  assert.deepEqual(parseDutyTime('7:45AM'), { hour: 7, minute: 45 });
  assert.deepEqual(parseDutyTime(' 7.45 am '), { hour: 7, minute: 45 });
  assert.deepEqual(parseDutyTime('07:45'), { hour: 7, minute: 45 });
  assert.deepEqual(parseDutyTime('7am'), { hour: 7, minute: 0 });
  assert.deepEqual(parseDutyTime('3:30pm'), { hour: 15, minute: 30 });
});

test('handles the two times everyone gets wrong', () => {
  assert.deepEqual(parseDutyTime('12:00am'), { hour: 0, minute: 0 }, 'midnight');
  assert.deepEqual(parseDutyTime('12:30pm'), { hour: 12, minute: 30 }, 'just after noon');
});

test('rejects nonsense rather than inventing a time', () => {
  for (const bad of ['', 'soon', '25:00', '7:99', '13:00pm', 'morning']) {
    assert.equal(parseDutyTime(bad), null, `should reject "${bad}"`);
  }
});

test('formats back into the roster’s own wording', () => {
  assert.equal(formatDutyTime({ hour: 7, minute: 45 }), '7:45am');
  assert.equal(formatDutyTime({ hour: 0, minute: 0 }), '12:00am');
  assert.equal(formatDutyTime({ hour: 12, minute: 0 }), '12:00pm');
  assert.equal(formatDutyTime({ hour: 15, minute: 5 }), '3:05pm');
});

test('a date and time round-trip through Notion unchanged', () => {
  const { start } = toNotionDate('2026-09-02', '7:45am');
  assert.equal(start, '2026-09-02T07:45:00.000+08:00');
  assert.deepEqual(fromNotionDate(start), { date: '2026-09-02', time: '7:45am' });
});

test('a duty with no time becomes a date-only Notion value', () => {
  assert.deepEqual(toNotionDate('2026-09-02', ''), { start: '2026-09-02' });
  assert.deepEqual(toNotionDate('2026-09-02', 'whenever'), { start: '2026-09-02' });
  assert.deepEqual(fromNotionDate('2026-09-02'), { date: '2026-09-02', time: '' });
});

test('a time entered in another timezone lands on the right Hong Kong day', () => {
  // 23:30 UTC on the 1st is 07:30 on the 2nd in Hong Kong.
  assert.deepEqual(fromNotionDate('2026-09-01T23:30:00.000Z'), { date: '2026-09-02', time: '7:30am' });
});

test('the page title follows the house convention', () => {
  assert.equal(dutyPageTitle('2026-09-09'), '9/9 Prefect Duty');
  assert.equal(dutyPageTitle('2026-09-02'), '2/9 Prefect Duty', 'no leading zeros, matching the existing rows');
  assert.equal(dutyPageTitle('2026-12-25'), '25/12 Prefect Duty');
  assert.equal(dutyPageTitle('nonsense'), 'Prefect Duty');
});

// ── reading Notion pages ────────────────────────────────────────────────────

const page = (properties, over = {}) => ({
  id: 'page-1', last_edited_time: '2026-08-11T00:00:00.000Z', properties, ...over,
});

test('reads a row into the three synced fields', () => {
  const entry = notionPageToEntry(page({
    Date: { type: 'date', date: { start: '2026-09-02T07:45:00.000+08:00' } },
    Status: { type: 'status', status: { name: 'On time' } },
    Name: { type: 'title', title: [{ plain_text: '2/9 Prefect Duty' }] },
  }), PROPS);

  assert.deepEqual(entry, {
    date: '2026-09-02',
    time: '7:45am',
    status: 'On time',
    notionPageId: 'page-1',
    notionEditedAt: '2026-08-11T00:00:00.000Z',
  });
});

test('a row with only a date still syncs; one with none is skipped', () => {
  const bare = notionPageToEntry(page({ Date: { type: 'date', date: { start: '2026-09-02' } } }), PROPS);
  assert.equal(bare.date, '2026-09-02');
  assert.equal(bare.time, '');
  assert.equal(bare.status, '');

  assert.equal(notionPageToEntry(page({ Date: { type: 'date', date: null } }), PROPS), null);
  assert.equal(notionPageToEntry(page({}), PROPS), null);
});

// ── writing back ────────────────────────────────────────────────────────────

test('writes the generated title, the datetime and the status', () => {
  const out = entryToNotionProps(
    hubDay('2026-09-09', { time: '7:45am', status: 'On time' }),
    PROPS,
    { Date: 'date', Status: 'status', Name: 'title' },
  );

  assert.deepEqual(out.Date, { date: { start: '2026-09-09T07:45:00.000+08:00' } });
  assert.equal(out.Name.title[0].text.content, '9/9 Prefect Duty');
  assert.deepEqual(out.Status, { status: { name: 'On time' } });
});

test('never sends location, team or names — the database has no columns for them', () => {
  const out = entryToNotionProps(hubDay('2026-09-09'), PROPS, { Date: 'date', Status: 'status', Name: 'title' });

  assert.deepEqual(Object.keys(out).sort(), ['Date', 'Name', 'Status']);
});

test('a blank status is left alone rather than clearing what Notion holds', () => {
  const out = entryToNotionProps(hubDay('2026-09-09', { status: '' }), PROPS, { Status: 'status', Date: 'date' });

  assert.equal('Status' in out, false);
});

test('unmapped columns are simply skipped', () => {
  const out = entryToNotionProps(hubDay('2026-09-09'), { date: 'Date' }, { Date: 'date' });
  assert.deepEqual(Object.keys(out), ['Date']);
});

// ── config and ids ──────────────────────────────────────────────────────────

test('a cleared mapping stays cleared — the sanitizer never re-injects defaults', () => {
  assert.deepEqual(DEFAULT_NOTION_CONFIG.props, { date: '', status: '', title: '' });
  assert.deepEqual(
    sanitizeNotionConfig({ enabled: true, databaseId: 'x', props: { date: 'Date', status: '', title: '' } }).props,
    { date: 'Date', status: '', title: '' },
    'clearing Status must switch that column off, not come back on the next save',
  );
});

test('sanitizes the config and drops unknown keys', () => {
  const cfg = sanitizeNotionConfig({
    enabled: 'yes', databaseId: '  abc  ', props: { date: 'Date', bogus: 'x' }, evil: 1,
    statusOptions: ['On time', 'On time', '', 'Cancelled'],
  });

  assert.equal(cfg.enabled, false, 'only a real boolean enables the sync');
  assert.equal(cfg.databaseId, 'abc');
  assert.deepEqual(Object.keys(cfg).sort(), ['databaseId', 'enabled', 'lastSync', 'props', 'statusOptions']);
  assert.deepEqual(Object.keys(cfg.props).sort(), ['date', 'status', 'title']);
  assert.deepEqual(cfg.statusOptions, ['On time', 'Cancelled']);
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

// ── cancelled duties ────────────────────────────────────────────────────────

test('only Cancelled is treated as “nobody turns up”', () => {
  assert.equal(isCancelled({ status: 'Cancelled' }), true);
  assert.equal(isCancelled({ status: 'cancelled' }), true, 'the option name is the VHP’s to case as they like');
  assert.equal(isCancelled({ status: 'On time' }), false);
  assert.equal(isCancelled({ status: 'Tentative' }), false, 'tentative duties still go ahead');
  assert.equal(isCancelled({ status: 'Special' }), false);
  assert.equal(isCancelled({}), false);
});

// ── change detection ────────────────────────────────────────────────────────

test('entryDiffers looks at the synced fields only', () => {
  const base = hubDay('2026-08-20');
  assert.equal(entryDiffers(base, { ...base }), false);
  assert.equal(entryDiffers(base, { ...base, time: '8:15am' }), true);
  assert.equal(entryDiffers(base, { ...base, status: 'Cancelled' }), true);
  assert.equal(entryDiffers(base, { ...base, date: '2026-08-21' }), true);
  assert.equal(entryDiffers(base, { ...base, location: 'Side gate' }), false, 'not synced, not a difference');
  assert.equal(entryDiffers(base, { ...base, names: ['Someone else'] }), false);
});
