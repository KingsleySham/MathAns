// Integration test for the handbook read-check conversation.
//
// The failure modes here are quiet ones: a correct code that is not recorded, a
// prefect who gets the generic "this is a no-reply number" brush-off instead of
// a confirmation, or a six-digit message swallowing someone's absence reason.
// None of them announce themselves, so they are worth pinning down.
//
// Redis and the Cloud API are stubbed; nothing leaves the machine.
// Run with: npm run test:prefects
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.WHATSAPP_TOKEN = 'test-token';
process.env.PHONE_NUMBER_ID = '000';
process.env.VHP_PHONE = '85200000000';

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

const sends = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes('graph.facebook.com')) {
    sends.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.test' }] }) };
  }
  throw new Error('unexpected fetch: ' + url);
};

const { handlePrefectText, startHandbookRound, getHandbookStatus } = await import('./prefect-messenger.js');
const { currentCode } = await import('./prefect-handbook.js');
const { handbookSecret } = await import('./prefect-handbook-store.js');

const CONTACTS = [
  { name: 'Calissa', phone: '85210000001', optIn: true },
  { name: 'Angelia', phone: '85210000002', optIn: true },
  { name: 'Mo', phone: '85210000003', optIn: false },
];

function seed() {
  store.clear();
  sends.length = 0;
  store.set('prefect:contacts', JSON.stringify(CONTACTS));
}

const texts = () => sends.filter((s) => s.type === 'text').map((s) => s.text.body);
const lastText = () => texts()[texts().length - 1] || '';
const codeNow = async () => currentCode(await handbookSecret(), Date.now());

// ── starting a round ────────────────────────────────────────────────────────

test('starting a round asks every opted-in prefect and includes the link', async () => {
  seed();
  const out = await startHandbookRound({ url: 'https://notion.so/handbook' });

  assert.equal(out.ok, true);
  assert.equal(out.sent, 2, 'the opted-out contact is not messaged');

  const notice = sends[0].template.components[0].parameters.map((p) => p.text).join(' ');
  assert.match(notice, /notion\.so\/handbook/, 'a prompt with no link is useless');
  assert.match(notice, /6-digit code/);
  assert.deepEqual([...new Set(sends.map((s) => s.template?.name))], ['prefect_notice'],
    'business-initiated, so it has to be an approved template');
});

test('a round with no link is refused rather than sending prefects nowhere', async () => {
  seed();
  const out = await startHandbookRound({ url: '  ' });

  assert.equal(out.ok, false);
  assert.match(out.error, /link is required/);
  assert.equal(sends.length, 0);
});

test('starting a round clears the previous confirmations', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  await handlePrefectText({ from: '85210000001', text: await codeNow() });
  assert.equal((await getHandbookStatus()).done, 1);

  await startHandbookRound({ url: 'https://notion.so/handbook' });
  assert.equal((await getHandbookStatus()).done, 0, 'a new change starts from nobody having read it');
});

test('starting a round invalidates the code that was on screen', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  const old = await codeNow();

  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;
  await handlePrefectText({ from: '85210000001', text: old });

  assert.equal((await getHandbookStatus()).done, 0, 'a screenshot doing the rounds must stop working');
  assert.match(lastText(), /Wrong code, try again/);
});

// ── confirming ──────────────────────────────────────────────────────────────

test('a correct code is recorded and acknowledged', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: await codeNow() });

  const status = await getHandbookStatus();
  assert.equal(status.done, 1);
  assert.equal(status.rows.find((r) => r.name === 'Calissa').done, true);
  assert.match(lastText(), /handbook confirmed/i, 'silence here just becomes a message to the VHP');
});

test('a code with the spacing a copy-paste leaves behind still works', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  const code = await codeNow();

  await handlePrefectText({ from: '85210000002', text: ` ${code.slice(0, 3)} ${code.slice(3)} ` });
  assert.equal((await getHandbookStatus()).done, 1);
});

test('sending it twice reads as reassurance, not an error', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  const code = await codeNow();

  await handlePrefectText({ from: '85210000001', text: code });
  sends.length = 0;
  await handlePrefectText({ from: '85210000001', text: code });

  assert.equal((await getHandbookStatus()).done, 1, 'still one person, not two');
  assert.match(lastText(), /already down/i);
});

test('a wrong code explains itself instead of the no-reply brush-off', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: '000000' });

  assert.equal((await getHandbookStatus()).done, 0);
  assert.match(lastText(), /Wrong code, try again/);
  assert.doesNotMatch(lastText(), /no-reply/, 'the generic redirect would leave them stuck');
});

// ── not claiming messages that are not codes ────────────────────────────────

test('with no round open, a six-digit message is not treated as a code', async () => {
  seed();
  await handlePrefectText({ from: '85210000001', text: '123456' });

  assert.match(lastText(), /no-reply number/, 'it falls through to the normal handling');
});

test('an absence reason is never mistaken for a code', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  store.set('prefect:awaiting:85210000001', JSON.stringify('2026-08-20'));
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: 'Medical appointment' });

  // lastText() would be the private relay to the VHP, which is sent after the
  // acknowledgement — check the whole conversation instead.
  assert.ok(texts().some((t) => /Noted, thanks/.test(t)), 'prose is a reason, not a code');
  assert.equal((await getHandbookStatus()).done, 0);
});

test('a prefect mid-absence-reason can still confirm the handbook', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  store.set('prefect:awaiting:85210000001', JSON.stringify('2026-08-20'));
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: await codeNow() });

  assert.equal((await getHandbookStatus()).done, 1);
  assert.ok(store.has('prefect:awaiting:85210000001'),
    'and is still asked for the reason afterwards — the code must not eat the question');
});

// ── the VHP is a prefect too ────────────────────────────────────────────────
//
// The webhook routes the VHP's number to handleVhpText rather than
// handlePrefectText, so every prefect-side flow has to be reachable from there
// as well. This one was not: a code from the VHP's own phone came back with the
// CANCEL command help instead of being recorded.

const { handleVhpText } = await import('./prefect-messenger.js');

test('the VHP can confirm the handbook from their own number', async () => {
  seed();
  store.set('prefect:contacts', JSON.stringify([
    ...CONTACTS, { name: 'Kingsley', phone: '85200000000', optIn: true },
  ]));
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handleVhpText({ from: '85200000000', text: await codeNow() });

  const status = await getHandbookStatus();
  assert.equal(status.rows.find((r) => r.name === 'Kingsley')?.done, true,
    'the VHP does morning duty like everyone else');
  assert.match(lastText(), /handbook confirmed/i);
  assert.doesNotMatch(texts().join(' '), /Command — CANCEL/,
    'the command help is what this bug looked like from the phone');
});

test('a wrong code from the VHP explains itself, not the command list', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handleVhpText({ from: '85200000000', text: '000000' });

  assert.match(lastText(), /Wrong code, try again/);
  assert.doesNotMatch(texts().join(' '), /Command — CANCEL/);
});

test('CANCEL and the help text still work for the VHP', async () => {
  seed();
  await handleVhpText({ from: '85200000000', text: 'hello' });
  assert.match(lastText(), /Command — CANCEL/, 'the command help must survive the new branch');

  sends.length = 0;
  await handleVhpText({ from: '85200000000', text: 'CANCEL' });
  assert.match(lastText(), /no suspension waiting/i, 'CANCEL still reaches approveCancel');
});

test('with no round open, a six-digit message from the VHP falls through to the commands', async () => {
  seed();
  await handleVhpText({ from: '85200000000', text: '123456' });

  assert.match(lastText(), /Command — CANCEL/);
});

// ── fumbled attempts ────────────────────────────────────────────────────────
//
// Reported from the phone: getting a digit wrong during the code step landed
// prefects on the generic "this is a no-reply number" reply, which reads as a
// dead end to someone who is trying to do exactly as they were asked.

test('a code that is a digit short gets help, not the no-reply brush-off', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: '48192' });

  assert.match(lastText(), /Wrong code, try again/);
  assert.doesNotMatch(lastText(), /no-reply/);
});

test('a code pasted with words around it still works', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: `the code is ${await codeNow()}` });

  assert.equal((await getHandbookStatus()).done, 1);
  assert.match(lastText(), /handbook confirmed/i);
});

test('a typo with a stray letter is treated as an attempt', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: '48192O' });

  assert.match(lastText(), /Wrong code, try again/);
});

test('a message with no digits at all is still not a code attempt', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: 'hello, who is this?' });

  assert.match(lastText(), /no-reply number/, 'an unrelated question still gets the redirect');
});

test('someone who already confirmed is told so, not sent back to the page', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  await handlePrefectText({ from: '85210000001', text: await codeNow() });
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: '12345' });

  assert.match(lastText(), /already down/i);
});

test('the VHP gets the same help for a fumbled code', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  sends.length = 0;

  await handleVhpText({ from: '85200000000', text: '48192' });

  assert.match(lastText(), /Wrong code, try again/);
  assert.doesNotMatch(texts().join(' '), /Command — CANCEL/);
});

test('an absence reason with a number in it is still a reason', async () => {
  seed();
  await startHandbookRound({ url: 'https://notion.so/handbook' });
  store.set('prefect:awaiting:85210000001', JSON.stringify('2026-08-20'));
  sends.length = 0;

  await handlePrefectText({ from: '85210000001', text: 'Doctor at 9:30' });

  assert.ok(texts().some((t) => /Noted, thanks/.test(t)),
    'the awaiting check runs first, so a number in a reason is never swallowed');
  assert.equal((await getHandbookStatus()).done, 0);
});
