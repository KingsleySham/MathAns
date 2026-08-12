// Integration test for the morning weather update.
//
// The audience here is a VHP decision, not an implementation detail: the
// message goes to the WHOLE board on a duty day, and it must not be the
// duty-reminder template, whose body would tell every non-rostered prefect
// they are on duty. Both are easy to regress silently, since nothing fails
// loudly if the wrong people get messaged — hence this test.
//
// Redis and the Cloud API are stubbed; nothing leaves the machine.
// Run with: npm run test:prefects
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.WHATSAPP_TOKEN = 'test-token';
process.env.PHONE_NUMBER_ID = '000';
process.env.VHP_PHONE = '85200000000';

// ── in-memory Redis ─────────────────────────────────────────────────────────

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

// ── stubbed upstreams ───────────────────────────────────────────────────────

const sends = [];
const THUNDERSTORM = { WTS: { code: 'WTS', name: 'Thunderstorm Warning', actionCode: 'ISSUE' } };

globalThis.fetch = async (url, init) => {
  if (String(url).includes('weather.gov.hk')) {
    return { ok: true, json: async () => THUNDERSTORM };
  }
  if (String(url).includes('graph.facebook.com')) {
    sends.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.test' }] }) };
  }
  throw new Error('unexpected fetch: ' + url);
};

const { morningCheck } = await import('./prefect-messenger.js');

const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// Five prefects on the board; only two are rostered today.
const CONTACTS = [
  { name: 'Calissa', phone: '85210000001', optIn: true },
  { name: 'Angelia', phone: '85210000002', optIn: true },
  { name: 'Ruby', phone: '85210000003', optIn: true },
  { name: 'Tobias', phone: '85210000004', optIn: true },
  { name: 'Mo', phone: '85210000005', optIn: false }, // never messaged
];

function seed() {
  store.clear();
  sends.length = 0;
  store.set('prefect:contacts', JSON.stringify(CONTACTS));
  store.set('prefect:roster', JSON.stringify([
    { date: TODAY, location: 'Front gate', time: '7:45am', team: 'A', names: ['Calissa', 'Angelia'] },
  ]));
}

const recipients = () => sends.map((s) => s.to).sort();
const templates = () => [...new Set(sends.map((s) => s.template?.name))];

test('the weather notice goes to every opted-in prefect, not just the day’s team', async () => {
  seed();
  const out = await morningCheck({ minutesNow: 7 * 60 });

  assert.equal(out.held, false);
  assert.equal(out.weatherUpdate.sent, 4, 'all four opted-in prefects should get it');
  assert.deepEqual(recipients(), [
    '85210000001', '85210000002', '85210000003', '85210000004',
  ], 'the two unrostered prefects are included; the opted-out one is not');
});

test('it uses the notice template, never the duty-reminder one', async () => {
  seed();
  await morningCheck({ minutesNow: 7 * 60 });

  assert.deepEqual(templates(), ['prefect_notice']);
  assert.ok(
    !sends.some((s) => s.template?.name === 'prefect_duty_reminder_weather'),
    'prefect_duty_reminder_weather says "you\'ll be having duty" — it must not go to the whole board',
  );
});

test('the body carries the warning and the date, and no per-prefect duty claim', async () => {
  seed();
  await morningCheck({ minutesNow: 7 * 60 });

  const params = sends[0].template.components[0].parameters;
  const notice = params.map((p) => p.text).join(' ');

  assert.match(notice, /Thunderstorm Warning is in force/);
  assert.match(notice, /Duty is on today/);
  assert.doesNotMatch(notice, /you'll be having duty/i);
  assert.doesNotMatch(notice, /Front gate/, 'the gate would imply the reader is rostered');
});

test('it is sent at most once a day', async () => {
  seed();
  await morningCheck({ minutesNow: 7 * 60 });
  const first = sends.length;

  const second = await morningCheck({ minutesNow: 7 * 60 });
  assert.equal(sends.length, first, 'a second run must not re-send');
  assert.equal(second.weatherUpdate.note, 'already sent today');
});

test('no duty on the roster today means nobody is messaged', async () => {
  seed();
  store.set('prefect:roster', JSON.stringify([]));

  const out = await morningCheck({ minutesNow: 7 * 60 });
  assert.equal(sends.length, 0);
  assert.match(out.reason, /no duty-affecting warning|no duty/);
});

test('a suspending signal still messages the VHP only, never the board', async () => {
  seed();
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('weather.gov.hk')) {
      return { ok: true, json: async () => ({ WRAIN: { code: 'WRAINB', name: 'Rainstorm Warning', actionCode: 'ISSUE' } }) };
    }
    sends.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.test' }] }) };
  };

  const out = await morningCheck({ minutesNow: 7 * 60 });
  assert.equal(out.held, true, 'a Black Rainstorm holds the suspension for VHP approval');
  assert.deepEqual([...new Set(recipients())], ['85200000000'], 'only the VHP is told');
});
