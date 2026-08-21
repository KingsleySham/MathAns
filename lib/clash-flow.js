// Lesson-clash flow — the pure half (no Redis, no network, no env), so all of
// it is unit-testable: `npm run test:clash`.
//
// What a clash is: a school event (Speech Day, a rehearsal, a competition)
// lands on top of one or more private tutorials, so those tutorials have to be
// rearranged with the tutors. Kingsley opens a case — from /parents/clash or by
// texting the bot — and the whole family (Kingsley, Mum, Dad) gets the
// `class_clash` template. Whoever sorts a lesson out taps through the buttons
// and everyone is told.
//
// This file owns the shapes and the text; lib/clash-store.js owns the Redis
// keys and lib/clash-messenger.js owns the conversation. Nothing here imports
// anything from the prefect stack — the two systems share a WhatsApp number
// and nothing else.

import {
  eventWhen, isDate, makeupLabel, parseSlots, parseTime, parseWeekday, slotLabel,
} from './clash-schedule.js';

export const MAX_LESSONS = 30;      // catalogue size
export const MAX_RECIPIENTS = 10;   // family, not a mailing list
export const MAX_EVENTS = 6;        // events named in one clash
export const MAX_PICK = 10;         // WhatsApp interactive lists cap at 10 rows

// The approved class_clash template has exactly seven {{tutorial_n}} slots.
// A clash bigger than that is not something the template can show, so the
// seventh line summarises the overflow rather than silently dropping it.
export const TEMPLATE_SLOTS = 7;

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const digits = (v) => String(v ?? '').replace(/\D/g, '');

// ── the lesson catalogue ────────────────────────────────────────────────────
// Codes are what gets typed into WhatsApp ("1,3,4"), so they are short and
// stable. They are strings rather than numbers: a code is an identifier, and
// the day someone wants "1a" it should not need a migration.

// weekday/start/end are what make automatic detection possible: without them a
// lesson can still be picked by hand, but nothing can work out that an event
// runs over it. `when` is derived from them for display ("Tuesday 6pm") and
// only falls back to stored text for records written before the timetable was
// structured.
export function sanitizeLesson(raw) {
  const weekday = parseWeekday(raw?.weekday);
  const start = parseTime(raw?.start);
  const end = parseTime(raw?.end);
  const lesson = {
    code: clean(raw?.code, 6).toLowerCase().replace(/[^a-z0-9]/g, ''),
    name: clean(raw?.name, 60),
    tutor: clean(raw?.tutor, 40),
    location: clean(raw?.location, 60),
    weekday: weekday === null ? null : weekday,
    start: start === null ? null : start,
    end: end !== null && start !== null && end > start ? end : null,
    // The slots this tutorial can actually be made up in — a centre's fixed
    // hours. Empty means "no fixed hours", and a make-up keeps its own time.
    makeupSlots: parseSlots(raw?.makeupSlots),
    // The same subject's ONLINE hours at that centre, when it runs them. Kept
    // apart from makeupSlots because attending online is a choice, not a
    // default: these times only come into play once someone opts in, and then
    // they are extra options rather than replacements.
    onlineSlots: parseSlots(raw?.onlineSlots),
    // A lesson at home, which may be given up to fit a centre make-up in.
    // Nothing is skipped without being asked first.
    homeClass: raw?.homeClass === true,
  };
  lesson.when = slotLabel(lesson) || clean(raw?.when, 40);
  return lesson;
}

// Drops entries with no code or no name, and de-duplicates on code — the
// catalogue is edited by hand on the page, and a duplicated code would make
// "3" ambiguous in a WhatsApp reply.
export function sanitizeLessons(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, MAX_LESSONS * 2)) {
    const lesson = sanitizeLesson(raw);
    if (!lesson.code || !lesson.name || seen.has(lesson.code)) continue;
    seen.add(lesson.code);
    out.push(lesson);
    if (out.length >= MAX_LESSONS) break;
  }
  return out;
}

// ── who gets told ───────────────────────────────────────────────────────────
// Kingsley plus his parents. `notify: false` mutes someone without deleting
// them, which is the only reason a phone number would ever be kept unused.

export function sanitizeRecipients(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, MAX_RECIPIENTS * 2)) {
    const phone = digits(raw?.phone).slice(0, 15);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({
      name: clean(raw?.name, 40) || 'there',
      phone,
      relation: clean(raw?.relation, 20) || 'family',
      notify: raw?.notify !== false,
      // Business-scoped user ID (Meta's usernames rollout), learned from
      // webhooks exactly as the prefect contacts do — without it, a parent who
      // adopts a WhatsApp username stops being recognised when they tap a button.
      userId: clean(raw?.userId, 140),
    });
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

export const notifiable = (recipients) => (recipients || []).filter((r) => r.notify !== false);

// ── parsing what Kingsley types ─────────────────────────────────────────────

// "1,3.4" / "1 3 4" / "1、3" — the separator is whatever came out of the
// keyboard, including a full stop, which is why this splits on "not a code
// character" rather than on a chosen delimiter.
export function parseCodes(text, catalogue = []) {
  const tokens = String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const known = new Map(catalogue.map((l) => [l.code, l]));
  const lessons = [];
  const unknown = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    const lesson = known.get(token);
    if (lesson) lessons.push(lesson);
    else unknown.push(token);
  }
  return { lessons, unknown };
}

// Events that arrive already split into name and time — the page's two input
// boxes. Kept separate from parseEvents() on purpose: re-joining them into one
// string only to split it again would break the moment an event name contained
// a comma.
// Dates are what turn "the reason" into something the scheduler can subtract
// from a timetable. `when` stays as the label ("16/8-19/8"), derived from the
// dates when there are any and kept as typed when there are not — an event
// with no date still describes a clash somebody picked by hand.
export function sanitizeEvents(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_EVENTS)
    .map((e) => {
      const startTime = parseTime(e?.startTime);
      const endTime = parseTime(e?.endTime);
      const event = {
        name: clean(e?.name, 80),
        startDate: isDate(e?.startDate) ? e.startDate : '',
        endDate: isDate(e?.endDate) ? e.endDate : '',
        ...(startTime === null ? {} : { startTime }),
        ...(endTime === null || (startTime !== null && endTime <= startTime) ? {} : { endTime }),
      };
      if (event.endDate && event.endDate < event.startDate) event.endDate = '';
      event.when = eventWhen({ ...event, when: clean(e?.when, 60) });
      return event;
    })
    .filter((e) => e.name);
}

// One event per line (or per semicolon). Name and time are split on the first
// dash/at/comma we find, so all of these land the same way:
//   Speech Day — Fri 21 Aug, 2:00pm
//   Speech Day @ Fri 21 Aug 2pm
//   Speech Day, Fri 21 Aug 2pm
// A line with no separator is taken as a name with the time still unknown,
// rather than being rejected — a clash with an unscheduled event is still a
// clash, and "to be confirmed" is honest.
export function parseEvents(text) {
  return String(text ?? '')
    .split(/[\n;；]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_EVENTS)
    .map((line) => {
      const m = /\s+[—–-]\s+|\s+@\s+|\s*[,，]\s*/.exec(line);
      if (!m) return { name: clean(line, 80), when: '' };
      return {
        name: clean(line.slice(0, m.index), 80),
        when: clean(line.slice(m.index + m[0].length), 60),
      };
    })
    .filter((e) => e.name);
}

// ── the case ────────────────────────────────────────────────────────────────
// A case is one clash: the lessons that need rearranging, the events that
// caused it, and who has sorted what. `lessons[].fixed` is the whole state
// machine — a case is closed when nothing is pending.

// A proposed (or agreed) make-up slot. `date: ''` with the object still
// present means the scheduler looked and found nothing free that week — which
// is information, and different from never having looked.
export function sanitizeMakeup(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const start = parseTime(raw.start);
  const end = parseTime(raw.end);
  return {
    date: isDate(raw.date) ? raw.date : '',
    start: start === null ? null : start,
    end: end !== null && start !== null && end > start ? end : null,
    location: clean(raw.location, 60),
    tutor: clean(raw.tutor, 40),
    // Attended online rather than at the centre — which is how this slot came
    // to exist at all, so the message has to say so.
    online: raw.online === true,
    // What this slot costs: the home lesson(s) it would be taken instead of.
    // Kept on the record so the message can name them and the case remembers
    // what was agreed to.
    displaces: (Array.isArray(raw.displaces) ? raw.displaces : [])
      .slice(0, MAX_LESSONS)
      .map((d) => ({ code: clean(d?.code, 6), name: clean(d?.name, 60), when: clean(d?.when, 40) }))
      .filter((d) => d.name),
  };
}

export function sanitizeCase(raw) {
  const lessons = (Array.isArray(raw?.lessons) ? raw.lessons : [])
    .slice(0, MAX_LESSONS)
    .map((l) => ({
      ...sanitizeLesson(l),
      // The occurrence this is about — a weekly slot clashes on one date, and
      // the make-up rule is defined relative to that date, not to the weekday.
      date: isDate(l?.date) ? l.date : '',
      makeup: sanitizeMakeup(l?.makeup),
      // Not being made up at all: a lesson at home that the event ran over,
      // which is simply not happening. It stays on the list because the tutor
      // still has to be told — that is the action, instead of a make-up.
      skipped: l?.skipped === true,
      fixed: Boolean(l?.fixed),
      fixedBy: clean(l?.fixedBy, 40),
      fixedAt: clean(l?.fixedAt, 32),
    }))
    .filter((l) => l.code && l.name);

  return {
    id: clean(raw?.id, 24),
    createdAt: clean(raw?.createdAt, 32),
    createdVia: raw?.createdVia === 'whatsapp' ? 'whatsapp' : 'web',
    lessons,
    events: sanitizeEvents(raw?.events),
    note: clean(raw?.note, 200),
    closedAt: clean(raw?.closedAt, 32),
  };
}

export const pendingLessons = (c) => (c?.lessons || []).filter((l) => !l.fixed);
export const fixedLessons = (c) => (c?.lessons || []).filter((l) => l.fixed);
export const isClosed = (c) => Boolean(c) && pendingLessons(c).length === 0;

// Marks one lesson rearranged. Returns the lesson so the caller can name it in
// the announcement, or null when the code is not pending — a second tap on a
// stale list must be a no-op, not a duplicate "sorted!" to everyone.
export function markFixed(caseRec, code, by, at) {
  const lesson = (caseRec?.lessons || []).find((l) => l.code === code && !l.fixed);
  if (!lesson) return null;
  lesson.fixed = true;
  lesson.fixedBy = clean(by, 40);
  lesson.fixedAt = clean(at, 32);
  return lesson;
}

// ── how it all reads ────────────────────────────────────────────────────────

// "Maths (Tue 7:00pm), Physics (Thu 8:00pm)" — the tutorial's normal slot in
// brackets, because "Maths" alone is not enough for Mum to know which one.
export const describeLessons = (lessons) =>
  (lessons || []).map((l) => (l.when ? `${l.name} (${l.when})` : l.name)).join(', ');

export const describeEvents = (events) => (events || []).map((e) => e.name).join(', ');

// "1 of 3 sorted · 2 still to arrange"
export function progressLine(caseRec) {
  const done = fixedLessons(caseRec).length;
  const total = (caseRec?.lessons || []).length;
  const left = total - done;
  return left
    ? `${done} of ${total} sorted · ${left} still to arrange`
    : `All ${total} lesson${total === 1 ? '' : 's'} sorted`;
}

// ── the class_clash template ────────────────────────────────────────────────
//
// The approved template (Meta → WhatsApp Manager, Utility) is:
//
//   Header  Possible clash - Kingsley {{day}}
//   Body    Due to unforeseen circumstances, actions are needed.
//           ⚠️ Event(s): {{events}}
//           {{event2}}
//           *❌ Clash(es):*
//           *{{tutorial_1}}* … *{{tutorial_7}}*
//           ✅ Arranged :
//           {{tutorial_arranged}}
//           Please make adjustments to the clashed tutorial(s).
//   Footer  電腦傳送 Sent via system.
//   Button  Actions taken 已完成調堂  (quick reply)
//
// Everything the template needs is built here, in one function, so renaming a
// variable in Meta is a one-line change rather than a hunt through the
// messenger. Two rules the Cloud API imposes and this has to respect: a
// parameter may not be empty (hence `N/A` in the unused slots — same as the
// approved samples) and it may not contain a newline (hence the ` · ` joins).

// The sample numbers each clashing line with a keycap emoji. The number shown
// is the lesson's own catalogue code — the same code Kingsley types into
// WhatsApp — so the message and the reply speak the same language.
const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const codeMark = (code) => (/^[0-9]$/.test(code) ? KEYCAPS[Number(code)] : `#${code}`);

// "1️⃣ Tuesday 6pm - Japanese", and — once the scheduler has had a look —
// where it is going instead: "1️⃣ Tuesday 6pm - Japanese → Mon 18/8 6pm".
// A make-up the week had no room for says so, because "arrange it yourself"
// is more use than a line that trails off.
export const SKIP_INSTRUCTION = 'Skip class, notify tutor';

export const lessonLine = (lesson) => {
  const head = [codeMark(lesson.code), [lesson.when, lesson.name].filter(Boolean).join(' - ')]
    .filter(Boolean).join(' ');
  // A skipped lesson stays on the list and says what to do about it, rather
  // than disappearing as though it had never clashed.
  if (lesson.skipped) return `${head} → ${SKIP_INSTRUCTION}`;
  if (!lesson.makeup) return head;
  const label = makeupLabel(lesson.makeup);
  if (!label) return `${head} → no free slot, arrange with the tutor`;
  const how = lesson.makeup.online ? ' (online)' : '';
  // A make-up that costs a home lesson says so on the line: everyone reading
  // this needs to know that lesson is not happening.
  const cost = describeDisplaced(lesson.makeup.displaces);
  return cost ? `${head} → ${label}${how} (skips ${cost})` : `${head} → ${label}${how}`;
};

// "Piano" / "Piano and Econ"
export const describeDisplaced = (displaces) => {
  const names = (displaces || []).map((d) => d.name).filter(Boolean);
  if (!names.length) return '';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export const NA = 'N/A';

// Fills the seven fixed slots: one lesson each, `N/A` for the rest. An eighth
// lesson (or more) collapses into the last slot rather than vanishing.
export function tutorialSlots(lessons) {
  const lines = (lessons || []).map(lessonLine);
  const slots = {};
  for (let i = 0; i < TEMPLATE_SLOTS; i++) {
    const overflowing = i === TEMPLATE_SLOTS - 1 && lines.length > TEMPLATE_SLOTS;
    slots[`tutorial_${i + 1}`] = overflowing
      ? `…and ${lines.length - (TEMPLATE_SLOTS - 1)} more`
      : (lines[i] || NA);
  }
  return slots;
}

// "HKYAS (16/8-19/8)" — name and time in the shape the approved sample uses.
export const eventLine = (event) =>
  event.when ? `${event.name} (${event.when})` : event.name;

// Header {{day}}: the day the notice goes out, as "22/8". Passed in rather
// than read from the clock so the same case always renders the same way.
export const dayLabel = (date) => {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(date) : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

export function clashTemplateParams(caseRec, { day } = {}) {
  const events = caseRec?.events || [];
  return {
    day: day || dayLabel(new Date()),
    events: events.map(eventLine).join(' · ') || 'A school event',
    // The approved sample uses this second line as the count, which stays
    // meaningful however many events there are.
    event2: `Total: ${events.length || 1}`,
    // Only what is still outstanding is listed as a clash: the template goes
    // out again after a partial fix, and re-listing a sorted lesson would read
    // as if it had come undone. The sorted ones move to ✅ Arranged instead.
    ...tutorialSlots(pendingLessons(caseRec)),
    tutorial_arranged: fixedLessons(caseRec).map(lessonLine).join(' · ') || NA,
  };
}

// ── conversation prompts (WhatsApp path) ────────────────────────────────────

// The only question the flow asks: everything else — which tutorials it
// runs over, and when they can be made up — is worked out from the answer.
export const ASK_EVENTS =
  "What's the event?\n" +
  'Reply with its name and date(s), e.g.\n' +
  '*HKYAS, 16/8-19/8*\n' +
  '*Speech Day, 21/8, 2pm-5pm*\n\n' +
  'One per line for more than one. Send *stop* to cancel.';

export const NO_CATALOGUE =
  'No tutorials are set up yet. Add them at mathans.app/parents/clash first.';

export const CANCELLED = 'Cancelled — nothing was sent.';

// ── the class_clash_done template ───────────────────────────────────────────
//
// The sign-off, sent once every lesson in a clash has been rearranged. Same
// shape as class_clash — so it reads as the same conversation — but with no
// buttons and nothing outstanding: the tutorial slots hold the arranged
// lessons instead of the clashing ones.
//
//   Header  Clash resolved - Kingsley {{day}}
//   Body    All clashed tutorial(s) have been arranged.
//           ⚠️ Event(s): {{events}}
//           {{event2}}
//           *✅ Arranged:*
//           *{{tutorial_1}}* … *{{tutorial_7}}*
//           No further action is needed.
//
//           Thank you for your kind attention.
//   Footer  電腦傳送 Sent via system.
//   Buttons none
export function doneTemplateParams(caseRec, { day } = {}) {
  const events = caseRec?.events || [];
  return {
    day: day || dayLabel(new Date()),
    events: events.map(eventLine).join(' · ') || 'A school event',
    event2: `Total: ${events.length || 1}`,
    ...tutorialSlots(fixedLessons(caseRec)),
  };
}

// Plain-text stand-in for that template, used only when the Cloud API refuses
// it — most likely because it has not been approved in Meta yet. Better a
// slightly plainer message than a family who is never told it is over.
export const doneSummary = (caseRec) =>
  '✅ All clashed tutorial(s) have been arranged.\n' +
  `⚠️ Event(s): ${(caseRec?.events || []).map(eventLine).join(' · ')}\n` +
  `${describeLessons(fixedLessons(caseRec))}\n` +
  'No further action is needed.';
