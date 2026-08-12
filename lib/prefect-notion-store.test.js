// Integration test for syncWithNotion — the orchestration around the pure rules
// in prefect-notion-sync.js. Redis and the Notion API are both stubbed, so
// nothing leaves the machine.
//
// What this is really guarding is the deletion semantics. A two-way sync that
// gets them wrong either resurrects days the admin deleted or quietly archives
// rows nobody asked it to touch, and neither failure is loud.
//
// Run with: npm run test:prefects
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.NOTION_TOKEN = 'secret_test';

const store = new Map();
mock.module('./prefect-redis-client.js', {
  namedExports: {
    getRedisClient: async () => ({
      get: async (k) => (store.has(k) ? store.get(k) : null),
      set: async (k, v) => { store.set(k, v); return 'OK'; },
      del: async (k) => { store.delete(k); return 1; },
    }),
  },
});

// ── stubbed Notion ──────────────────────────────────────────────────────────

const calls = [];
let notionPages = [];

const PROPS = { date: 'Date', location: 'Location', time: 'Time', team: 'Team', names: 'Prefects' };
const SCHEMA = {
  Date: { type: 'date' }, Location: { type: 'rich_text' }, Time: { type: 'rich_text' },
  Team: { type: 'select' }, Prefects: { type: 'multi_select' },
};

globalThis.fetch = async (url, init) => {
  const path = String(url).replace('https://api.notion.com/v1', '');
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ method: init.method, path, body });

  if (init.method === 'GET' && path.startsWith('/databases/')) {
    return { ok: true, json: async () => ({ id: 'db', title: [{ plain_text: 'Duty' }], properties: SCHEMA }) };
  }
  if (init.method === 'POST' && path.endsWith('/query')) {
    return { ok: true, json: async () => ({ results: notionPages, has_more: false }) };
  }
  if (init.method === 'POST' && path === '/pages') {
    return { ok: true, json: async () => ({ id: 'page-new' }) };
  }
  if (init.method === 'PATCH' && path.startsWith('/pages/')) {
    return { ok: true, json: async () => ({ id: path.split('/')[2] }) };
  }
  throw new Error('unexpected Notion call: ' + init.method + ' ' + path);
};

const { syncWithNotion } = await import('./prefect-roster-store.js');

const TODAY = '2026-08-12';
const SOON = '2026-08-20';

const notionPage = (id, date, over = {}) => ({
  id,
  last_edited_time: '2026-08-10T00:00:00.000Z',
  properties: {
    Date: { type: 'date', date: { start: date } },
    Location: { type: 'rich_text', rich_text: [{ plain_text: 'Front gate' }] },
    Time: { type: 'rich_text', rich_text: [{ plain_text: '7:45am' }] },
    Team: { type: 'select', select: { name: 'A' } },
    Prefects: { type: 'multi_select', multi_select: [{ name: 'Calissa' }] },
  },
  ...over,
});

const hubDay = (date, over = {}) => ({
  date, location: 'Front gate', time: '7:45am', team: 'A', names: ['Calissa'], ...over,
});

function seed({ roster = [], seen = [], pages = [] } = {}) {
  store.clear();
  calls.length = 0;
  notionPages = pages;
  store.set('prefect:roster', JSON.stringify(roster));
  store.set('prefect:notion-seen', JSON.stringify(seen));
  store.set('prefect:settings', JSON.stringify({
    defaults: { location: '', time: '', team: '' },
    retention: { enabled: true, days: 7 },
    notion: { enabled: true, databaseId: '3a8f2659-86c0-806f-a655-000bfa917049', props: PROPS },
  }));
}

const roster = () => JSON.parse(store.get('prefect:roster'));
const seen = () => JSON.parse(store.get('prefect:notion-seen'));
const called = (method, prefix) => calls.filter((c) => c.method === method && c.path.startsWith(prefix));

// ── pulling ─────────────────────────────────────────────────────────────────

test('a new Notion row lands in the roster and is remembered', async () => {
  seed({ pages: [notionPage('page-a', SOON)] });

  const out = await syncWithNotion(TODAY);

  assert.equal(out.ok, true);
  assert.equal(out.pulled, 1);
  assert.deepEqual(roster().map((e) => e.date), [SOON]);
  assert.equal(roster()[0].notionPageId, 'page-a');
  assert.deepEqual(seen(), ['page-a'], 'remembering it is what lets a later deletion stick');
  assert.equal(called('POST', '/pages').length, 0, 'nothing to push back');
});

test('the date-range filter is scoped to the window, so past rows are never fetched', async () => {
  seed();
  await syncWithNotion(TODAY);

  const [{ body }] = calls.filter((c) => c.path.endsWith('/query'));
  assert.equal(body.filter.and[0].date.on_or_after, TODAY);
  assert.equal(body.filter.and[1].date.on_or_before, '2026-10-21'); // today + 70
});

// ── pushing ─────────────────────────────────────────────────────────────────

test('a hub day that Notion has never seen is created there and linked back', async () => {
  seed({ roster: [hubDay(SOON)] });

  const out = await syncWithNotion(TODAY);

  const [create] = called('POST', '/pages');
  assert.ok(create, 'the day should be created in Notion');
  assert.deepEqual(create.body.properties.Date, { date: { start: SOON } });
  assert.deepEqual(create.body.properties.Team, { select: { name: 'A' } });
  assert.deepEqual(create.body.properties.Prefects, { multi_select: [{ name: 'Calissa' }] });

  assert.equal(out.pushed, 1);
  assert.equal(roster()[0].notionPageId, 'page-new', 'linked, so the next run does not duplicate it');
  assert.deepEqual(seen(), ['page-new']);
});

test('a newer hub edit is pushed; a newer Notion edit is not', async () => {
  seed({
    roster: [hubDay(SOON, { location: 'Side gate', notionPageId: 'page-a', updatedAt: '2026-08-11T00:00:00.000Z' })],
    seen: ['page-a'],
    pages: [notionPage('page-a', SOON)], // edited 08-10, older
  });

  const out = await syncWithNotion(TODAY);

  const [update] = called('PATCH', '/pages/page-a');
  assert.ok(update, 'the newer hub edit should win');
  assert.equal(update.body.properties.Location.rich_text[0].text.content, 'Side gate');
  assert.equal(out.pushed, 1);
});

test('a newer Notion edit overwrites the hub without being pushed back', async () => {
  seed({
    roster: [hubDay(SOON, { location: 'Side gate', notionPageId: 'page-a', updatedAt: '2026-08-01T00:00:00.000Z' })],
    seen: ['page-a'],
    pages: [notionPage('page-a', SOON, { last_edited_time: '2026-08-11T00:00:00.000Z' })],
  });

  await syncWithNotion(TODAY);

  assert.equal(roster()[0].location, 'Front gate', 'Notion wins');
  assert.equal(called('PATCH', '/pages/').length, 0, 'and the loser is not written back');
});

// ── deletions, both directions ──────────────────────────────────────────────

test('a day deleted in the hub is archived in Notion, not resurrected', async () => {
  // The admin deleted it in the editor, so it is already absent from the roster;
  // only `seen` records that it was ever linked.
  seed({ roster: [], seen: ['page-a'], pages: [notionPage('page-a', SOON)] });

  const out = await syncWithNotion(TODAY);

  const [archive] = called('PATCH', '/pages/page-a');
  assert.ok(archive, 'it should be archived in Notion');
  assert.equal(archive.body.archived, true);
  assert.deepEqual(roster(), [], 'and must NOT come back into the roster');
  assert.equal(out.archived, 1);
  assert.deepEqual(seen(), [], 'and is forgotten once archived');
});

test('a row deleted in Notion drops the day from the hub', async () => {
  seed({ roster: [hubDay(SOON, { notionPageId: 'page-a' })], seen: ['page-a'], pages: [] });

  const out = await syncWithNotion(TODAY);

  assert.deepEqual(roster(), []);
  assert.equal(out.removed, 1);
  assert.equal(called('PATCH', '/pages/').length, 0, 'nothing to archive — it is already gone');
});

test('a linked day with no sync state is left alone rather than deleted on a guess', async () => {
  seed({ roster: [hubDay(SOON, { notionPageId: 'page-a' })], seen: [], pages: [] });

  const out = await syncWithNotion(TODAY);

  assert.deepEqual(roster().map((e) => e.date), [SOON], 'lost sync state must not delete duty days');
  assert.equal(out.removed, 0);
});

test('a failed archive stays remembered so the next run retries it', async () => {
  seed({ roster: [], seen: ['page-a'], pages: [notionPage('page-a', SOON)] });
  const ok = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'PATCH') return { ok: false, json: async () => ({ message: 'no permission' }) };
    return ok(url, init);
  };

  const out = await syncWithNotion(TODAY);
  globalThis.fetch = ok;

  assert.equal(out.archived, 0);
  assert.match(out.error, /archive page-a/);
  assert.deepEqual(seen(), ['page-a'], 'forgetting it would re-import the row as a new duty day');
});

// ── the window, again, through the real orchestration ───────────────────────

test('a past duty day in the roster survives a sync untouched', async () => {
  seed({ roster: [hubDay('2026-01-01', { notionPageId: 'page-old' })], seen: ['page-old'], pages: [] });

  await syncWithNotion(TODAY);

  assert.deepEqual(roster().map((e) => e.date), ['2026-01-01'], 'history is outside the window');
  assert.equal(called('PATCH', '/pages/').length, 0, 'and is never archived in Notion');
});

// ── configuration guard ─────────────────────────────────────────────────────

test('an unconfigured sync does nothing and says so', async () => {
  seed();
  store.set('prefect:settings', JSON.stringify({ notion: { enabled: true, databaseId: '', props: {} } }));

  const out = await syncWithNotion(TODAY);

  assert.equal(out.ok, false);
  assert.match(out.error, /not configured/);
  assert.equal(calls.length, 0, 'it must not call Notion at all');
});
