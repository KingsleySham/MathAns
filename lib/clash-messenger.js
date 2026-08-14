// Lesson-clash conversation — the WhatsApp half.
//
// Two ways in, one flow out:
//
//   • mathans.app/parents/clash — tick the tutorials, name the event(s), send
//   • text the bot "clash"      — it asks for the codes, then the event(s)
//
// Either way the family (Kingsley, Mum, Dad) gets the approved `class_clash`
// template with the "Actions taken 已完成調堂" quick reply. Tapping it offers a
// button that opens the list of lessons still to be arranged; picking one
// moves that lesson to ✅ Arranged and sends the template again — until
// nothing is left, when `class_clash_done` closes the thread instead.
//
//   class_clash ──tap──► "Which lesson?" button ──tap──► list of pending
//        ▲                                                      │
//        └──── still outstanding? send it again, ◄──────────────┤
//              with this one moved to ✅ Arranged               │
//                                                               ▼
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

import { sendButtons, sendList, sendTemplate, sendText, sendTextOrTemplate } from './whatsapp.js';
// The one thing the two systems share, and it is a read: the prefect contact
// list, used to work out which system an incoming number belongs to before a
// single word of it is interpreted.
import { getContacts as getPrefectContacts } from './prefect-messenger.js';
import {
  ASK_EVENTS, ASK_LESSONS, CANCELLED, MAX_PICK, NO_CATALOGUE, UNKNOWN_CODES,
  clashTemplateParams, dayLabel, describeEvents, describeLessons, doneSummary,
  doneTemplateParams, isClosed, lessonLine, markFixed, notifiable, parseCodes,
  parseEvents, pendingLessons, progressLine, sanitizeCase,
} from './clash-flow.js';
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
const digits = (v) => String(v ?? '').replace(/\D/g, '');

// Payload prefixes, set at send time and read back in the webhook.
const P_DONE = 'CLASH_DONE:';   // template quick reply — "Actions taken 已完成調堂"
const P_PICK = 'CLASH_PICK:';   // "show me the lessons"
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

// ── opening a case ──────────────────────────────────────────────────────────

// `codes` are catalogue codes (from WhatsApp or the page); `events` is
// [{ name, when }]. Shared by both entry points so the two can never drift.
export async function openClash({ codes = [], events = [], day, via = 'web', note = '' } = {}) {
  const catalogue = await getLessons();
  if (!catalogue.length) return { ok: false, error: NO_CATALOGUE };

  const { lessons, unknown } = parseCodes(codes.join(','), catalogue);
  if (unknown.length) return { ok: false, error: `Unknown lesson code(s): ${unknown.join(', ')}` };
  if (!lessons.length) return { ok: false, error: 'Pick at least one tutorial.' };
  if (!events.length) return { ok: false, error: 'Name at least one event — that is the reason for the clash.' };

  const caseRec = sanitizeCase({
    id: newCaseId(),
    createdAt: new Date().toISOString(),
    createdVia: via === 'whatsapp' ? 'whatsapp' : 'web',
    lessons: lessons.map((l) => ({ ...l, fixed: false })),
    events,
    note,
  });

  await writeCase(caseRec);
  await addOpen(caseRec.id);

  const out = await sendClashTemplate(caseRec, { day });
  return { ...out, case: caseRec };
}

// ── marking a lesson arranged ───────────────────────────────────────────────
//
// The one place a lesson gets ticked off, whether that came from a WhatsApp
// list row or the button on the page: mark it, tell everyone, and re-send the
// template if anything is still outstanding.
export async function resolveLesson({ caseId, code, by }) {
  const caseRec = await readCase(caseId);
  if (!caseRec) return { ok: false, error: 'That clash has expired or was already closed.' };

  const lesson = markFixed(caseRec, String(code || '').toLowerCase(), by, new Date().toISOString());
  if (!lesson) {
    return { ok: false, stale: true, error: 'That lesson is already marked as arranged.', case: caseRec };
  }

  await writeCase(caseRec);
  const closed = isClosed(caseRec);

  // One message per tap, to all three, and which one depends on what is left:
  // still outstanding → the alert again, with this lesson moved down to
  // ✅ Arranged; nothing outstanding → the sign-off, which has no buttons
  // because there is nothing left to tap.
  if (closed) {
    caseRec.closedAt = new Date().toISOString();
    await writeCase(caseRec);
    await removeOpen(caseRec.id);
    await sendDoneTemplate(caseRec);
  } else {
    await sendClashTemplate(caseRec);
  }

  return { ok: true, closed, lesson, case: caseRec };
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

  if (payload.startsWith(P_DONE)) {
    const caseRec = await readCase(payload.slice(P_DONE.length));
    if (!caseRec) {
      await safeSend(replyTo, 'That clash is no longer open — nothing to do. 👍');
      return true;
    }
    if (isClosed(caseRec)) {
      await safeSend(replyTo, 'Every lesson in that clash is already marked as arranged. ✅');
      return true;
    }
    try {
      await sendButtons(replyTo, {
        body: `Which lesson has been rearranged?\n${progressLine(caseRec)}.`,
        buttons: [{ id: `${P_PICK}${caseRec.id}`, title: 'Show lessons 選擇' }],
      });
    } catch (e) {
      console.error('clash: button send failed:', e.message);
    }
    return true;
  }

  if (payload.startsWith(P_PICK)) {
    const caseRec = await readCase(payload.slice(P_PICK.length));
    const pending = pendingLessons(caseRec);
    if (!caseRec || !pending.length) {
      await safeSend(replyTo, 'Nothing is outstanding on that clash. ✅');
      return true;
    }
    try {
      await sendList(replyTo, {
        header: 'Lessons to arrange',
        body: 'Pick the lesson that has been rearranged. If more than one is sorted, pick them one at a time.',
        button: 'Select 選擇',
        rows: pending.slice(0, MAX_PICK).map((l) => ({
          id: `${P_FIX}${caseRec.id}:${l.code}`,
          title: lessonLine({ ...l, when: '' }),   // "1️⃣ Japanese" — 24 chars is not much
          description: [l.when, l.tutor].filter(Boolean).join(' · '),
        })),
      });
    } catch (e) {
      console.error('clash: list send failed:', e.message);
      await safeSend(replyTo, `Still to arrange: ${describeLessons(pending)}.`);
    }
    return true;
  }

  if (payload.startsWith(P_FIX)) {
    const [caseId, code] = payload.slice(P_FIX.length).split(':');
    const out = await resolveLesson({ caseId, code, by: who });
    // The template that follows goes to all three, this sender included, so
    // only a failure needs a word back.
    if (!out.ok) await safeSend(replyTo, out.error);
    return true;
  }

  return true; // a CLASH_ payload we don't recognise is still ours, not a prefect's
}

// ── the "clash" conversation ────────────────────────────────────────────────

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
    await setDraft(key, { step: 'lessons', startedAt: new Date().toISOString() });
    await safeSend(replyTo, ASK_LESSONS(catalogue));
    return true;
  }

  if (draft?.step === 'lessons') {
    const catalogue = await getLessons();
    const { lessons, unknown } = parseCodes(t, catalogue);
    if (unknown.length || !lessons.length) {
      await safeSend(replyTo, unknown.length ? UNKNOWN_CODES(unknown, catalogue) : ASK_LESSONS(catalogue));
      return true;
    }
    await setDraft(key, { ...draft, step: 'events', codes: lessons.map((l) => l.code) });
    await safeSend(replyTo, `Got it — ${describeLessons(lessons)}.\n\n${ASK_EVENTS}`);
    return true;
  }

  if (draft?.step === 'events') {
    const events = parseEvents(t);
    if (!events.length) {
      await safeSend(replyTo, ASK_EVENTS);
      return true;
    }
    const out = await openClash({ codes: draft.codes || [], events, via: 'whatsapp' });
    if (!out.ok) {
      // The draft is deliberately left standing: re-typing the event is a
      // cheaper retry than starting from the codes again.
      await safeSend(replyTo, out.error || 'Something went wrong sending that — try again in a moment.');
      return true;
    }
    await clearDraft(key);
    // The sender gets the template too, so this is only the receipt.
    await safeSend(replyTo, `Sent to ${out.sent} 📤\nClash: ${describeEvents(events)}.`);
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
