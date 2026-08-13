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

export function sanitizeLesson(raw) {
  return {
    code: clean(raw?.code, 6).toLowerCase().replace(/[^a-z0-9]/g, ''),
    name: clean(raw?.name, 60),
    tutor: clean(raw?.tutor, 40),
    when: clean(raw?.when, 40), // the lesson's normal slot, e.g. "Tue 7:00pm"
  };
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
export function sanitizeEvents(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_EVENTS)
    .map((e) => ({ name: clean(e?.name, 80), when: clean(e?.when, 60) }))
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

export function sanitizeCase(raw) {
  const lessons = (Array.isArray(raw?.lessons) ? raw.lessons : [])
    .slice(0, MAX_LESSONS)
    .map((l) => ({
      ...sanitizeLesson(l),
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

// The catalogue, as sent back to someone who typed a code that does not exist.
export const listCatalogue = (catalogue) =>
  (catalogue || []).map((l) => `${l.code}. ${l.name}${l.when ? ` — ${l.when}` : ''}`).join('\n');

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

// "1️⃣ Tuesday 6pm - Japanese"
export const lessonLine = (lesson) =>
  [codeMark(lesson.code), [lesson.when, lesson.name].filter(Boolean).join(' - ')]
    .filter(Boolean).join(' ');

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

export const ASK_LESSONS = (catalogue) =>
  'Which tutorial(s) need to be arranged?\n' +
  'Reply with the code(s), e.g. *1,3*\n\n' +
  `${listCatalogue(catalogue)}\n\n` +
  'Send *stop* to cancel.';

export const ASK_EVENTS =
  'What is it clashing with?\n' +
  'Reply with the event and its time — one per line, e.g.\n' +
  '*Speech Day — Fri 21 Aug, 2:00pm*\n\n' +
  'Send *stop* to cancel.';

export const UNKNOWN_CODES = (unknown, catalogue) =>
  `I don't have a lesson with the code ${unknown.map((u) => `*${u}*`).join(', ')}.\n\n` +
  `${listCatalogue(catalogue)}\n\n` +
  'Reply with the code(s) again, or *stop* to cancel.';

export const NO_CATALOGUE =
  'No tutorials are set up yet. Add them at mathans.app/parents/clash first.';

export const CANCELLED = 'Cancelled — nothing was sent.';

// The announcement every recipient gets when a lesson is rearranged.
export const fixedAnnouncement = (caseRec, lesson, by) =>
  `✅ *${lesson.name}* has been rearranged${by ? ` — sorted by ${by}` : ''}.\n` +
  `${progressLine(caseRec)}.` +
  (isClosed(caseRec)
    ? '\nNothing else is outstanding. 🎉'
    : `\nStill to arrange: ${describeLessons(pendingLessons(caseRec))}.`);
