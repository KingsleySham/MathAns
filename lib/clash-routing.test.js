// Integration test for the lesson-clash conversation — and, just as
// importantly, for what it refuses to touch.
//
// The clash flow and the Prefect Hub share one WhatsApp number. The dangerous
// failure is not a broken clash message; it is a clash handler quietly eating
// a prefect's confirmation, the VHP's CANCEL, or a handbook code. Half of this
// file is therefore about handleClashWebhook() returning false.
//
// Redis and the Cloud API are stubbed; nothing leaves the machine.
// Run with: npm run test:clash
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.WHATSAPP_TOKEN = 'test-token';
process.env.PHONE_NUMBER_ID = '000';
process.env.VHP_PHONE = '85290000001'; // Kingsley is the VHP as well as the son

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

const { handleClashWebhook, openClash } = await import('./clash-messenger.js');

const KINGSLEY = '85290000001';
const MUM = '85290000002';
const DAD = '85290000003';
const PREFECT = '85210000009';

const RECIPIENTS = [
  { name: 'Kingsley', phone: KINGSLEY, relation: 'me', notify: true },
  { name: 'Jessica', phone: MUM, relation: 'mum', notify: true },
  { name: 'Andy', phone: DAD, relation: 'dad', notify: true },
];

const LESSONS = [
  { code: '1', name: 'Japanese', tutor: '', when: 'Tuesday 6pm' },
  { code: '2', name: 'Piano', tutor: '', when: 'Wednesday 6pm' },
  { code: '3', name: 'Math', tutor: '', when: 'Thursday 6:30pm' },
];

function seed() {
  store.clear();
  sends.length = 0;
  store.set('clash:recipients', JSON.stringify(RECIPIENTS));
  store.set('clash:lessons', JSON.stringify(LESSONS));
}

const text = (from, body) => ({ from, msg: { type: 'text', text: { body } } });
const button = (from, payload, label) => ({ from, msg: { button: { payload, text: label || '' } } });
const listReply = (from, id) => ({ from, msg: { interactive: { type: 'list_reply', list_reply: { id, title: '' } } } });

const templates = () => sends.filter((s) => s.type === 'template');
const texts = () => sends.filter((s) => s.type === 'text');
const lastText = () => texts()[texts().length - 1]?.text?.body || '';
const interactives = () => sends.filter((s) => s.type === 'interactive');
const paramsOf = (send, component) => Object.fromEntries(
  send.template.components.find((c) => c.type === component).parameters.map((p) => [p.parameter_name, p.text]),
);

// ── the WhatsApp conversation ───────────────────────────────────────────────

test('"clash" asks which tutorials, listing the codes', async () => {
  seed();
  const claimed = await handleClashWebhook(text(KINGSLEY, 'clash'));

  assert.equal(claimed, true);
  assert.match(lastText(), /Which tutorial/i);
  assert.match(lastText(), /1\. Japanese/, 'the codes have to be shown or they cannot be typed');
  assert.match(lastText(), /3\. Math/);
});

test('the full flow: codes, then the event, then the template to all three', async () => {
  seed();
  await handleClashWebhook(text(KINGSLEY, 'clash'));
  await handleClashWebhook(text(KINGSLEY, '1,3'));
  assert.match(lastText(), /What is it clashing with/i);

  await handleClashWebhook(text(KINGSLEY, 'HKYAS — 16/8-19/8'));

  const sent = templates();
  assert.equal(sent.length, 3, 'Kingsley, Mum and Dad');
  assert.deepEqual(sent.map((s) => s.to).sort(), [KINGSLEY, MUM, DAD].sort());
  assert.deepEqual([...new Set(sent.map((s) => s.template.name))], ['class_clash']);

  const body = paramsOf(sent[0], 'body');
  assert.equal(body.tutorial_1, '1️⃣ Tuesday 6pm - Japanese');
  assert.equal(body.tutorial_2, '3️⃣ Thursday 6:30pm - Math', 'the code typed is the code shown');
  assert.equal(body.tutorial_3, 'N/A');
  assert.equal(body.events, 'HKYAS (16/8-19/8)');
  assert.equal(body.tutorial_arranged, 'N/A');
  assert.match(paramsOf(sent[0], 'header').day, /^\d{1,2}\/\d{1,2}$/);

  const buttonComponent = sent[0].template.components.find((c) => c.type === 'button');
  assert.match(buttonComponent.parameters[0].payload, /^CLASH_DONE:/,
    'without a payload the tap cannot be tied back to this clash');
});

test('an unknown code is corrected instead of sending a wrong message', async () => {
  seed();
  await handleClashWebhook(text(KINGSLEY, 'clash'));
  await handleClashWebhook(text(KINGSLEY, '9'));

  assert.match(lastText(), /don't have a lesson with the code \*9\*/);
  assert.equal(templates().length, 0, 'nothing goes out until the codes are valid');
});

test('"stop" abandons a half-finished clash', async () => {
  seed();
  await handleClashWebhook(text(KINGSLEY, 'clash'));
  await handleClashWebhook(text(KINGSLEY, '1'));
  await handleClashWebhook(text(KINGSLEY, 'stop'));

  assert.match(lastText(), /Cancelled/);
  assert.equal(templates().length, 0);

  // And the draft is really gone: the next text is not read as an event.
  const claimed = await handleClashWebhook(text(KINGSLEY, 'anything at all'));
  assert.equal(claimed, false, 'a finished draft must not keep swallowing texts');
});

// ── the buttons ─────────────────────────────────────────────────────────────

async function openOne(codes = ['1', '3']) {
  seed();
  const out = await openClash({ codes, events: [{ name: 'HKYAS', when: '16/8' }], via: 'web' });
  sends.length = 0;
  return out.case;
}

test('"Actions taken" goes straight to the list of lessons still to arrange', async () => {
  const c = await openOne();
  const claimed = await handleClashWebhook(button(MUM, `CLASH_DONE:${c.id}`, 'Actions taken 已完成調堂'));

  assert.equal(claimed, true);
  assert.equal(interactives().length, 1, 'no "which lesson?" step in between');
  const [{ interactive, to }] = interactives();
  assert.equal(interactive.type, 'list');
  assert.equal(to, MUM, 'only the person who tapped is asked');

  const rows = interactive.action.sections[0].rows;
  assert.deepEqual(rows.map((r) => r.id), [`CLASH_FIX:${c.id}:1`, `CLASH_FIX:${c.id}:3`]);
  assert.deepEqual(rows.map((r) => r.title), ['1️⃣ Japanese', '3️⃣ Math']);
  assert.ok(rows.every((r) => r.title.length <= 24), 'WhatsApp truncates a row title past 24 characters');
});

test('the retired "show lessons" button still works from an old message', async () => {
  // Those messages stay in the chat after the deploy that removed the step.
  const c = await openOne();
  await handleClashWebhook(button(MUM, `CLASH_PICK:${c.id}`));

  assert.equal(interactives()[0].interactive.type, 'list');
});

test('tapping "Actions taken" on a finished clash says so instead of showing an empty list', async () => {
  const c = await openOne(['1']);
  await handleClashWebhook(listReply(MUM, `CLASH_FIX:${c.id}:1`));
  sends.length = 0;

  await handleClashWebhook(button(DAD, `CLASH_DONE:${c.id}`));
  assert.equal(interactives().length, 0);
  assert.match(lastText(), /already marked as arranged/i);
});

test('picking a lesson re-sends the alert to all three with it moved to Arranged', async () => {
  const c = await openOne();
  await handleClashWebhook(listReply(DAD, `CLASH_FIX:${c.id}:1`));

  const resent = templates();
  assert.equal(resent.length, 3, 'still outstanding, so the template goes again — to everyone');
  assert.deepEqual([...new Set(resent.map((s) => s.template.name))], ['class_clash']);
  const body = paramsOf(resent[0], 'body');
  assert.equal(body.tutorial_1, '3️⃣ Thursday 6:30pm - Math', 'only the outstanding lesson is still a clash');
  assert.equal(body.tutorial_2, 'N/A');
  assert.equal(body.tutorial_arranged, '1️⃣ Tuesday 6pm - Japanese');
  assert.equal(texts().length, 0, 'the template says it all — no second message per tap');
});

test('the last lesson sends the sign-off template instead, with no buttons', async () => {
  const c = await openOne(['1', '2']);
  await handleClashWebhook(listReply(KINGSLEY, `CLASH_FIX:${c.id}:1`));
  sends.length = 0;
  await handleClashWebhook(listReply(KINGSLEY, `CLASH_FIX:${c.id}:2`));

  const done = templates();
  assert.equal(done.length, 3);
  assert.deepEqual([...new Set(done.map((s) => s.template.name))], ['class_clash_done']);
  assert.equal(done[0].template.components.some((comp) => comp.type === 'button'), false,
    'there is nothing left to tap, so the sign-off carries no button');

  const body = paramsOf(done[0], 'body');
  assert.equal(body.tutorial_1, '1️⃣ Tuesday 6pm - Japanese', 'the sign-off lists what was arranged');
  assert.equal(body.tutorial_2, '2️⃣ Wednesday 6pm - Piano');
  assert.equal(body.tutorial_3, 'N/A');
  assert.deepEqual(JSON.parse(store.get('clash:open')), [], 'and it drops off the open list');
});

test('an unapproved sign-off template still gets the news out', async () => {
  // class_clash_done has to be approved in Meta separately; until it is, the
  // family must still be told the clash is over.
  const c = await openOne(['1']);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.template?.name === 'class_clash_done') {
      return { ok: false, json: async () => ({ error: { code: 132001, message: 'template does not exist' } }) };
    }
    return realFetch(url, init);
  };
  try {
    await handleClashWebhook(listReply(MUM, `CLASH_FIX:${c.id}:1`));
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(texts().length, 3, 'all three fall back to a plain summary');
  assert.match(lastText(), /All clashed tutorial\(s\) have been arranged/);
  assert.match(lastText(), /Japanese/);
});

test('tapping the same row twice does not tell everyone twice', async () => {
  const c = await openOne();
  await handleClashWebhook(listReply(DAD, `CLASH_FIX:${c.id}:1`));
  sends.length = 0;
  await handleClashWebhook(listReply(MUM, `CLASH_FIX:${c.id}:1`));

  assert.equal(texts().length, 1, 'only the second tapper is told, and only that it was already done');
  assert.match(lastText(), /already marked/i);
  assert.equal(templates().length, 0);
});

test('an expired clash answers rather than failing silently', async () => {
  seed();
  const claimed = await handleClashWebhook(button(MUM, 'CLASH_DONE:gone'));
  assert.equal(claimed, true);
  assert.match(lastText(), /no longer open/i);
});

// ── what the clash flow must never touch ────────────────────────────────────

test('a text from a number that is not family is left to the prefect flows', async () => {
  seed();
  assert.equal(await handleClashWebhook(text(PREFECT, 'clash')), false);
  assert.equal(await handleClashWebhook(text(PREFECT, 'I am sick today')), false);
  assert.equal(sends.length, 0);
});

test('a prefect duty button is never claimed', async () => {
  seed();
  assert.equal(await handleClashWebhook(button(PREFECT, 'CONFIRM:2026-08-22', "I'll be there")), false);
  assert.equal(await handleClashWebhook(button(PREFECT, 'DECLINE:2026-08-22', "I can't make it")), false);
  // Not even from Kingsley, who is on both lists.
  assert.equal(await handleClashWebhook(button(KINGSLEY, 'CONFIRM:2026-08-22')), false);
  assert.equal(sends.length, 0);
});

test('CANCEL always reaches the suspension flow, even mid-clash', async () => {
  // The VHP approving a weather suspension is the highest-stakes message this
  // number carries; a half-finished clash must not be able to swallow it.
  seed();
  await handleClashWebhook(text(KINGSLEY, 'clash'));
  sends.length = 0;

  assert.equal(await handleClashWebhook(text(KINGSLEY, 'CANCEL')), false);
  assert.equal(await handleClashWebhook(text(KINGSLEY, 'cancel')), false);
  assert.equal(sends.length, 0, 'and nothing is said back');
});

test('a handbook code from someone on the prefect list is left alone', async () => {
  seed();
  await handleClashWebhook(text(KINGSLEY, 'clash'));
  sends.length = 0;

  // Kingsley is on both lists, so six digits from him is still a handbook code.
  assert.equal(await handleClashWebhook(text(KINGSLEY, '123456')), false);
  assert.equal(sends.length, 0);
});

test('six digits from a parent never reaches the handbook check', async () => {
  // The bug this pins down: Mum mistypes a lesson code, and the prefect
  // system answers her with "open the handbook page and send the code
  // showing there". She is not a prefect and must never see that.
  seed();
  assert.equal(await handleClashWebhook(text(MUM, '123456')), true);
  assert.match(lastText(), /Send \*clash\*/);

  // And mid-clash it is read as what it is: a lesson code that does not exist.
  sends.length = 0;
  await handleClashWebhook(text(MUM, 'clash'));
  await handleClashWebhook(text(MUM, '123456'));
  assert.match(lastText(), /don't have a lesson with the code/);
});

test('"cancel" from a parent is not mistaken for the VHP suspension approval', async () => {
  seed();
  assert.equal(await handleClashWebhook(text(MUM, 'CANCEL')), true);
  assert.equal(await handleClashWebhook(text(DAD, 'cancel')), true);
});

test('a prefect on the contact list keeps the prefect flows, clash list or not', async () => {
  seed();
  store.set('prefect:contacts', JSON.stringify([{ name: 'Angelia', phone: PREFECT, optIn: true }]));
  assert.equal(await handleClashWebhook(text(PREFECT, '123456')), false);
  assert.equal(await handleClashWebhook(text(PREFECT, 'CANCEL')), false);
  assert.equal(sends.length, 0);
});

test("Kingsley's stray texts still reach the prefect handler, his parents' do not", async () => {
  // He is on both lists (VHP_PHONE); Mum and Dad are on the family list only.
  seed();
  // He is the VHP: an unrecognised text from him is a prefect matter.
  assert.equal(await handleClashWebhook(text(KINGSLEY, 'what is the weather')), false);
  assert.equal(sends.length, 0);

  // Mum is not a prefect and must never see the prefect brush-off.
  assert.equal(await handleClashWebhook(text(MUM, 'ok thanks')), true);
  assert.match(lastText(), /Send \*clash\*/);
});

test('a Redis outage leaves the message to the prefect flows rather than eating it', async () => {
  seed();
  const failing = mock.method(store, 'get', () => { throw new Error('redis down'); });
  try {
    assert.equal(await handleClashWebhook(text(KINGSLEY, 'clash')), false);
  } finally {
    failing.mock.restore();
  }
});

// ── the web entry point ─────────────────────────────────────────────────────

test('the page and WhatsApp open identical cases', async () => {
  seed();
  const out = await openClash({ codes: ['2'], events: [{ name: 'Speech Day', when: '21/8' }], via: 'web' });

  assert.equal(out.ok, true);
  assert.equal(out.sent, 3);
  assert.equal(out.case.createdVia, 'web');
  assert.equal(paramsOf(templates()[0], 'body').tutorial_1, '2️⃣ Wednesday 6pm - Piano');
});

test('a muted recipient is skipped', async () => {
  seed();
  store.set('clash:recipients', JSON.stringify([
    { name: 'Kingsley', phone: KINGSLEY, notify: true },
    { name: 'Jessica', phone: MUM, notify: false },
  ]));
  await openClash({ codes: ['1'], events: [{ name: 'HKYAS' }], via: 'web' });

  assert.deepEqual(templates().map((s) => s.to), [KINGSLEY]);
});

test('opening a clash with nobody configured refuses instead of half-sending', async () => {
  seed();
  store.set('clash:recipients', JSON.stringify([]));
  const out = await openClash({ codes: ['1'], events: [{ name: 'HKYAS' }], via: 'web' });

  assert.equal(out.ok, false);
  assert.match(out.error, /add the numbers/i);
});

test('a clash with no event is refused — the reason is the point', async () => {
  seed();
  const out = await openClash({ codes: ['1'], events: [], via: 'web' });
  assert.equal(out.ok, false);
  assert.equal(sends.length, 0);
});
