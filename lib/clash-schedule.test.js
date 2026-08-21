// Unit tests for the make-up scheduler (lib/clash-schedule.js).
//
// The rule being defended, in Kingsley's words: "There is an event on this
// Thursday, I add the clash last Saturday, the make-up class must be set on
// that week and must be arranged before the clash day."
//
// So a proposal is wrong if it lands in another week, on or after the clash
// day, in the past, or on top of something else. Each of those is a test.
//
// Run with: npm run test:clash
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_NOTICE_MINUTES,
  addDays,
  dayAndDate,
  detectClashes,
  eventWhen,
  eventWindows,
  fmtTime,
  makeupLabel,
  mondayOf,
  parseEventWhen,
  parseSlots,
  parseTime,
  parseWeekday,
  proposeMakeup,
  proposeMakeups,
  readSlots,
  slotLabel,
  slotsLabel,
  weekdayOf,
} from './clash-schedule.js';

// A real week to reason about: 2026-08-17 is a Monday, so 20/8 is Thursday.
const MON = '2026-08-17';
const TUE = '2026-08-18';
const WED = '2026-08-19';
const THU = '2026-08-20';
const SAT_BEFORE = '2026-08-15';   // the Saturday of the week before

const LESSONS = [
  { code: '1', name: 'Japanese', weekday: 2, start: 18 * 60, end: 19 * 60, location: 'Causeway Bay', tutor: 'Ms Chan' },
  { code: '2', name: 'Piano', weekday: 3, start: 18 * 60, end: 19 * 60, location: 'Home' },
  { code: '3', name: 'Math', weekday: 4, start: 18 * 60 + 30, end: 20 * 60, location: 'Kowloon Tong' },
  { code: '4', name: 'Econ', weekday: 6, start: 11 * 60, end: 12 * 60 + 30, location: 'Online' },
];

const at = (h, m = 0) => h * 60 + m;

// ── the small pieces ────────────────────────────────────────────────────────

test('weekdays are read from whatever the editor holds', () => {
  assert.equal(parseWeekday(4), 4);
  assert.equal(parseWeekday('Thu'), 4);
  assert.equal(parseWeekday('thursday'), 4);
  assert.equal(parseWeekday('星期四'), 4);
  assert.equal(parseWeekday('Sunday'), 0);
  assert.equal(parseWeekday(0), 0, 'Sunday is a weekday, not a missing value');
  assert.equal(parseWeekday('nonsense'), null);
});

test('a bare hour in a tutorial time means the evening', () => {
  // "6" on a lesson row is 6pm. Read as 6am it would propose a make-up at
  // dawn, which is worse than refusing to guess.
  assert.equal(parseTime('6'), at(18));
  assert.equal(parseTime('6pm'), at(18));
  assert.equal(parseTime('6:30pm'), at(18, 30));
  assert.equal(parseTime('18:00'), at(18));
  assert.equal(parseTime('11am'), at(11));
  assert.equal(parseTime('12pm'), at(12));
  assert.equal(parseTime('12am'), 0);
  assert.equal(parseTime('9'), at(9), 'but a plain 9 is still the morning');
  assert.equal(parseTime('later'), null);
});

test('times print the way the approved samples do', () => {
  assert.equal(fmtTime(at(18)), '6pm');
  assert.equal(fmtTime(at(18, 30)), '6:30pm');
  assert.equal(fmtTime(at(11)), '11am');
  assert.equal(fmtTime(at(0)), '12am');
});

test('the week starts on Monday', () => {
  assert.equal(mondayOf(THU), MON);
  assert.equal(mondayOf(MON), MON);
  assert.equal(mondayOf('2026-08-23'), MON, 'Sunday belongs to the week that just ended');
  assert.equal(weekdayOf(THU), 4);
});

// ── detection ───────────────────────────────────────────────────────────────

test('an all-day event blocks every lesson that day', () => {
  const clashes = detectClashes(LESSONS, [{ name: 'Speech Day', startDate: THU }]);
  assert.deepEqual(clashes.map((c) => c.code), ['3'], 'only Math runs on a Thursday');
  assert.equal(clashes[0].date, THU);
});

test('a multi-day event catches every lesson it runs over', () => {
  const clashes = detectClashes(LESSONS, [{ name: 'HKYAS', startDate: '2026-08-16', endDate: WED }]);
  assert.deepEqual(clashes.map((c) => c.code), ['1', '2'], 'Tuesday Japanese and Wednesday Piano');
  assert.deepEqual(clashes.map((c) => c.date), [TUE, WED]);
});

test('a timed event only catches the lessons it actually overlaps', () => {
  const afternoon = [{ name: 'Rehearsal', startDate: TUE, startTime: at(14), endTime: at(17) }];
  assert.deepEqual(detectClashes(LESSONS, afternoon), [], '6pm Japanese survives a 2-5pm rehearsal');

  const evening = [{ name: 'Rehearsal', startDate: TUE, startTime: at(17), endTime: at(19) }];
  assert.deepEqual(detectClashes(LESSONS, evening).map((c) => c.code), ['1']);
});

test('a lesson ending exactly when an event starts does not clash', () => {
  const events = [{ name: 'Talk', startDate: TUE, startTime: at(19), endTime: at(21) }];
  assert.deepEqual(detectClashes(LESSONS, events), []);
});

test('the same lesson is never reported twice for one date', () => {
  const events = [
    { name: 'HKYAS', startDate: TUE, endDate: TUE },
    { name: 'Assembly', startDate: TUE, startTime: at(18), endTime: at(19) },
  ];
  assert.equal(detectClashes(LESSONS, events).length, 1);
});

test('an event with no date is ignored rather than blocking everything', () => {
  assert.deepEqual(detectClashes(LESSONS, [{ name: 'Sometime', when: 'TBC' }]), []);
});

// ── the make-up rule ────────────────────────────────────────────────────────

const propose = (clashes, today, nowMinutes = at(9), events = []) =>
  proposeMakeups(clashes, { lessons: LESSONS, events, today, nowMinutes });

test('Kingsley\'s rule: same week, before the clash day', () => {
  // Thursday's Math clashes; reported the Saturday before.
  const clashes = detectClashes(LESSONS, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = propose(clashes, SAT_BEFORE);

  assert.equal(makeup.code, '3');
  assert.ok(makeup.date, 'there is room in that week');
  assert.equal(mondayOf(makeup.date), mondayOf(THU), 'same week as the lesson it replaces');
  assert.ok(makeup.date < THU, 'and strictly before the clash day');
  assert.equal(makeup.start, at(18, 30), 'the tutor keeps their usual time');
  assert.equal(makeup.end, at(20), 'and the lesson keeps its length');
});

test('it lands as near the clash as the week allows', () => {
  // Thursday's Math is 6:30-8pm. Wednesday holds Piano (6-7pm) and Tuesday
  // holds Japanese (6-7pm), both of which run into 6:30 — so the nearest day
  // that is genuinely free is the Monday.
  const clashes = detectClashes(LESSONS, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = propose(clashes, SAT_BEFORE);
  assert.equal(makeup.date, MON);
});

test('it takes the nearest day when that day is free', () => {
  // Same clash, but with the week's other lessons out of the way: Wednesday.
  const solo = [LESSONS[2]];
  const clashes = detectClashes(solo, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, { lessons: solo, events: [], today: SAT_BEFORE, nowMinutes: at(9) });
  assert.equal(makeup.date, WED, 'the day before the clash, not the start of the week');
});

test('a clash on a Monday has nowhere to go, and says so', () => {
  const monday = [{ code: '9', name: 'Extra', weekday: 1, start: at(18), end: at(19) }];
  const clashes = detectClashes(monday, [{ name: 'Holiday', startDate: MON }]);
  const [makeup] = proposeMakeups(clashes, { lessons: monday, events: [], today: SAT_BEFORE, nowMinutes: at(9) });

  assert.equal(makeup.date, null, 'no earlier day exists in that week');
  assert.equal(makeup.code, '9');
});

test('the week the clash is in is the week that counts, not the week it was reported', () => {
  const clashes = detectClashes(LESSONS, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = propose(clashes, SAT_BEFORE);
  assert.ok(makeup.date > SAT_BEFORE, 'never in the week it was reported');
  assert.ok(makeup.date >= MON);
});

test('days already gone are never proposed', () => {
  // Reported on the Wednesday: Monday and Tuesday are history.
  const clashes = detectClashes(LESSONS, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = propose(clashes, WED, at(9));
  assert.equal(makeup.date, null, 'Wednesday evening is taken by Piano and nothing earlier is left');
});

test('a slot too soon today is not proposed', () => {
  const solo = [{ code: '3', name: 'Math', weekday: 4, start: at(18, 30), end: at(20) }];
  const clashes = detectClashes(solo, [{ name: 'Speech Day', startDate: THU }]);

  const early = proposeMakeups(clashes, { lessons: solo, events: [], today: WED, nowMinutes: at(9) });
  assert.equal(early[0].date, WED, 'plenty of notice, so today works');

  const late = proposeMakeups(clashes, {
    lessons: solo, events: [], today: WED, nowMinutes: at(18, 30) - MIN_NOTICE_MINUTES + 1,
  });
  assert.equal(late[0].date, null, 'inside the notice window, so not offered');
});

test('the event itself blocks the earlier days it covers', () => {
  // A Monday-to-Thursday event blocks Monday, Tuesday and Wednesday too.
  const clashes = detectClashes(LESSONS, [{ name: 'HKYAS', startDate: MON, endDate: THU }]);
  const makeups = proposeMakeups(clashes, {
    lessons: LESSONS, events: [{ name: 'HKYAS', startDate: MON, endDate: THU }], today: SAT_BEFORE, nowMinutes: at(9),
  });
  assert.ok(makeups.length >= 1);
  assert.ok(makeups.every((m) => m.date === null), 'the whole week up to the clash is the event');
});

test('two make-ups are never proposed into the same hour', () => {
  const twins = [
    { code: '1', name: 'Japanese', weekday: 4, start: at(18), end: at(19) },
    { code: '2', name: 'Piano', weekday: 4, start: at(18), end: at(19) },
  ];
  const clashes = detectClashes(twins, [{ name: 'Speech Day', startDate: THU }]);
  const makeups = proposeMakeups(clashes, { lessons: twins, events: [], today: SAT_BEFORE, nowMinutes: at(9) });

  assert.equal(makeups.length, 2);
  assert.notEqual(makeups[0].date, makeups[1].date, 'both at 6pm, so they cannot share a day');
  assert.ok(makeups.every((m) => m.date && m.date < THU));
});

test('a proposal carries the location and tutor from the timetable', () => {
  const clashes = detectClashes(LESSONS, [{ name: 'Fair', startDate: TUE }]);
  const [makeup] = propose(clashes, MON, at(9));
  assert.equal(makeup.date, MON);
  assert.equal(makeup.location, 'Causeway Bay');
  assert.equal(makeup.tutor, 'Ms Chan');
});

// ── offered make-up slots (a centre's fixed hours) ──────────────────────────

test('a slot is read from what gets typed', () => {
  assert.deepEqual(parseSlots('Mon 6pm, Fri 7:30pm'), [
    { weekday: 1, start: at(18), end: null },
    { weekday: 5, start: at(19, 30), end: null },
  ]);
  assert.deepEqual(parseSlots('Sat 2-4pm'), [{ weekday: 6, start: at(14), end: at(16) }]);
  assert.deepEqual(parseSlots('星期五 7pm'), [{ weekday: 5, start: at(19), end: null }]);
});

test('nonsense in the slot list is dropped, not stored', () => {
  assert.deepEqual(parseSlots('Mon 6pm, whenever, 6pm'), [{ weekday: 1, start: at(18), end: null }]);
  assert.deepEqual(parseSlots(''), []);
  assert.deepEqual(parseSlots(null), []);
});

test('a comma between the day and its time does not lose the slot', () => {
  // The bug: "Sat, 2pm" was split at the comma into "Sat" and "2pm", neither
  // of which is a slot on its own, so the lesson silently ended up with no
  // fixed hours — and was then scheduled at a time its centre never opens.
  assert.deepEqual(readSlots('Sat, 2pm').slots, [{ weekday: 6, start: at(14), end: null }]);
  assert.deepEqual(readSlots('Saturday, 10am').slots, [{ weekday: 6, start: at(10), end: null }]);
});

test('however the slots are written, they are read', () => {
  const cases = {
    'Sat 2pm': 'Sat 2pm',
    'Sat, 2pm': 'Sat 2pm',
    '2pm Sat': 'Sat 2pm',
    'Sat 2pm Sun 4pm': 'Sat 2pm, Sun 4pm',
    'Sat 2pm; Sun 4pm': 'Sat 2pm, Sun 4pm',
    'Sat 10am, 2pm': 'Sat 10am, Sat 2pm',
    '星期六 2-4pm': 'Sat 2pm-4pm',
  };
  for (const [typed, expected] of Object.entries(cases)) {
    assert.equal(slotsLabel(parseSlots(typed)), expected, `"${typed}"`);
  }
});

test('what could not be read comes back, so it can be said out loud', () => {
  assert.deepEqual(readSlots('whenever').rejected, ['whenever']);
  assert.deepEqual(readSlots('Sat').rejected, ['Sat'], 'a day with no time is not a slot');
  assert.deepEqual(readSlots('Mon 6pm, whenever').rejected, ['Mon whenever']);
  assert.deepEqual(readSlots('Mon 6pm').rejected, []);
  assert.deepEqual(readSlots('').rejected, []);
});

test('the same slot typed twice is stored once', () => {
  assert.deepEqual(parseSlots('Mon 6pm, Mon 6pm'), [{ weekday: 1, start: at(18), end: null }]);
});

test('slots round-trip back into the editor', () => {
  assert.equal(slotsLabel(parseSlots('Mon 6pm, Sat 2-4pm')), 'Mon 6pm, Sat 2pm-4pm');
});

test('a make-up only goes where the centre actually offers one', () => {
  // Math is Thursday 6:30pm, but the centre only runs it Monday 8pm.
  const centre = [{ ...LESSONS[2], makeupSlots: [{ weekday: 1, start: at(20), end: at(21, 30) }] }];
  const clashes = detectClashes(centre, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, { lessons: centre, events: [], today: SAT_BEFORE, nowMinutes: at(9) });

  assert.equal(makeup.date, MON, 'the only day the centre offers that week');
  assert.equal(makeup.start, at(20), "and at the centre's hour, not the lesson's");
  assert.equal(makeup.end, at(21, 30));
});

test('an offered slot after the clash day is no use', () => {
  // The centre offers Friday — the day after. Same week, but too late.
  const centre = [{ ...LESSONS[2], makeupSlots: [{ weekday: 5, start: at(20) }] }];
  const clashes = detectClashes(centre, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, { lessons: centre, events: [], today: SAT_BEFORE, nowMinutes: at(9) });

  assert.equal(makeup.date, null);
  assert.equal(makeup.offered, true, 'and the page can say why');
});

test('among the offered slots on one day, the one nearest the usual hour wins', () => {
  const centre = [{
    ...LESSONS[2],
    makeupSlots: [{ weekday: 3, start: at(10) }, { weekday: 3, start: at(19) }, { weekday: 3, start: at(15) }],
  }];
  const clashes = detectClashes(centre, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, { lessons: centre, events: [], today: SAT_BEFORE, nowMinutes: at(9) });

  assert.equal(makeup.date, WED);
  assert.equal(makeup.start, at(19), '6:30pm normally, so 7pm beats 3pm and 10am');
});

test('an offered slot sitting on another tutorial is skipped for the next one', () => {
  // Wednesday 6pm is Piano's. The centre also offers Tuesday 8pm.
  const centre = [
    LESSONS[1],
    { ...LESSONS[2], makeupSlots: [{ weekday: 3, start: at(18) }, { weekday: 2, start: at(20) }] },
  ];
  const clashes = detectClashes(centre, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, { lessons: centre, events: [], today: SAT_BEFORE, nowMinutes: at(9) });

  assert.equal(makeup.date, TUE);
  assert.equal(makeup.start, at(20));
});

test('a tutorial with no offered slots still keeps its own hour', () => {
  // The private-tutor case, unchanged: no makeupSlots means move the day only.
  const clashes = detectClashes(LESSONS, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = propose(clashes, SAT_BEFORE);
  assert.equal(makeup.start, at(18, 30));
  assert.equal(makeup.offered, undefined);
});

// ── skipping a home class ───────────────────────────────────────────────────

// Math at a centre that only opens Tuesday 6pm — exactly when Japanese is on.
const CENTRE_MATH = { ...LESSONS[2], makeupSlots: [{ weekday: 2, start: at(18), end: at(19, 30) }] };

test('a home lesson in the way is offered up rather than giving up', () => {
  const timetable = [{ ...LESSONS[0], homeClass: true }, CENTRE_MATH];
  const clashes = detectClashes(timetable, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, {
    lessons: timetable, events: [], today: SAT_BEFORE, nowMinutes: at(9),
  });

  assert.equal(makeup.date, TUE, "the centre's only slot that week");
  assert.deepEqual(makeup.displaces.map((d) => d.name), ['Japanese'], 'and it says what it costs');
});

test('a lesson NOT marked as a home class is never displaced', () => {
  // Japanese is at a centre too, so it is not ours to give away.
  const timetable = [LESSONS[0], CENTRE_MATH];
  const clashes = detectClashes(timetable, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, {
    lessons: timetable, events: [], today: SAT_BEFORE, nowMinutes: at(9),
  });

  assert.equal(makeup.date, null);
});

test('a free slot always beats one that costs a home lesson', () => {
  // The centre offers Tuesday (Japanese is on) and Monday (nothing is).
  const centre = { ...LESSONS[2], makeupSlots: [{ weekday: 2, start: at(18) }, { weekday: 1, start: at(18) }] };
  const timetable = [{ ...LESSONS[0], homeClass: true }, centre];
  const clashes = detectClashes(timetable, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, {
    lessons: timetable, events: [], today: SAT_BEFORE, nowMinutes: at(9),
  });

  assert.equal(makeup.date, MON, 'nothing is skipped while a free slot exists');
  assert.equal(makeup.displaces, undefined);
});

test('an event is never displaced, however skippable the week looks', () => {
  const timetable = [{ ...LESSONS[0], homeClass: true }, CENTRE_MATH];
  const clashes = detectClashes(timetable, [{ name: 'HKYAS', startDate: MON, endDate: THU }]);
  const makeups = proposeMakeups(clashes, {
    lessons: timetable, events: [{ name: 'HKYAS', startDate: MON, endDate: THU }], today: SAT_BEFORE, nowMinutes: at(9),
  });

  assert.ok(makeups.every((m) => m.date === null), 'the event covers the week; nothing to offer');
});

test('a make-up already placed is never displaced either', () => {
  const timetable = [{ ...LESSONS[0], homeClass: true }, CENTRE_MATH];
  const clashes = detectClashes(timetable, [{ name: 'Speech Day', startDate: THU }]);
  const makeup = proposeMakeup(clashes[0], {
    lessons: timetable,
    events: [],
    today: SAT_BEFORE,
    nowMinutes: at(9),
    taken: [{ date: TUE, from: at(18), to: at(19, 30) }],
  });

  assert.equal(makeup.date, null, "someone else's make-up is not ours to move");
});

test('the notice window still applies to a slot that costs a home lesson', () => {
  const timetable = [{ ...LESSONS[0], homeClass: true }, CENTRE_MATH];
  const clashes = detectClashes(timetable, [{ name: 'Speech Day', startDate: THU }]);
  const [makeup] = proposeMakeups(clashes, {
    lessons: timetable, events: [], today: TUE, nowMinutes: at(18) - MIN_NOTICE_MINUTES + 1,
  });

  assert.equal(makeup.date, null, 'too late today, and no earlier day left');
});

// ── a clash on a Sunday ─────────────────────────────────────────────────────
//
// Sunday is the end of the week, so the make-up window is Monday to Saturday
// and every lesson's nearest free day is the Saturday. That is right — but it
// is also why a lesson whose centre does NOT open on Saturday must say so
// instead of quietly being moved there.

const SUN = '2026-08-23';
const SAT = '2026-08-22';

test('two Sunday lessons both move to the Saturday, each at its own time', () => {
  const sunday = [
    { code: '1', name: 'Lesson 1', weekday: 0, start: at(10), end: at(11) },
    { code: '2', name: 'Lesson 2', weekday: 0, start: at(14), end: at(15) },
  ];
  const events = [{ name: 'Event', startDate: SUN }];
  const makeups = proposeMakeups(detectClashes(sunday, events), {
    lessons: sunday, events, today: MON, nowMinutes: at(9),
  });

  assert.deepEqual(makeups.map((m) => m.date), [SAT, SAT], 'Saturday is the day before Sunday');
  assert.deepEqual(makeups.map((m) => m.start), [at(10), at(14)], 'and neither is moved onto the other');
});

test('a Sunday lesson whose centre does not open Saturday is not moved there', () => {
  // The reported bug: with its slots unreadable this lesson had no fixed hours
  // on file, so it fell through to "keep the time, take the day before" —
  // Saturday — which is exactly what its centre does not do.
  const sunday = [{
    code: '2', name: 'Lesson 2', weekday: 0, start: at(14), end: at(15),
    makeupSlots: parseSlots('Wed, 7pm'),
  }];
  const events = [{ name: 'Event', startDate: SUN }];
  const [makeup] = proposeMakeups(detectClashes(sunday, events), {
    lessons: sunday, events, today: MON, nowMinutes: at(9),
  });

  assert.equal(makeup.date, '2026-08-19', 'the Wednesday the centre actually opens');
  assert.equal(makeup.start, at(19));
});

test('a Sunday clash keeps its own week', () => {
  assert.equal(mondayOf(SUN), MON, 'Sunday belongs to the week that just ended, not the one starting');
  assert.ok(SAT < SUN && mondayOf(SAT) === MON);
});

// ── reading dates out of a message ──────────────────────────────────────────

test('a date range typed on a phone is understood', () => {
  const when = parseEventWhen('16/8-19/8', '2026-08-15');
  assert.equal(when.startDate, '2026-08-16');
  assert.equal(when.endDate, '2026-08-19');
  assert.equal(when.startTime, undefined, 'no times given means the whole day');
});

test('a single date, with times', () => {
  const when = parseEventWhen('21/8 2pm-5pm', '2026-08-15');
  assert.equal(when.startDate, '2026-08-21');
  assert.equal(when.endDate, '');
  assert.equal(when.startTime, at(14));
  assert.equal(when.endTime, at(17));
});

test('the 8 in 16/8 is never read back as eight o\'clock', () => {
  const when = parseEventWhen('16/8', '2026-08-15');
  assert.equal(when.startDate, '2026-08-16');
  assert.equal(when.startTime, undefined);
});

test('ISO dates and explicit years both work', () => {
  assert.equal(parseEventWhen('2026-08-21', '2026-08-15').startDate, '2026-08-21');
  assert.equal(parseEventWhen('21/8/2027', '2026-08-15').startDate, '2027-08-21');
  assert.equal(parseEventWhen('21/8/27', '2026-08-15').startDate, '2027-08-21');
});

test('a day and month with no year means the one coming up', () => {
  assert.equal(parseEventWhen('3/1', '2026-08-15').startDate, '2027-01-03', 'January is next year in August');
  assert.equal(parseEventWhen('10/8', '2026-08-15').startDate, '2026-08-10', 'but last week is still this year');
});

test('a message with no date at all yields no date', () => {
  assert.equal(parseEventWhen('sometime next term', '2026-08-15').startDate, '');
});

// ── labels ──────────────────────────────────────────────────────────────────

test('a proposal reads as a day, a date and a time', () => {
  assert.equal(makeupLabel({ date: TUE, start: at(18) }), 'Tue 18/8 6pm');
  assert.equal(makeupLabel({ date: null }), '');
});

test('a lesson reads as its usual slot', () => {
  assert.equal(slotLabel(LESSONS[0]), 'Tuesday 6pm');
  assert.equal(slotLabel(LESSONS[2]), 'Thursday 6:30pm');
});

test('an event reads as its dates, with times only when it has them', () => {
  assert.equal(eventWhen({ startDate: '2026-08-16', endDate: '2026-08-19' }), '16/8-19/8');
  assert.equal(eventWhen({ startDate: '2026-08-21' }), '21/8');
  assert.equal(eventWhen({ startDate: '2026-08-21', startTime: at(14), endTime: at(17) }), '21/8 2pm-5pm');
  assert.equal(eventWhen({ when: 'TBC' }), 'TBC', 'an old free-text record still reads');
});

test('windows expand a multi-day event into one per day', () => {
  const windows = eventWindows([{ name: 'HKYAS', startDate: MON, endDate: WED }]);
  assert.deepEqual(windows.map((w) => w.date), [MON, TUE, WED]);
  assert.ok(windows.every((w) => w.from === 0 && w.to === 1440));
});

test('dates step correctly across a month boundary', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(dayAndDate('2026-09-01'), 'Tue 1/9');
});
