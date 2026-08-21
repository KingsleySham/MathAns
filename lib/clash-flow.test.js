// Unit tests for the lesson-clash logic (lib/clash-flow.js).
//
// Two things here are worth defending with tests. The first is the parsing:
// the codes are typed on a phone, so "1,3.4" and "1 3 4" have to mean the same
// thing, and an event line has to survive whichever dash the keyboard produced.
// The second is the template mapping — the approved class_clash template has
// exactly seven tutorial slots, and the Cloud API rejects a parameter that is
// empty or contains a newline, so a slot must always hold something and always
// hold one line.
//
// Run with: npm run test:clash
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NA,
  TEMPLATE_SLOTS,
  clashTemplateParams,
  dayLabel,
  doneSummary,
  doneTemplateParams,
  isClosed,
  lessonLine,
  markFixed,
  parseCodes,
  parseEvents,
  pendingLessons,
  progressLine,
  sanitizeCase,
  sanitizeLessons,
  sanitizeRecipients,
  tutorialSlots,
} from './clash-flow.js';

const CATALOGUE = [
  { code: '1', name: 'Japanese', tutor: '', when: 'Tuesday 6pm' },
  { code: '2', name: 'Piano', tutor: '', when: 'Wednesday 6pm' },
  { code: '3', name: 'Math', tutor: '', when: 'Thursday 6:30pm' },
  { code: '4', name: 'Econ', tutor: '', when: 'Saturday 11am' },
];

const caseWith = (codes, events = [{ name: 'HKYAS', when: '16/8-19/8' }]) => sanitizeCase({
  id: 'test',
  lessons: CATALOGUE.filter((l) => codes.includes(l.code)),
  events,
});

// ── parsing codes ───────────────────────────────────────────────────────────

test('codes separated by anything at all land the same way', () => {
  for (const typed of ['1,3.4', '1 3 4', '1,3,4', '1、3、4', '1/3/4', ' 1 , 3 . 4 ']) {
    const { lessons, unknown } = parseCodes(typed, CATALOGUE);
    assert.deepEqual(lessons.map((l) => l.code), ['1', '3', '4'], `"${typed}"`);
    assert.deepEqual(unknown, []);
  }
});

test('an unknown code is reported rather than silently dropped', () => {
  const { lessons, unknown } = parseCodes('1,9', CATALOGUE);
  assert.deepEqual(lessons.map((l) => l.code), ['1']);
  assert.deepEqual(unknown, ['9']);
});

test('a repeated code is only counted once', () => {
  const { lessons } = parseCodes('3,3,3', CATALOGUE);
  assert.equal(lessons.length, 1);
});

test('codes come back in the order they were typed', () => {
  const { lessons } = parseCodes('4,1', CATALOGUE);
  assert.deepEqual(lessons.map((l) => l.code), ['4', '1']);
});

// ── parsing events ──────────────────────────────────────────────────────────

test('name and time split on whichever separator was typed', () => {
  const lines = [
    'Speech Day — Fri 21 Aug, 2:00pm',
    'Speech Day - Fri 21 Aug, 2:00pm',
    'Speech Day @ Fri 21 Aug, 2:00pm',
    'Speech Day, Fri 21 Aug 2:00pm',
  ];
  for (const line of lines) {
    const [event] = parseEvents(line);
    assert.equal(event.name, 'Speech Day', line);
    assert.match(event.when, /^Fri 21 Aug/, line);
  }
});

test('a hyphenated event name is not split at the hyphen', () => {
  // The separator needs spaces around it precisely so this keeps working.
  const [event] = parseEvents('Inter-house final @ Sat 10am');
  assert.equal(event.name, 'Inter-house final');
  assert.equal(event.when, 'Sat 10am');
});

test('several events, one per line or split on semicolons', () => {
  assert.equal(parseEvents('HKYAS — 16/8\nSpeech Day — 21/8').length, 2);
  assert.equal(parseEvents('HKYAS — 16/8; Speech Day — 21/8').length, 2);
});

test('an event with no time is kept, not rejected', () => {
  const [event] = parseEvents('HKYAS');
  assert.equal(event.name, 'HKYAS');
  assert.equal(event.when, '');
});

test('blank lines produce no events', () => {
  assert.deepEqual(parseEvents('\n\n  \n'), []);
});

// ── the template ────────────────────────────────────────────────────────────

test('every tutorial slot is filled, empty ones with a dash', () => {
  const slots = tutorialSlots([CATALOGUE[0], CATALOGUE[1]]);
  assert.equal(Object.keys(slots).length, TEMPLATE_SLOTS);
  assert.equal(slots.tutorial_1, '1️⃣ Tuesday 6pm - Japanese');
  assert.equal(slots.tutorial_2, '2️⃣ Wednesday 6pm - Piano');
  for (let i = 3; i <= TEMPLATE_SLOTS; i++) assert.equal(slots[`tutorial_${i}`], NA);
});

test('more lessons than slots collapse into the last line instead of vanishing', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ code: String(i), name: `L${i}`, when: '' }));
  const slots = tutorialSlots(many);
  assert.equal(slots.tutorial_7, '…and 4 more');
  assert.equal(Object.keys(slots).length, TEMPLATE_SLOTS);
});

test('no template parameter is ever empty or multi-line', () => {
  // Both are hard Cloud API errors, and the second is easy to reintroduce by
  // joining a list with "\n".
  const params = clashTemplateParams(caseWith(['1']), { day: '22/8' });
  for (const [key, value] of Object.entries(params)) {
    assert.ok(String(value).length > 0, `${key} is empty`);
    assert.doesNotMatch(String(value), /[\n\t]/, `${key} contains a newline`);
  }
});

test('the template lists what is outstanding and what is arranged', () => {
  const c = caseWith(['1', '2']);
  markFixed(c, '1', 'Mum', '2026-08-22T10:00:00Z');
  const params = clashTemplateParams(c, { day: '22/8' });
  assert.equal(params.tutorial_1, '2️⃣ Wednesday 6pm - Piano', 'only the pending lesson is a clash');
  assert.equal(params.tutorial_2, NA);
  assert.equal(params.tutorial_arranged, '1️⃣ Tuesday 6pm - Japanese');
});

test('events collapse to one line with a running total', () => {
  const c = caseWith(['1'], [{ name: 'HKYAS', when: '16/8-19/8' }, { name: 'Speech Day', when: '21/8' }]);
  const params = clashTemplateParams(c, { day: '22/8' });
  assert.equal(params.events, 'HKYAS (16/8-19/8) · Speech Day (21/8)');
  assert.equal(params.event2, 'Total: 2');
});

test('a make-up being attended online says so on the line', () => {
  // "Tue 5pm" and "Tue 5pm (online)" are not the same instruction to anybody.
  const c = caseWith(['1']);
  c.lessons[0].makeup = { date: '2026-08-25', start: 20 * 60, end: 21 * 60, online: true, displaces: [] };
  assert.equal(lessonLine(c.lessons[0]), '1️⃣ Tuesday 6pm - Japanese → Tue 25/8 8pm (online)');

  c.lessons[0].makeup.online = false;
  assert.equal(lessonLine(c.lessons[0]), '1️⃣ Tuesday 6pm - Japanese → Tue 25/8 8pm');
});

test('a skipped lesson stays on the list and says what to do instead', () => {
  // It is not happening, but the tutor still has to be told — so it keeps its
  // place in the message rather than quietly disappearing from it.
  const c = caseWith(['1', '2']);
  c.lessons[0].skipped = true;
  const params = clashTemplateParams(c, { day: '22/8' });

  assert.equal(params.tutorial_1, '1️⃣ Tuesday 6pm - Japanese → Skip class, notify tutor');
  assert.equal(params.tutorial_2, '2️⃣ Wednesday 6pm - Piano');
});

test('a skipped lesson never shows a make-up slot as well', () => {
  const c = caseWith(['1']);
  c.lessons[0].skipped = true;
  c.lessons[0].makeup = { date: '2026-08-25', start: 18 * 60, end: 19 * 60, displaces: [] };

  assert.equal(lessonLine(c.lessons[0]), '1️⃣ Tuesday 6pm - Japanese → Skip class, notify tutor');
});

test('skipped survives a round trip through the case record', () => {
  const c = sanitizeCase({ id: 'x', lessons: [{ code: '1', name: 'Japanese', skipped: true }] });
  assert.equal(c.lessons[0].skipped, true);
  assert.equal(sanitizeCase({ id: 'x', lessons: [{ code: '1', name: 'Japanese' }] }).lessons[0].skipped, false);
});

test('a non-numeric code still gets a readable marker', () => {
  assert.equal(lessonLine({ code: '1', name: 'Japanese', when: 'Tue 6pm' }), '1️⃣ Tue 6pm - Japanese');
  assert.equal(lessonLine({ code: 'a1', name: 'Chess', when: '' }), '#a1 Chess');
});

test('the header date reads as day/month', () => {
  assert.equal(dayLabel('2026-08-22'), '22/8');
  assert.equal(dayLabel(new Date(Date.UTC(2026, 0, 5))), '5/1');
});

// ── the state machine ───────────────────────────────────────────────────────

test('marking a lesson twice is a no-op the second time', () => {
  // The list message stays in the chat, so a second tap on it is expected —
  // and must not announce the same lesson to everyone again.
  const c = caseWith(['1', '2']);
  assert.ok(markFixed(c, '1', 'Dad', 'now'));
  assert.equal(markFixed(c, '1', 'Dad', 'now'), null);
  assert.equal(pendingLessons(c).length, 1);
});

test('a case is closed only when nothing is pending', () => {
  const c = caseWith(['1', '2']);
  assert.equal(isClosed(c), false);
  markFixed(c, '1', 'Mum', 'now');
  assert.equal(isClosed(c), false);
  markFixed(c, '2', 'Mum', 'now');
  assert.equal(isClosed(c), true);
});

test('progress counts what is left', () => {
  const c = caseWith(['1', '2', '3']);
  markFixed(c, '2', 'Mum', 'now');
  assert.equal(progressLine(c), '1 of 3 sorted · 2 still to arrange');
});

// ── the sign-off template ───────────────────────────────────────────────────

test('the sign-off lists what was arranged, not what clashed', () => {
  const c = caseWith(['1', '2']);
  markFixed(c, '1', 'Jessica', 'now');
  markFixed(c, '2', 'Andy', 'now');
  const params = doneTemplateParams(c, { day: '22/8' });

  assert.equal(params.tutorial_1, '1️⃣ Tuesday 6pm - Japanese');
  assert.equal(params.tutorial_2, '2️⃣ Wednesday 6pm - Piano');
  assert.equal(params.tutorial_3, NA);
  assert.equal(params.events, 'HKYAS (16/8-19/8)', 'the reason is still worth restating');
  assert.equal(params.tutorial_arranged, undefined, 'everything is arranged — there is no second list');
});

test('the sign-off obeys the same two Cloud API rules', () => {
  const c = caseWith(['1']);
  markFixed(c, '1', 'Kingsley', 'now');
  for (const [key, value] of Object.entries(doneTemplateParams(c, { day: '22/8' }))) {
    assert.ok(String(value).length > 0, `${key} is empty`);
    assert.doesNotMatch(String(value), /[\n\t]/, `${key} contains a newline`);
  }
});

test('the plain-text fallback says it is over and names the lessons', () => {
  // Used only when the template is refused — most likely not yet approved.
  const c = caseWith(['1', '2']);
  markFixed(c, '1', 'Jessica', 'now');
  markFixed(c, '2', 'Andy', 'now');
  const text = doneSummary(c);

  assert.match(text, /All clashed tutorial\(s\) have been arranged/);
  assert.match(text, /Japanese/);
  assert.match(text, /Piano/);
  assert.match(text, /HKYAS/);
});

// ── sanitizers ──────────────────────────────────────────────────────────────

test('a duplicated lesson code is dropped — "3" must mean one thing', () => {
  const lessons = sanitizeLessons([
    { code: '1', name: 'Japanese' },
    { code: '1', name: 'Something else' },
    { code: '', name: 'No code' },
    { code: '2', name: '' },
  ]);
  assert.deepEqual(lessons.map((l) => l.name), ['Japanese']);
});

test('recipients keep only digits, and mute rather than vanish', () => {
  const [person] = sanitizeRecipients([{ name: 'Jessica', phone: '+852 9123 4567', relation: 'mum', notify: false }]);
  assert.equal(person.phone, '85291234567');
  assert.equal(person.notify, false);
});

test('a recipient with no phone number is not stored', () => {
  assert.deepEqual(sanitizeRecipients([{ name: 'Nobody', phone: '' }]), []);
});

test('sanitizeCase survives junk', () => {
  const c = sanitizeCase({ id: 'x', lessons: 'nope', events: null });
  assert.deepEqual(c.lessons, []);
  assert.deepEqual(c.events, []);
});
