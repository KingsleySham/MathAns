// Lesson-clash conversation — the WhatsApp half.
//
// Two ways in, one flow out:
//
//   • mathans.app/parents/clash — tick the tutorials, name the event(s), send
//   • text the bot "clash"      — it asks for the codes, then the event(s)
//
// Either way the family (Kingsley, Mum, Dad) gets the approved `class_clash`
// template with the "Actions taken 已完成調堂" quick reply. Tapping it opens the
// list of lessons still to be arranged; picking one moves that lesson to
// ✅ Arranged and sends the template again — until nothing is left, when
// `class_clash_done` closes the thread instead.
//
//   class_clash ──tap "Actions taken"──► list of pending lessons
//        ▲                                        │
//        └──── still outstanding? send it again, ◄─┤
//              with this one moved to ✅ Arranged  │
//                                                  ▼
//                      all arranged? class_clash_done — same message,
//                      no buttons, nothing left to tap
//
// ── Sharing the number with the Prefect Hub ─────────────────────────────────
// This runs on the same WhatsApp number the prefects use, so the one rule that
// matters is: claim only what is unambiguously ours, and never anything a
// prefect could have sent. handleClashWebhook() returns false for everything
// else and api/whatsapp/webhook.js then routes it into the prefect flows
// exactly as before. Concretely:
//
//   • buttons/list rows are claimed by a "CLASH_" payload prefix, which no
//     prefect template uses (theirs are CONFIRM:/DECLINE:);
//   • text is only claimed from a number on the clash recipient list;
//   • a bare CANCEL is never claimed — that is the VHP approving a weather
//     suspension, and it must always reach the prefect flow;
//   • a bare six-digit message is never claimed — that is a handbook code;
//   • any error in here is swallowed and reported as "not ours", so a broken
//     clash flow degrades to the prefect behaviour rather than eating the
//     webhook.

import { sendList, sendTemplate, sendText, sendTextOrTemplate } from './whatsapp.js';
// The one thing the two systems share, and it is a read: the prefect contact
// list, used to work out which system an incoming number belongs to before a
// single word of it is interpreted.
import { getContacts as getPrefectContacts } from './prefect-messenger.js';
import {
  ASK_EVENTS, CANCELLED, MAX_PICK, NO_CATALOGUE,
  clashTemplateParams, dayLabel, describeDisplaced, describeEvents, describeLessons, doneSummary,
  doneTemplateParams, isClosed, lessonLine, markFixed, notifiable, parseCodes,
  parseEvents, pendingLessons, progressLine, sanitizeCase, sanitizeEvents,
} from './clash-flow.js';
import {
  addDays, detectClashes, eventWhen, parseEventWhen, proposeMakeups, weekdayOf,
} from './clash-schedule.js';
import {
  addOpen, clearDraft, getDraft, getLessons, getRecipients, newCaseId, readCase,
  readOpenCases, removeOpen, resolveClashSender, setDraft, writeCase,
} from './clash-store.js';

const TPL_CLASH = () => process.env.WHATSAPP_CLASH_TEMPLATE || 'class_clash';
const TPL_DONE = () => process.env.WHATSAPP_CLASH_DONE_TEMPLATE || 'class_clash_done';
// Free-form announcements fall back to an approved template when a recipient's
// 24-hour window has closed. Defaults to the notice template the number
// already has approved.
const TPL_NOTICE = () => process.env.CLASH_NOTICE_TEMPLATE || process.env.WHATSAPP_NOTICE_TEMPLATE || 'prefect_notice';

const hkNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const hkDate = () => hkNow().toISOString().slice(0, 10);
const hkMinutes = () => { const d = hkNow(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const digits = (v) => String(v ?? '').replace(/\D/g, '');

// Payload prefixes, set at send time and read back in the webhook.
const P_DONE = 'CLASH_DONE:';   // template quick reply — "Actions taken 已完成調堂"
const P_PICK = 'CLASH_PICK:';   // retired intermediate button, still answered
const P_FIX = 'CLASH_FIX:';     // one list row: CLASH_FIX:{caseId}:{code}

async function safeSend(to, body) {
  try {
    await sendText(to, body);
  } catch (e) {
    console.error(`clash: text to ${to} failed:`, e.message);
  }
}

// ── outbound ────────────────────────────────────────────────────────────────

// The template, to everyone not muted. Sent as a template rather than plain
// text on purpose: it is business-initiated, so most of the time nobody's
// 24-hour window is open.
export async function sendClashTemplate(caseRec, { day } = {}) {
  const recipients = notifiable(await getRecipients());
  if (!recipients.length) {
    return { ok: false, error: 'No one to notify yet — add the numbers on /parents/clash first.', sent: 0 };
  }

  const { day: dayParam, ...bodyParams } = clashTemplateParams(caseRec, { day: day || dayLabel(hkNow()) });
  const results = [];
  for (const person of recipients) {
    try {
      await sendTemplate({
        to: person.phone || person.userId,
        name: TPL_CLASH(),
        headerParams: { day: dayParam },
        bodyParams,
        buttonPayloads: [`${P_DONE}${caseRec.id}`],
      });
      results.push({ name: person.name, ok: true });
    } catch (e) {
      console.error(`clash: template to ${person.name} failed:`, e.message);
      results.push({ name: person.name, ok: false, error: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), sent: results.filter((r) => r.ok).length, results };
}

// The sign-off, once nothing is outstanding: the same message as the alert,
// without the buttons. Falls back to a plain summary if the Cloud API refuses
// the template — most likely because it is not approved in Meta yet, and the
// family should still be told it is over.
export async function sendDoneTemplate(caseRec, { day } = {}) {
  const recipients = notifiable(await getRecipients());
  const { day: dayParam, ...bodyParams } = doneTemplateParams(caseRec, { day: day || dayLabel(hkNow()) });
  let sent = 0;
  for (const person of recipients) {
    const to = person.phone || person.userId;
    try {
      await sendTemplate({
        to,
        name: TPL_DONE(),
        headerParams: { day: dayParam },
        bodyParams,
      });
      sent += 1;
    } catch (e) {
      console.error(`clash: done template to ${person.name} failed:`, e.message);
      try {
        await sendTextOrTemplate(to, doneSummary(caseRec), { template: TPL_NOTICE() });
        sent += 1;
      } catch (fallbackError) {
        console.error(`clash: done fallback to ${person.name} failed:`, fallbackError.message);
      }
    }
  }
  return { ok: sent > 0, sent };
}

// ── working out a clash ─────────────────────────────────────────────────────

// The event(s) go in, the damage and the plan come out. No Redis writes, no
// messages: the page previews with this, the WhatsApp flow confirms with it,
// and openClash() sends what it produced — so what was reviewed is exactly
// what goes out.
//
// `codes` overrides the detection when given (the page's tick-boxes, or a
// clash with an event nobody dated); `makeups` overrides individual slots.
export async function planClash({ events = [], codes = null, makeups = null, allowDisplacing = true } = {}) {
  const catalogue = await getLessons();
  if (!catalogue.length) return { ok: false, error: NO_CATALOGUE };

  const dated = sanitizeEvents(events);
  if (!dated.length) return { ok: false, error: 'Name at least one event — that is the reason for the clash.' };

  const today = hkDate();
  const detected = detectClashes(catalogue, dated);

  // Hand-picked codes still get a date, so the make-up rule has something to
  // be "the week of". The detected occurrence is preferred; a code that does
  // not actually clash falls back to its next occurrence after today.
  let clashes = detected;
  if (Array.isArray(codes) && codes.length) {
    const wanted = new Set(codes.map((c) => String(c).toLowerCase()));
    clashes = [
      ...detected.filter((c) => wanted.has(c.code)),
      ...[...wanted]
        .filter((code) => !detected.some((c) => c.code === code))
        .map((code) => manualOccurrence(catalogue.find((l) => l.code === code), dated, today))
        .filter(Boolean),
    ];
  }
  if (!clashes.length) {
    return { ok: false, none: true, error: 'Nothing in the timetable clashes with that.', events: dated, detected };
  }
  // Chronological, so the message reads like the week does.
  clashes.sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1));

  const proposals = proposeMakeups(clashes, {
    lessons: catalogue, events: dated, today, nowMinutes: hkMinutes(),
  });
  const overrides = new Map((makeups || []).map((m) => [String(m.code).toLowerCase(), m]));

  const lessons = clashes.map((clash, i) => {
    const lesson = catalogue.find((l) => l.code === clash.code) || {};
    let proposal = overrides.get(clash.code) || proposals[i];
    // Answered "no" to skipping a home lesson: that make-up goes back to being
    // unscheduled rather than quietly costing the lesson anyway.
    if (!allowDisplacing && proposal?.displaces?.length) proposal = null;
    return {
      ...lesson,
      date: clash.date,
      makeup: {
        date: proposal?.date || '',
        start: proposal?.start ?? clash.start,
        end: proposal?.end ?? clash.end,
        location: proposal?.location || lesson.location || '',
        tutor: proposal?.tutor || lesson.tutor || '',
        displaces: proposal?.displaces || [],
      },
      fixed: false,
    };
  });

  return { ok: true, events: dated, lessons, detected };
}

// A lesson picked by hand that the events do not actually cover: use its next
// occurrence from today, so "the same week, before that day" still means
// something. Null when the lesson has no weekday to count from.
function manualOccurrence(lesson, events, today) {
  if (!lesson) return null;
  if (!Number.isInteger(lesson.weekday) || !Number.isFinite(lesson.start)) {
    return { code: lesson.code, date: '', start: lesson.start ?? 0, end: lesson.end ?? 0, event: '' };
  }
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i);
    if (weekdayOf(date) === lesson.weekday) {
      return { code: lesson.code, date, start: lesson.start, end: lesson.end ?? lesson.start + 60, event: events[0]?.name || '' };
    }
  }
  return null;
}

// ── opening a case ──────────────────────────────────────────────────────────

// Sends what planClash() worked out. Both entry points come through here, so
// the page and WhatsApp can never drift apart.
export async function openClash({
  codes = null, makeups = null, events = [], day, via = 'web', note = '', allowDisplacing = true,
} = {}) {
  const plan = await planClash({ events, codes, makeups, allowDisplacing });
  if (!plan.ok) return plan;

  const caseRec = sanitizeCase({
    id: newCaseId(),
    createdAt: new Date().toISOString(),
    createdVia: via === 'whatsapp' ? 'whatsapp' : 'web',
    lessons: plan.lessons,
    events: plan.events,
    note,
  });

  await writeCase(caseRec);
  await addOpen(caseRec.id);

  const out = await sendClashTemplate(caseRec, { day });
  return { ...out, case: caseRec };
}

// ── marking lessons arranged ────────────────────────────────────────────────
//
// The one place lessons get ticked off, whether that came from a WhatsApp list
// row (one at a time — the Cloud API's list control is single-select), a typed
// reply of several codes, or the page: mark them, then send exactly one
// message to all three.
export async function resolveLessons({ caseId, codes, by }) {
  const caseRec = await readCase(caseId);
  if (!caseRec) return { ok: false, error: 'That clash has expired or was already closed.' };

  const at = new Date().toISOString();
  const fixed = (Array.isArray(codes) ? codes : [codes])
    .map((code) => markFixed(caseRec, String(code || '').toLowerCase(), by, at))
    .filter(Boolean);

  if (!fixed.length) {
    return { ok: false, stale: true, error: 'That lesson is already marked as arranged.', case: caseRec };
  }

  await writeCase(caseRec);
  const closed = isClosed(caseRec);

  // One message to all three however many lessons were just ticked off, and
  // which one depends on what is left: still outstanding → the alert again,
  // with those lessons moved down to ✅ Arranged; nothing outstanding → the
  // sign-off, which has no buttons because there is nothing left to tap.
  if (closed) {
    caseRec.closedAt = new Date().toISOString();
    await writeCase(caseRec);
    await removeOpen(caseRec.id);
    await sendDoneTemplate(caseRec);
  } else {
    await sendClashTemplate(caseRec);
  }

  return { ok: true, closed, fixed, case: caseRec };
}

// ── incoming ────────────────────────────────────────────────────────────────

// Returns true when this message belonged to the clash flow and has been
// handled; false means "not ours" and the caller falls through to the prefect
// flows. Never throws: see the note at the top of the file.
export async function handleClashWebhook({ from, fromUserId, profileName, msg } = {}) {
  try {
    const payload = msg?.button?.payload
      || msg?.interactive?.button_reply?.id
      || msg?.interactive?.list_reply?.id
      || '';

    if (payload.startsWith('CLASH_')) return await handleClashPayload({ from, fromUserId, profileName, payload });

    // Payload-less fallback: the template's quick reply matched by its label,
    // so the button can be reworded in Meta without a deploy. Deliberately
    // narrow — no prefect button carries this wording.
    const label = msg?.button?.text || msg?.interactive?.button_reply?.title || '';
    if (label && /已完成調堂|actions taken/i.test(label)) {
      const open = await readOpenCases();
      if (!open.length) return false; // nothing to act on; let the prefect flow answer
      return await handleClashPayload({ from, fromUserId, profileName, payload: `${P_DONE}${open[0].id}` });
    }

    if (msg?.type === 'text') {
      return await handleClashText({ from, fromUserId, profileName, text: msg.text?.body || '' });
    }
    return false;
  } catch (e) {
    console.error('clash: webhook handling failed, falling through:', e);
    return false;
  }
}

async function handleClashPayload({ from, fromUserId, profileName, payload }) {
  const sender = await resolveClashSender({ from, fromUserId });
  // A CLASH_ payload can only exist because we sent it to one of the three, so
  // an unknown sender here means the recipient list was edited underneath the
  // message. Claim it anyway — it is unambiguously ours — and answer politely.
  const replyTo = sender?.replyTo || from || fromUserId;
  const who = sender?.person?.name || profileName || '';
  if (!replyTo) return true;

  // "Actions taken 已完成調堂" opens the picker directly. P_PICK was the
  // intermediate "which lesson?" button that used to sit in between; it is
  // still answered because messages carrying it may be sitting in the chat.
  if (payload.startsWith(P_DONE) || payload.startsWith(P_PICK)) {
    const caseRec = await readCase(payload.slice(payload.indexOf(':') + 1));
    if (!caseRec) {
      await safeSend(replyTo, 'That clash is no longer open — nothing to do. 👍');
      return true;
    }
    const pending = pendingLessons(caseRec);
    if (!pending.length) {
      await safeSend(replyTo, 'Every lesson in that clash is already marked as arranged. ✅');
      return true;
    }
    // A WhatsApp list is single-select — there is no multi-select control in
    // the Cloud API — so the way to tick off two at once is to type both
    // codes. This draft is what makes that reply mean "these are arranged"
    // instead of anything else.
    if (sender?.key) await setDraft(sender.key, { step: 'fixing', caseId: caseRec.id });

    try {
      await sendList(replyTo, {
        header: 'Lessons to arrange',
        body: 'Pick the lesson that has been rearranged — or reply with the codes '
          + `(e.g. *${pending.slice(0, 2).map((l) => l.code).join(',')}*) to tick off several at once.`,
        button: 'Select 選擇',
        rows: pending.slice(0, MAX_PICK).map((l) => ({
          id: `${P_FIX}${caseRec.id}:${l.code}`,
          // "1️⃣ Japanese" — 24 characters is not much, so the slot and the
          // make-up are dropped here; both are in the message above.
          title: lessonLine({ ...l, when: '', makeup: null }),
          description: [l.when, l.tutor].filter(Boolean).join(' · '),
        })),
      });
    } catch (e) {
      console.error('clash: list send failed:', e.message);
      await safeSend(replyTo, `Still to arrange: ${describeLessons(pending)}.\n`
        + 'Reply with the code(s) of whatever has been rearranged.');
    }
    return true;
  }

  if (payload.startsWith(P_FIX)) {
    const [caseId, code] = payload.slice(P_FIX.length).split(':');
    if (sender?.key) await clearDraft(sender.key);
    const out = await resolveLessons({ caseId, codes: [code], by: who });
    // The template that follows goes to all three, this sender included, so
    // only a failure needs a word back.
    if (!out.ok) await safeSend(replyTo, out.error);
    return true;
  }

  return true; // a CLASH_ payload we don't recognise is still ours, not a prefect's
}

// ── the "clash" conversation ────────────────────────────────────────────────

// "HKYAS, 16/8-19/8" -> a named event with real dates. parseEvents splits the
// name from the rest; parseEventWhen turns the rest into dates and times.
function readEvents(text) {
  const today = hkDate();
  return parseEvents(text).map((e) => {
    const when = parseEventWhen(e.when, today);
    return { name: e.name, ...when, when: eventWhen({ ...when, when: e.when }) };
  });
}

const NEED_A_DATE = 'I need the date too — e.g. *HKYAS, 16/8-19/8* or *Speech Day, 21/8, 2pm-5pm*.';
const NOTHING_CLASHES = 'Nothing in your timetable clashes with that. 👍';
const EDIT_ON_THE_PAGE = 'To change the lessons or the make-up times, use mathans.app/parents/clash.';

// Home lessons a plan would give up to fit its make-ups in.
const displacedBy = (plan) =>
  (plan.lessons || []).flatMap((l) => (l.makeup?.date ? (l.makeup.displaces || []) : []));

// What the system worked out, for a human to approve before three phones hear
// about it. The make-up slot is the part worth checking, so it is on the line —
// and where a slot only fits by skipping a lesson at home, that is asked
// outright rather than buried in the list.
function planSummary(plan) {
  const lines = plan.lessons.map((l) => `• ${lessonLine(l)}`);
  const stuck = plan.lessons.filter((l) => !l.makeup?.date).length;
  const skipped = describeDisplaced(displacedBy(plan));
  return [
    `⚠️ ${describeEvents(plan.events)} — ${plan.events.map((e) => e.when).join(', ')}`,
    `${plan.lessons.length} lesson${plan.lessons.length === 1 ? '' : 's'} clash${plan.lessons.length === 1 ? 'es' : ''}:`,
    ...lines,
    stuck ? `\n${stuck} of them has no free slot that week — arrange those with the tutor.` : '',
    skipped
      ? `\nThat week only fits if *${skipped}* at home is skipped — the centre's slots are the harder ones to move.`
        + `\n\nReply *yes* to send it that way, *no* to keep ${skipped} and leave the make-up unscheduled, `
        + 'or *stop* to cancel.'
      : '\nSend this to everyone? Reply *yes*, or *stop* to cancel.',
    EDIT_ON_THE_PAGE,
  ].filter(Boolean).join('\n');
}

const isYes = (t) => /^(y|yes|ok|okay|send|好|係|是)$/i.test(t.trim());
const isNo = (t) => /^(n|no|nope|不|唔好|唔要)$/i.test(t.trim());
const isKeyword = (t) => /^(clash|clashes|調堂|调堂)$/i.test(t.trim());
const isStop = (t) => /^(stop|cancel clash|abort|取消)$/i.test(t.trim());

// The two messages that belong to the prefect system and look like nothing
// else: the VHP's suspension approval, and a handbook read-check code. They
// are only ever conceded to a sender who is actually on the prefect side —
// see whichSystem() below.
const isPrefectWord = (t) => /^cancel$/i.test(t.trim()) || /^\s*\d{6}\s*$/.test(t);

const vhpPhone = () => digits(process.env.VHP_PHONE);

// Which system does this number belong to? Both lists are checked before a
// word is read, because the same text means different things depending on who
// sent it: six digits from a prefect is a handbook code, six digits from Mum
// is a mistyped lesson code — and answering her with the handbook's "wrong
// code, open the handbook page" is the prefect system leaking into the family.
//
// prefect-messenger owns the contact list and its shape; this is a read, and
// the only line of contact between the two systems.
async function whichSystem({ from, fromUserId }) {
  const [family, prefects] = await Promise.all([
    resolveClashSender({ from, fromUserId }),
    getPrefectContacts(),
  ]);
  const phone = digits(from);
  const isPrefect = Boolean(
    (phone && prefects.some((c) => c.phone === phone))
    || (fromUserId && prefects.some((c) => c.userId === fromUserId))
    || (phone && vhpPhone() && phone === vhpPhone()),
  );
  return { family, isPrefect };
}

async function handleClashText({ from, fromUserId, profileName, text }) {
  const t = String(text || '').trim();
  if (!t) return false;

  const { family: sender, isPrefect } = await whichSystem({ from, fromUserId });
  if (!sender) return false; // not family — the prefect flows own this message

  // Kingsley is on both lists: he is his parents' son and the board's VHP.
  // Only for someone like him do CANCEL and a six-digit code still belong to
  // the prefect side. A parent is family and nothing else, so nothing they
  // send is ever handed to the prefect flows.
  if (isPrefect && isPrefectWord(t)) return false;

  const { key, replyTo } = sender;
  const draft = await getDraft(key);

  if (isStop(t)) {
    if (!draft) return false;
    await clearDraft(key);
    await safeSend(replyTo, CANCELLED);
    return true;
  }

  if (isKeyword(t)) {
    const catalogue = await getLessons();
    if (!catalogue.length) {
      await safeSend(replyTo, NO_CATALOGUE);
      return true;
    }
    await setDraft(key, { step: 'event', startedAt: new Date().toISOString() });
    await safeSend(replyTo, ASK_EVENTS);
    return true;
  }

  // Ticking off several at once: the picker was just sent, so a reply of codes
  // means "these have been arranged". Matched against this clash's own lessons
  // rather than the whole catalogue — a code for a tutorial that is not part of
  // this clash is a mistake worth naming, not a silent no-op.
  if (draft?.step === 'fixing') {
    const caseRec = await readCase(draft.caseId);
    if (!caseRec) {
      await clearDraft(key);
      await safeSend(replyTo, 'That clash is no longer open — nothing to do. 👍');
      return true;
    }
    const { lessons: named, unknown } = parseCodes(t, caseRec.lessons);
    const outstanding = named.filter((l) => !l.fixed);

    if (!outstanding.length) {
      await safeSend(replyTo, unknown.length || !named.length
        ? `That is not one of the lessons in this clash. Still to arrange: ${describeLessons(pendingLessons(caseRec))}.`
        : 'Already marked as arranged. ✅');
      return true;
    }

    await clearDraft(key);
    const out = await resolveLessons({
      caseId: caseRec.id,
      codes: outstanding.map((l) => l.code),
      by: sender.person?.name || profileName || '',
    });
    // The template that follows goes to all three, so the only thing left to
    // say is which codes were not understood.
    if (out.ok && unknown.length) {
      await safeSend(replyTo, `Noted — but I don't have ${unknown.map((u) => `*${u}*`).join(', ')} on this clash.`);
    } else if (!out.ok) {
      await safeSend(replyTo, out.error);
    }
    return true;
  }

  // The event, with its dates — everything else is worked out from it.
  if (draft?.step === 'event') {
    const events = readEvents(t);
    const undated = events.filter((e) => !e.startDate);
    if (!events.length || undated.length) {
      await safeSend(replyTo, events.length ? NEED_A_DATE : ASK_EVENTS);
      return true;
    }

    const plan = await planClash({ events });
    if (!plan.ok) {
      // Nothing clashing is a perfectly good answer, and the commonest one.
      await clearDraft(key);
      await safeSend(replyTo, plan.none
        ? `${NOTHING_CLASHES}\n\n${describeEvents(events)} — ${events.map((e) => e.when).join(', ')}.`
        : (plan.error || 'Something went wrong — try again in a moment.'));
      return true;
    }

    // A confirm step earns its keep now that the system is choosing both the
    // lessons and the slots: a wrong guess would otherwise reach all three
    // phones before anyone saw it.
    await setDraft(key, {
      ...draft, step: 'confirm', events, displaces: displacedBy(plan).length > 0,
    });
    await safeSend(replyTo, planSummary(plan));
    return true;
  }

  if (draft?.step === 'confirm') {
    // "No" is only an answer when something was going to be skipped: it means
    // keep the home lesson and send the plan without that make-up.
    const keepHomeLessons = isNo(t) && draft.displaces;
    if (!isYes(t) && !keepHomeLessons) {
      await safeSend(replyTo, `Reply *yes* to send it to everyone, or *stop* to cancel.\n${EDIT_ON_THE_PAGE}`);
      return true;
    }
    const out = await openClash({
      events: draft.events || [],
      via: 'whatsapp',
      allowDisplacing: !keepHomeLessons,
    });
    if (!out.ok) {
      // The draft is left standing: re-typing "yes" is a cheaper retry than
      // starting from the event again.
      await safeSend(replyTo, out.error || 'Something went wrong sending that — try again in a moment.');
      return true;
    }
    await clearDraft(key);
    // The sender gets the template too, so this is only the receipt.
    await safeSend(replyTo, `Sent to ${out.sent} 📤`);
    return true;
  }

  // Family talking to the bot outside a flow. Anyone who is also on the
  // prefect side (Kingsley) falls through, because a stray text from them is a
  // prefect matter; a parent gets a family answer, never the prefect
  // "no-reply number" brush-off.
  if (isPrefect) return false;
  await safeSend(replyTo, 'Send *clash* to report a lesson clash. Anything else here is not monitored — '
    + 'message Kingsley directly.');
  return true;
}

// ── the page ────────────────────────────────────────────────────────────────

export async function getClashState() {
  const [cases, lessons, recipients] = await Promise.all([readOpenCases(), getLessons(), getRecipients()]);
  return {
    today: hkDate(),
    day: dayLabel(hkNow()),
    lessons,
    // Numbers are shown to the one person who can already read them (the page
    // is behind the admin passcode), so the editor can round-trip them.
    recipients,
    cases: cases.map((c) => ({
      ...c,
      pending: pendingLessons(c).map((l) => l.code),
      progress: progressLine(c),
    })),
  };
}
