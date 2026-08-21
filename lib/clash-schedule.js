// Working out what a school event actually costs, and when to put it back.
//
// Pure: no Redis, no network, no clock of its own — "now" is always passed in,
// so a proposal is reproducible and testable. lib/clash-flow.js owns the
// shapes, lib/clash-messenger.js does the talking; this file is the arithmetic
// between them.
//
// Two jobs:
//
//   detectClashes()   which tutorial occurrences fall inside an event
//   proposeMakeups()  where each of them can go instead
//
// ── The make-up rule (Kingsley's, and the whole point) ──────────────────────
//
//   A make-up lesson goes in the SAME WEEK as the lesson it replaces, on a day
//   BEFORE it, and obviously not in the past.
//
//     event Thursday · reported Saturday the week before
//     ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
//     │ Mon │ Tue │ Wed │ THU │ Fri │ Sat │ Sun │
//     │  ✓  │  ✓  │  ✓  │  ✗  │  ✗  │  ✗  │  ✗  │   ✓ = a make-up may go here
//     └─────┴─────┴─────┴─────┴─────┴─────┴─────┘
//
// The lesson keeps its usual time, because that is the tutor's slot and the
// thing most likely to be free for them; only the day moves. Days are tried
// nearest-to-the-clash first, so the lesson lands as close to where it should
// have been as the week allows.
//
// A day is only offered if the slot is clear of the event itself (a multi-day
// event blocks the earlier days too), clear of every other tutorial, and clear
// of any make-up already proposed in the same run. When nothing in the week
// works — a Monday clash has no earlier day at all — that is reported as such
// rather than fudged: the tutor gets arranged by hand, and saying so is more
// use than a slot nobody can make.
//
// ── Offered slots ───────────────────────────────────────────────────────────
//
// "Keep the tutor's usual time" is right for a private tutor, who moves to
// suit. A tuition centre does not: it runs the same subject at fixed hours and
// a make-up has to go in one of them. So a lesson may carry `makeupSlots` —
// the weekly slots that centre actually offers — and when it does, those are
// the ONLY times considered. The window is unchanged (same week, before the
// clash, not in the past, nothing on top of anything); all that changes is
// which times are candidates on each day. Where two offered slots fall on the
// same day, the one nearest the lesson's usual hour wins.
//
// ── Skipping a home class ───────────────────────────────────────────────────
//
// A centre's slots are scarce and a lesson at home is not, so when the only
// thing standing between a make-up and the week is a home lesson, that is a
// question rather than a dead end. A lesson marked `homeClass` may be given up
// for a make-up: the proposal comes back carrying `displaces` — what it would
// cost — and nothing is sent until a person agrees. Events, other make-ups and
// centre lessons are never displaced, and a free slot always beats one that
// costs something.
//
// The displaced lesson is given up, not rescheduled. Chasing it would start a
// cascade, so it is named in the message and the family decides.

// Dates are 'YYYY-MM-DD' and times are minutes past midnight throughout. Both
// are compared as plain values, so no Date object and no timezone ever enters
// the arithmetic — the caller passes today's HK date and the current HK
// minute, and everything downstream is ordinary integer comparison.

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DEFAULT_LESSON_MINUTES = 60;

// How much warning a make-up must give before it is worth proposing. A slot
// two hours from now is not a plan, it is a scramble.
export const MIN_NOTICE_MINUTES = 120;

// ── weekdays ────────────────────────────────────────────────────────────────

// Accepts 3 / '3' / 'Wed' / 'Wednesday' / '星期三' — whatever the editor or an
// old record holds. Returns null when it is not a weekday at all.
export function parseWeekday(value) {
  if (value === 0 || value === '0') return 0;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^[0-6]$/.test(s)) return Number(s);
  const i = WEEKDAYS.findIndex((d) => d.toLowerCase().startsWith(s.slice(0, 3)));
  if (i !== -1) return i;
  const cn = ['日', '一', '二', '三', '四', '五', '六'].findIndex((c) => s.includes(c));
  return /星期|週|周/.test(s) && cn !== -1 ? cn : null;
}

export const weekdayName = (n) => WEEKDAYS[n] ?? '';

// ── offered make-up slots ───────────────────────────────────────────────────

export const MAX_MAKEUP_SLOTS = 12;

// One slot held as an object — straight back out of Redis.
export function parseSlot(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const weekday = parseWeekday(entry.weekday);
  const start = parseTime(entry.start);
  if (weekday === null || start === null) return null;
  const end = parseTime(entry.end);
  return { weekday, start, end: end !== null && end > start ? end : null };
}

// Every way a weekday gets written, so the list can be cut at the days rather
// than at the commas. Splitting on commas first is what used to make
// "Sat, 2pm" — a comma between the day and its time — parse to nothing at all.
const WEEKDAY_TOKEN = /\b(?:sun(?:day)?|mon(?:day)?|tues?(?:day)?|wed(?:nesday)?|thur?s?(?:day)?|fri(?:day)?|sat(?:urday)?)\b|(?:星期|週|周)[日一二三四五六]/gi;

const TIME_RANGE = /\s*(?:-|–|—|~|to)\s*/i;

// The whole list, however it was typed: "Mon 6pm, Fri 7:30pm", "Sat, 2pm",
// "Sat 10am, 2pm" (two slots that day), "2pm Sat", "星期六 2-4pm".
//
// Returns what it could not make sense of as well as what it could. Dropping
// an unreadable slot silently is the worst thing this can do: a lesson whose
// slots all vanish looks like a lesson with no fixed hours, and a make-up then
// gets scheduled at a time the centre never opens.
export function readSlots(value) {
  if (Array.isArray(value)) {
    return { slots: value.map(parseSlot).filter(Boolean).slice(0, MAX_MAKEUP_SLOTS), rejected: [] };
  }
  const text = String(value ?? '');
  const marks = [...text.matchAll(WEEKDAY_TOKEN)];
  if (!marks.length) {
    return { slots: [], rejected: text.trim() ? [text.trim()] : [] };
  }

  const slots = [];
  const rejected = [];
  const seen = new Set();
  // Times typed before the first weekday — "2pm Sat" rather than "Sat 2pm".
  const lead = text.slice(0, marks[0].index).trim();

  marks.forEach((mark, i) => {
    const weekday = parseWeekday(mark[0]);
    const upTo = i + 1 < marks.length ? marks[i + 1].index : text.length;
    let body = text.slice(mark.index + mark[0].length, upTo);
    if (i === 0 && !/\d/.test(body) && lead) body = lead;

    const pieces = body.split(/[,;、\n]+/).map((p) => p.trim()).filter(Boolean);
    if (!pieces.length) {
      rejected.push(mark[0]);
      return;
    }
    for (const piece of pieces) {
      const [from, to] = piece.split(TIME_RANGE);
      const start = parseTime(from);
      if (start === null) {
        rejected.push(`${mark[0]} ${piece}`);
        continue;
      }
      const end = parseTime(to);
      const key = `${weekday}:${start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push({ weekday, start, end: end !== null && end > start ? end : null });
    }
  });

  return { slots: slots.slice(0, MAX_MAKEUP_SLOTS), rejected };
}

export const parseSlots = (value) => readSlots(value).slots;

// Back out again, for the editor to show what it stored.
export const slotsLabel = (slots) => (slots || [])
  .map((s) => `${WEEKDAYS[s.weekday].slice(0, 3)} ${fmtTime(s.start)}${s.end ? `-${fmtTime(s.end)}` : ''}`)
  .join(', ');

// ── times ───────────────────────────────────────────────────────────────────

// '6pm' / '6:30pm' / '18:00' / '6.30 pm' / '11am' -> minutes past midnight.
export function parseTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const m = /^\s*(\d{1,2})\s*(?:[:.](\d{2}))?\s*(a\.?m|p\.?m)?\.?\s*$/i.exec(String(value ?? ''));
  if (!m) return null;
  let hour = Number(m[1]);
  const mins = Number(m[2] || 0);
  const meridiem = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (hour > 23 || mins > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  // A bare "6" for a tutorial means the evening, not dawn — nobody has a
  // 6am piano lesson, and reading it as one would place a make-up nobody
  // could attend.
  if (!meridiem && hour >= 1 && hour <= 7) hour += 12;
  return hour * 60 + mins;
}

// 1080 -> '6pm', 1110 -> '6:30pm'. The shape the approved template samples use.
export function fmtTime(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

// ── dates ───────────────────────────────────────────────────────────────────

const utc = (dateStr) => new Date(`${dateStr}T00:00:00Z`);
export const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

export function addDays(dateStr, days) {
  const d = utc(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (dateStr) => utc(dateStr).getUTCDay();

// Monday, the way a Hong Kong school week is counted. Used for "the same
// week" in the make-up rule, so it is the one definition that matters.
export function mondayOf(dateStr) {
  const day = weekdayOf(dateStr);
  return addDays(dateStr, day === 0 ? -6 : 1 - day);
}

// '22/8' — the header of every message this system sends.
export const shortDate = (dateStr) => `${utc(dateStr).getUTCDate()}/${utc(dateStr).getUTCMonth() + 1}`;

// 'Thu 21/8'
export const dayAndDate = (dateStr) => `${WEEKDAYS[weekdayOf(dateStr)].slice(0, 3)} ${shortDate(dateStr)}`;

export function datesBetween(startDate, endDate, cap = 62) {
  const out = [];
  let d = startDate;
  while (d <= endDate && out.length < cap) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

// ── overlap ─────────────────────────────────────────────────────────────────

// Half-open, so a lesson ending at 6pm does not clash with one starting at 6pm.
export const overlaps = (aFrom, aTo, bFrom, bTo) => aFrom < bTo && bFrom < aTo;

// Every (date, from, to) an event occupies. An event with no times blocks the
// whole day, which is what "Speech Day, 21/8" means.
export function eventWindows(events) {
  const windows = [];
  for (const event of events || []) {
    if (!isDate(event?.startDate)) continue;
    const end = isDate(event.endDate) && event.endDate >= event.startDate ? event.endDate : event.startDate;
    const from = Number.isFinite(event.startTime) ? event.startTime : 0;
    const to = Number.isFinite(event.endTime) && event.endTime > from ? event.endTime : (Number.isFinite(event.startTime) ? 24 * 60 : 24 * 60);
    for (const date of datesBetween(event.startDate, end)) {
      windows.push({ date, from, to, name: event.name });
    }
  }
  return windows;
}

// A lesson's window on a given date, or null if it does not run that weekday.
export function lessonWindowOn(lesson, date) {
  if (!Number.isInteger(lesson?.weekday) || !Number.isFinite(lesson?.start)) return null;
  if (lesson.weekday !== weekdayOf(date)) return null;
  const end = Number.isFinite(lesson.end) && lesson.end > lesson.start
    ? lesson.end
    : lesson.start + DEFAULT_LESSON_MINUTES;
  return { from: lesson.start, to: end };
}

// ── 1. what clashed ─────────────────────────────────────────────────────────

// Every tutorial occurrence an event runs over, newest information first:
// { code, date, start, end, event }. One entry per lesson per date, so a
// four-day event that covers Tuesday's Japanese twice cannot report it twice.
export function detectClashes(lessons, events) {
  const windows = eventWindows(events);
  const seen = new Set();
  const clashes = [];

  for (const window of windows) {
    for (const lesson of lessons || []) {
      const slot = lessonWindowOn(lesson, window.date);
      if (!slot) continue;
      if (!overlaps(slot.from, slot.to, window.from, window.to)) continue;
      const id = `${lesson.code}:${window.date}`;
      if (seen.has(id)) continue;
      seen.add(id);
      clashes.push({
        code: lesson.code,
        date: window.date,
        start: slot.from,
        end: slot.to,
        event: window.name,
      });
    }
  }

  return clashes.sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1));
}

// ── 2. where it can go instead ──────────────────────────────────────────────

// Everything already on the calendar that a slot would run into. Empty means
// the slot is free. Returning the blockers rather than a yes/no is what makes
// the home-class question below possible.
function conflictsOf({ date, from, to }, { lessons, windows, taken, skipCode }) {
  const blockers = [];
  if (windows.some((w) => w.date === date && overlaps(from, to, w.from, w.to))) {
    blockers.push({ type: 'event' });
  }
  if (taken.some((t) => t.date === date && overlaps(from, to, t.from, t.to))) {
    blockers.push({ type: 'taken' });
  }
  for (const lesson of lessons || []) {
    if (lesson.code === skipCode) continue;        // its own weekly slot is not a conflict
    const slot = lessonWindowOn(lesson, date);
    if (slot && overlaps(from, to, slot.from, slot.to)) blockers.push({ type: 'lesson', lesson });
  }
  return blockers;
}

// A slot nothing stands in the way of except home lessons — the one case worth
// asking about rather than giving up on. An event cannot be moved, another
// make-up is already someone's answer, and a centre lesson is the thing we are
// protecting; a lesson at home is the one that can give way.
const onlyHomeLessons = (blockers) =>
  blockers.length > 0 && blockers.every((b) => b.type === 'lesson' && b.lesson.homeClass);

// One clash -> one proposal. `date: null` means the week had nowhere to put it.
export function proposeMakeup(clash, { lessons, events, today, nowMinutes = 0, taken = [] }) {
  const lesson = (lessons || []).find((l) => l.code === clash.code);
  const windows = eventWindows(events);
  const duration = clash.end - clash.start;

  // Same week, strictly before the clash, and not before today: the window is
  // [max(Monday, today) … clash − 1 day], walked backwards so the make-up
  // lands as near its usual day as the week allows.
  const monday = mondayOf(clash.date);
  const earliest = today && today > monday ? today : monday;

  // A centre's fixed hours, or — when it has none on file — the lesson's own
  // time, which is what a private tutor moves to suit.
  const offered = lesson?.makeupSlots || [];

  const propose = (date, slot, displaces) => ({
    code: clash.code,
    clashDate: clash.date,
    date,
    start: slot.from,
    end: slot.to,
    location: lesson?.location || '',
    tutor: lesson?.tutor || '',
    ...(displaces?.length
      ? { displaces: displaces.map((l) => ({ code: l.code, name: l.name, when: slotLabel(l) })) }
      : {}),
  });

  // The nearest slot that would fit if a home lesson gave way. Kept as the
  // fallback rather than returned, so a genuinely free slot always wins.
  let ifSkipped = null;

  for (let date = addDays(clash.date, -1); date >= earliest; date = addDays(date, -1)) {
    const slots = offered.length
      ? offered
        .filter((s) => s.weekday === weekdayOf(date))
        .map((s) => ({ from: s.start, to: s.end && s.end > s.start ? s.end : s.start + duration }))
        // Two offered slots on one day: the one nearest the usual hour first.
        .sort((a, b) => Math.abs(a.from - clash.start) - Math.abs(b.from - clash.start))
      : [{ from: clash.start, to: clash.start + duration }];

    for (const slot of slots) {
      // Too soon to be worth proposing — today, with the slot already passed
      // or about to.
      if (date === today && slot.from < nowMinutes + MIN_NOTICE_MINUTES) continue;
      const blockers = conflictsOf({ date, ...slot }, { lessons, windows, taken, skipCode: clash.code });
      if (!blockers.length) return propose(date, slot);
      if (!ifSkipped && onlyHomeLessons(blockers)) {
        ifSkipped = propose(date, slot, blockers.map((b) => b.lesson));
      }
    }
  }

  // Nothing free. If a home lesson standing in the way is the only thing
  // between us and a slot, that is a question for a person, not a dead end:
  // the proposal comes back carrying what it would cost.
  if (ifSkipped) return ifSkipped;

  return {
    code: clash.code,
    clashDate: clash.date,
    date: null,
    start: clash.start,
    end: clash.end,
    // Why there is nothing: the centre's slots did not come up this week, or
    // the lesson's own hour was blocked every earlier day. The page says which.
    offered: offered.length > 0,
  };
}

// All of them, each aware of the ones already placed — two make-ups must not
// be proposed into the same hour.
export function proposeMakeups(clashes, { lessons, events, today, nowMinutes = 0 } = {}) {
  const taken = [];
  return (clashes || []).map((clash) => {
    const proposal = proposeMakeup(clash, { lessons, events, today, nowMinutes, taken });
    if (proposal.date) taken.push({ date: proposal.date, from: proposal.start, to: proposal.end });
    return proposal;
  });
}

// ── reading a date out of a text message ────────────────────────────────────
//
// "16/8-19/8", "21/8 2pm-5pm", "2026-08-21", "16/8 to 19/8". Dates are pulled
// out first and cut from the string, so the 8 in "16/8" can never be read back
// as eight o'clock.

const YEAR_LOOKBACK_DAYS = 60;

// A day and month with no year almost always means the next one coming up —
// but a clash reported a few days late is normal, so recent past dates are
// left in this year rather than thrown a year forward.
function inferYear(day, month, today) {
  const iso = (year) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const thisYear = Number((today || '2000-01-01').slice(0, 4));
  const candidate = iso(thisYear);
  return candidate >= addDays(today, -YEAR_LOOKBACK_DAYS) ? candidate : iso(thisYear + 1);
}

export function parseEventWhen(text, today) {
  let rest = String(text ?? '');
  const dates = [];

  rest = rest.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match) => {
    dates.push(match);
    return ' ';
  });
  rest = rest.replace(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/g, (match, d, m, y) => {
    const day = Number(d);
    const month = Number(m);
    if (day < 1 || day > 31 || month < 1 || month > 12) return match;
    if (y) {
      const year = Number(y.length === 2 ? `20${y}` : y);
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    } else {
      dates.push(inferYear(day, month, today));
    }
    return ' ';
  });

  const times = (rest.match(/\b\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m|p\.?m)\b|\b\d{1,2}:\d{2}\b/gi) || [])
    .map(parseTime)
    .filter((t) => t !== null);

  dates.sort();
  const [startTime, endTime] = times;
  return {
    startDate: dates[0] || '',
    endDate: dates.length > 1 ? dates[dates.length - 1] : '',
    ...(Number.isFinite(startTime) ? { startTime } : {}),
    ...(Number.isFinite(endTime) && endTime > startTime ? { endTime } : {}),
  };
}

// ── 3. how it reads ─────────────────────────────────────────────────────────

// 'Mon 18/8 6pm' — a proposal in the fewest words that still say when.
export const makeupLabel = (makeup) =>
  (makeup?.date ? `${dayAndDate(makeup.date)} ${fmtTime(makeup.start)}` : '');

// 'Tuesday 6pm' — a lesson's usual slot, as shown in the approved samples.
export const slotLabel = (lesson) =>
  [weekdayName(lesson?.weekday), fmtTime(lesson?.start)].filter(Boolean).join(' ');

// '16/8' or '16/8-19/8', plus times when the event has them.
export function eventWhen(event) {
  if (!isDate(event?.startDate)) return String(event?.when || '');
  const end = isDate(event.endDate) && event.endDate > event.startDate ? event.endDate : '';
  const days = end ? `${shortDate(event.startDate)}-${shortDate(end)}` : shortDate(event.startDate);
  if (!Number.isFinite(event.startTime)) return days;
  const times = Number.isFinite(event.endTime)
    ? `${fmtTime(event.startTime)}-${fmtTime(event.endTime)}`
    : fmtTime(event.startTime);
  return `${days} ${times}`;
}
