// Prefect Hub messaging flows (see PREFECT_HUB.md).
//
// Everything conversational lives here — the evening-before reminders, the
// confirm/decline buttons, private absence reasons relayed to the VHP, the
// two-prefect coverage minimum, the morning-of weather update, and the
// VHP-approved suspension flow. api/whatsapp/* are thin transport shims
// around these functions.
//
// Hard rules carried over from the brief:
//   • Absence reasons go to the VHP privately, never to a group.
//   • The VHP is alerted when a slot falls below MIN_ON_DUTY (two).
//   • A suspension is never announced to prefects until the VHP replies
//     CANCEL — the morning check only ever messages the VHP about it.
//   • No student conduct data is stored anywhere here.
//
// Reminder cadence (VHP's call, Aug 2026): the evening cron sends the plain
// reminder with the confirm/decline buttons; weather is NOT included there
// because an evening forecast is stale by morning. The morning cron
// (06:00–07:00 HK) sends the weather variant — which says "today" and has
// no buttons — only when a warning is actually in force. A reserve-list
// cover flow existed briefly and was dropped; cover is arranged in the
// group chat.
//
// Redis keys (all JSON-encoded):
//   prefect:contacts          [{ name, phone, role, optIn }]
//   prefect:roster            [{ date, location, time, names }] — written by
//                             /prefects/status/update, read-only here
//   prefect:settings          { defaults, retention, lastPurge } — written by
//                             /prefects/status/update, read-only here; the
//                             defaults fill blank roster fields (see withDefaults)
//   prefect:duty:{date}       per-day reply state (7-day TTL)
//   prefect:awaiting:{phone}  duty date whose absence reason we're waiting for (24h TTL)
//   prefect:wx-sent:{date}    morning weather update already sent (24h TTL)
//   prefect:hold:{date}       suspension awaiting the VHP's CANCEL (24h TTL)
//   prefect:suspended:{date}  whole-day latch, same shape api/prefects/status.js writes

import { getRedisClient } from './prefect-redis-client.js';
import { sendText, sendTemplate, sendTextOrTemplate } from './whatsapp.js';
import { SUSPEND, ADVISORY, CUTOFF, formatDayLabel } from './prefect-duty-status-logic.js';
import { readSettings } from './prefect-roster-store.js';

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';

const TPL_REMINDER = () => process.env.WHATSAPP_TEMPLATE || 'prefect_duty_reminder';
// prefect_duty_reminder_weather is no longer sent: since Aug 2026 the morning
// weather update goes to the whole board via prefect_notice (see
// sendWeatherUpdate). The template stays approved in Meta in case the VHP wants
// the per-team variant back.

export const MIN_ON_DUTY = () => {
  const n = parseInt(process.env.PREFECT_MIN_ON_DUTY, 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
};

// ── time (Hong Kong, UTC+8, no DST) ─────────────────────────────────────────

const hkNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const hkMinutes = () => { const d = hkNow(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hkDate = () => hkNow().toISOString().slice(0, 10);

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── small text helpers ──────────────────────────────────────────────────────

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => WORDS[n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s) => String(s || '').trim().toLowerCase();
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const digits = (s) => String(s || '').replace(/\D/g, '');

// Body variables for the approved templates. The templates were built with
// NAMED variables in Meta's builder ({{name}}, {{gate}}, {{time}}, {{day}},
// plus {{weather}} on the weather variant and {{notice}} on the notice
// fallback) — these keys must match those names exactly.
const templateParams = (entry, contactName) => ({
  name: first(contactName),
  gate: entry.location || 'the gate',
  time: entry.time || '7:45am',
  day: formatDayLabel(entry.date),
});

// Fills a roster day's blank fields from the admin's saved duty defaults
// (Settings tab of /prefects/status/update), so most days only need a date
// and the names. The literal fallbacks in templateParams stay as the last
// resort: if Redis is down readSettings returns blanks, and the templates
// must still go out with something sensible in {{gate}} and {{time}} rather
// than an empty variable Meta would reject.
async function withDefaults(entry) {
  if (!entry) return entry;
  const { defaults } = await readSettings();
  return {
    ...entry,
    location: entry.location || defaults.location,
    time: entry.time || defaults.time,
    team: entry.team || defaults.team,
  };
}

function relativeDay(dateStr) {
  const today = hkDate();
  if (dateStr === today) return 'today';
  if (dateStr === addDays(today, 1)) return 'tomorrow';
  return `on ${formatDayLabel(dateStr)}`;
}

// Friendly names for the suspending codes; warnsum's `name` field for the
// rainstorm entry doesn't carry the colour, but the VHP alert needs it.
const SUSPEND_LABELS = {
  WRAINR: 'Red Rainstorm',
  WRAINB: 'Black Rainstorm',
  TC8NE: 'Typhoon Signal No. 8',
  TC8SE: 'Typhoon Signal No. 8',
  TC8NW: 'Typhoon Signal No. 8',
  TC8SW: 'Typhoon Signal No. 8',
  TC9: 'Typhoon Signal No. 9',
  TC10: 'Typhoon Signal No. 10',
};
const suspendLabels = (warnings) =>
  [...new Set(warnings.map((w) => SUSPEND_LABELS[w.code] || w.name))];

// ── Redis state ─────────────────────────────────────────────────────────────
// Reads fail soft (null/[]), same as api/prefects/status.js — a Redis outage
// degrades the flows but never crashes the webhook mid-conversation.

async function kvGet(key) {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function kvSet(key, value, ttlSeconds) {
  try {
    const redis = await getRedisClient();
    const opts = ttlSeconds ? { expiration: { type: 'EX', value: ttlSeconds } } : undefined;
    await redis.set(key, JSON.stringify(value), opts);
    return true;
  } catch {
    return false;
  }
}

async function kvDel(key) {
  try {
    const redis = await getRedisClient();
    await redis.del(key);
  } catch { /* best effort */ }
}

const DAY = 86400;

export const MAX_CONTACTS = 80;

// Contacts are the opt-in list the brief requires: no number is stored
// without `optIn`, and nothing is ever sent to a contact whose optIn is false.
export function sanitizeContacts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_CONTACTS)
    .map((c) => ({
      name: String(c?.name || '').trim().slice(0, 80),
      phone: digits(c?.phone).slice(0, 15),
      role: c?.role === 'reserve' ? 'reserve' : 'prefect',
      optIn: c?.optIn === true,
      // Business-scoped user ID, learned automatically from webhooks (Meta's
      // 2026 usernames rollout) — how we recognise a prefect whose webhooks
      // stop carrying a phone number.
      userId: String(c?.userId || '').trim().slice(0, 140),
      // Whether the one-off prefect_intro template has been sent to them.
      introSent: c?.introSent === true,
    }))
    .filter((c) => c.name && c.phone.length >= 8);
}

export const getContacts = async () => (await kvGet('prefect:contacts')) || [];
export const setContacts = (list) => kvSet('prefect:contacts', list);

const readRoster = async () => (await kvGet('prefect:roster')) || [];

const getDuty = (date) => kvGet(`prefect:duty:${date}`);
const saveDuty = (duty) => kvSet(`prefect:duty:${duty.date}`, duty, 7 * DAY);

// Per-day reply state, created when the reminders go out (or lazily when the
// first reply for that date arrives).
async function ensureDuty(entry) {
  const existing = await getDuty(entry.date);
  if (existing) return existing;
  const duty = {
    date: entry.date,
    location: entry.location || '',
    time: entry.time || '',
    names: entry.names || [],
    responses: {},                    // phone -> { name, status: 'in'|'out', reason? }
    shortAlerted: false,              // first "slot is short" alert sent
    escalated: false,                 // everyone-replied-still-short alert sent
    metNotified: false,
  };
  await saveDuty(duty);
  return duty;
}

// Duty state for a date, from Redis or built from the roster; null when the
// roster has nothing that day.
async function dutyFor(date) {
  if (!date) return null;
  const existing = await getDuty(date);
  if (existing) return existing;
  const entry = (await readRoster()).find((r) => r.date === date);
  return entry ? ensureDuty(entry) : null;
}

// Which duty a bare button tap (no payload date) most plausibly refers to:
// reminders go out the evening before, so tomorrow first, then today.
async function guessDutyDate() {
  const today = hkDate();
  const tomorrow = addDays(today, 1);
  const roster = await readRoster();
  if (roster.some((r) => r.date === tomorrow) || await getDuty(tomorrow)) return tomorrow;
  if (roster.some((r) => r.date === today) || await getDuty(today)) return today;
  return null;
}

const getAwaiting = (phone) => kvGet(`prefect:awaiting:${phone}`);
const setAwaiting = (phone, date) => kvSet(`prefect:awaiting:${phone}`, date, DAY);
const clearAwaiting = (phone) => kvDel(`prefect:awaiting:${phone}`);

const getHold = (date) => kvGet(`prefect:hold:${date}`);
const setHold = (date, hold) => kvSet(`prefect:hold:${date}`, hold, DAY);

// Same key and shape api/prefects/status.js latches, so the status embed
// flips to "Duty suspended — whole day" the moment the morning check runs.
const writeLatch = (date, names) => kvSet(`prefect:suspended:${date}`, names, DAY);

// ── VHP ─────────────────────────────────────────────────────────────────────

const vhpPhone = () => digits(process.env.VHP_PHONE);

// VHP recognition survives the usernames rollout: match by phone when the
// webhook has one (and learn the VHP's BSUID on the way through), else by
// the previously learned BSUID.
export async function isVhpSender({ from, fromUserId } = {}) {
  const v = vhpPhone();
  if (v && from && digits(from) === v) {
    if (fromUserId) await kvSet('prefect:vhp-bsuid', fromUserId);
    return true;
  }
  if (fromUserId) {
    const stored = await kvGet('prefect:vhp-bsuid');
    return Boolean(stored) && stored === fromUserId;
  }
  return false;
}

// Who sent this webhook? Phone number when Meta shares it; otherwise the
// BSUID, resolved against contacts. Whenever a webhook carries BOTH
// identifiers, the BSUID is saved onto the matching contact so later
// phone-less webhooks (username adopters) still resolve to the right
// prefect. Duty-state keys stay phone-based whenever the contact is known,
// so a prefect's history isn't split across identifiers.
export async function resolveSender({ from, fromUserId, profileName } = {}) {
  const contacts = await getContacts();
  let phone = digits(from) || null;
  let contact = phone ? contacts.find((c) => c.phone === phone) : null;

  if (!contact && fromUserId) {
    contact = contacts.find((c) => c.userId === fromUserId) || null;
    if (contact && !phone) phone = contact.phone;
  }

  if (contact && fromUserId && contact.userId !== fromUserId) {
    contact.userId = fromUserId;
    await setContacts(contacts);
  }

  return {
    phone,
    contact,
    key: phone || fromUserId || null,     // duty-response / awaiting-reason key
    replyTo: from || fromUserId || null,  // lib/whatsapp.js routes BSUIDs via `recipient`
    name: contact?.name || profileName || 'there',
  };
}

async function notifyVhp(text) {
  const vhp = vhpPhone();
  if (!vhp) {
    console.error('VHP_PHONE is not set — dropping VHP notice:', text);
    return false;
  }
  try {
    await sendTextOrTemplate(vhp, text);
    return true;
  } catch (e) {
    console.error('VHP notify failed:', e.message);
    return false;
  }
}

async function safeSendText(to, body) {
  try {
    await sendText(to, body);
  } catch (e) {
    console.error(`send to ${to} failed:`, e.message);
  }
}

// ── coverage ────────────────────────────────────────────────────────────────

function coverageOf(duty) {
  const entries = Object.values(duty.responses || {});
  const confirmed = entries.filter((e) => e.status === 'in');
  const out = entries.filter((e) => e.status === 'out');
  const replied = new Set(entries.map((e) => norm(e.name)));
  const noReply = (duty.names || []).filter((n) => !replied.has(norm(n)));
  return { confirmed, out, noReply };
}

// "2 in · 1 out · 0 waiting" — the running tally on per-reply notifications.
function tallyOf(duty) {
  const { confirmed, out, noReply } = coverageOf(duty);
  return `${confirmed.length} in · ${out.length} out · ${noReply.length} waiting`;
}

// The "slot is short" alerts. Triggered by declines (and by the last
// outstanding reply arriving), never by silence alone — an evening of no
// replies yet isn't an emergency. Speaks at most twice per day: once on the
// first decline that leaves the slot short, and once more when everyone has
// replied and it's still short (cover is arranged in the group chat).
async function maybeAlertShort(duty) {
  const { confirmed, out, noReply } = coverageOf(duty);
  const min = MIN_ON_DUTY();
  if (confirmed.length >= min) return false;

  const allReplied = !noReply.length;
  const firstAlert = !duty.shortAlerted && (out.length || allReplied);
  const escalation = duty.shortAlerted && !duty.escalated && allReplied;
  if (!firstAlert && !escalation) return false;

  duty.shortAlerted = true;
  if (allReplied) duty.escalated = true;
  await saveDuty(duty);

  const shortBy = min - confirmed.length;
  let text = `${formatDayLabel(duty.date)} — ${word(shortBy)} prefect${shortBy === 1 ? '' : 's'} short\n` +
    `Only ${confirmed.length} confirmed, minimum is ${word(min)}. Out: ${out.map((e) => e.name).join(', ') || 'none'}.`;
  if (allReplied) text += ' Everyone has replied — arrange cover in the group.';
  else text += ` No reply yet: ${noReply.join(', ')}.`;
  await notifyVhp(text);
  return true;
}

// The counterpart: speaks when a previously-alerted slot recovers.
async function maybeNotifyMet(duty, confirmerName) {
  const { confirmed } = coverageOf(duty);
  const min = MIN_ON_DUTY();
  if (!duty.shortAlerted || duty.metNotified || confirmed.length < min) return false;
  duty.metNotified = true;
  await saveDuty(duty);
  await notifyVhp(`${confirmerName} confirmed. ${cap(word(confirmed.length))} on duty ${relativeDay(duty.date)} — minimum met.`);
  return true;
}

// ── incoming: prefect buttons and texts ─────────────────────────────────────

// action: 'confirm' | 'decline'; date comes from the button payload
// ("CONFIRM:2026-06-22") or null for label-only fallback matches.
export async function handleButton({ from, fromUserId, profileName, action, date }) {
  const sender = await resolveSender({ from, fromUserId, profileName });
  if (!sender.key) return;
  const { key, replyTo, name } = sender;

  const dutyDate = date || (await guessDutyDate());
  const duty = await dutyFor(dutyDate);
  if (!duty) {
    return safeSendText(replyTo, "Thanks — I couldn't find a duty for that day. Please check with the VHP.");
  }

  // Every reply pings the VHP once (their request) — but the short/met
  // alerts already carry the same news, so a generic notification is only
  // sent when no alert fired for this reply.
  if (action === 'confirm') {
    duty.responses[key] = { name, status: 'in' };
    await saveDuty(duty);
    await clearAwaiting(key);
    await safeSendText(replyTo, 'Thanks — see you at the gate.');
    const alerted = await maybeNotifyMet(duty, name);
    if (!alerted) await notifyVhp(`${name} confirmed for ${formatDayLabel(duty.date)} (${tallyOf(duty)}).`);
    return;
  }

  // decline
  duty.responses[key] = { name, status: 'out' };
  await saveDuty(duty);
  await setAwaiting(key, duty.date);
  await safeSendText(replyTo, "No problem. What's the reason? Your reply goes to the VHP only.");
  const alerted = await maybeAlertShort(duty);
  if (!alerted) await notifyVhp(`${name} can't make ${formatDayLabel(duty.date)} — asked for the reason (${tallyOf(duty)}).`);
}

const enquiryPhone = () => process.env.PREFECT_ENQUIRY_PHONE || '+852 9257 7822';

// Anyone texting the bot outside a flow gets pointed at the real enquiries
// number — once per sender per day, so a chatty sender isn't spammed. Free
// inside the 24h window their own message just opened.
async function maybeRedirect({ key, replyTo }) {
  if (!key || !replyTo) return;
  if (await kvGet(`prefect:redirected:${key}`)) return;
  await kvSet(`prefect:redirected:${key}`, true, DAY);
  await safeSendText(replyTo,
    `This is a no-reply number. For direct enquiries, please contact Kingsley via ${enquiryPhone()}.\n` +
    'Thank you for your kind attention.');
}

// Free text from a prefect only matters as an absence reason we asked for;
// anything else gets the automated redirect to the enquiries number.
export async function handlePrefectText({ from, fromUserId, profileName, text }) {
  const sender = await resolveSender({ from, fromUserId, profileName });
  if (!sender.key) return;
  const { key, replyTo } = sender;

  const awaiting = await getAwaiting(key);
  if (!awaiting) return maybeRedirect(sender);

  const name = sender.contact?.name || profileName || 'A prefect';
  const reason = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');

  await clearAwaiting(key);
  const duty = await dutyFor(awaiting);
  if (duty) {
    duty.responses[key] = { ...(duty.responses[key] || {}), name, status: 'out', reason };
    await saveDuty(duty);
  }

  await safeSendText(replyTo, 'Noted, thanks for letting me know.');
  // Privately, to the VHP only — never to a group.
  await notifyVhp(`${name} is out on ${formatDayLabel(awaiting)} — ${reason || 'no reason given'}.`);
  if (duty) await maybeAlertShort(duty);
}

// ── incoming: VHP commands ──────────────────────────────────────────────────

export async function handleVhpText(text) {
  const t = String(text || '').trim().toUpperCase();
  if (t.startsWith('CANCEL')) return approveCancel();
  await safeSendText(vhpPhone(),
    'Command — CANCEL: confirm a held suspension and notify the affected prefects. ' +
    'Everything else here is automatic; cover is arranged in the group.');
}

// The CANCEL approval for a held suspension — via a WhatsApp "CANCEL" reply
// or the admin page's button. Both are the VHP acting, which is what the
// brief requires; this is the only path that ever tells prefects duty is
// off. viaWeb returns errors in the HTTP response instead of texting them.
export async function approveCancel({ viaWeb = false } = {}) {
  const vhp = vhpPhone();
  const today = hkDate();
  const refuse = async (error) => {
    if (!viaWeb) await safeSendText(vhp, error);
    return { ok: false, error };
  };

  const hold = await getHold(today);
  if (!hold) return refuse("There's no suspension waiting for approval today.");
  if (hold.notified) return refuse('Already sent — the board has been notified.');

  const duty = await dutyFor(today);
  if (!duty) return refuse('No duty is scheduled today — nothing to cancel.');

  const contacts = await getContacts();
  const recipients = new Map(); // phone -> name
  for (const n of duty.names || []) {
    const c = contacts.find((x) => norm(x.name) === norm(n));
    if (c?.optIn && duty.responses?.[c.phone]?.status !== 'out') recipients.set(c.phone, c.name);
  }

  const message =
    `Duty on ${formatDayLabel(today)} is cancelled — ${hold.labels.join(', ')} in force. ` +
    'Do not report for duty. Follow the school\'s announcements for the rest of the day.';
  let sent = 0;
  for (const [phone] of recipients) {
    try {
      await sendTextOrTemplate(phone, message);
      sent += 1;
    } catch (e) {
      console.error(`cancellation to ${phone} failed:`, e.message);
    }
  }
  await setHold(today, { ...hold, notified: true });
  await safeSendText(vhp, `Cancellation sent to ${sent} prefect${sent === 1 ? '' : 's'}.`);
  return { ok: true, sent };
}

// ── admin page ops (all behind PREFECT_ADMIN_SECRET in api/whatsapp/tasks.js) ─

export const MAX_NOTICE_LEN = 900; // template params cap out around 1024 chars

// One-off notice to the whole board or to one day's duty team, always sent
// as the prefect_notice template so every recipient gets the same official
// ⚠️-framed message (and delivery never depends on whose 24h window happens
// to be open). This is the VHP speaking through the admin page —
// operational notices only, per the brief's Utility-category constraint.
export async function sendNotice({ text, audience = 'board', date } = {}) {
  const body = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTICE_LEN);
  if (!body) return { ok: false, error: 'Notice text is required' };

  const contacts = (await getContacts()).filter((c) => c.optIn && c.phone);
  let targets = contacts;
  let scope = 'the whole board';
  if (audience === 'duty') {
    const target = date || hkDate();
    const entry = (await readRoster()).find((r) => r.date === target);
    if (!entry?.names?.length) return { ok: false, error: `No duty on the roster for ${target}` };
    targets = entry.names
      .map((n) => contacts.find((c) => norm(c.name) === norm(n)))
      .filter(Boolean);
    scope = `the ${formatDayLabel(target)} duty team`;
    if (!targets.length) return { ok: false, error: "No opted-in contacts match that day's roster names" };
  }
  if (!targets.length) return { ok: false, error: 'No opted-in contacts on file' };

  const results = [];
  for (const c of targets) {
    try {
      await sendTemplate({
        to: c.phone,
        name: process.env.WHATSAPP_NOTICE_TEMPLATE || 'prefect_notice',
        bodyParams: { notice: body },
      });
      results.push({ name: c.name, ok: true });
    } catch (e) {
      results.push({ name: c.name, ok: false, error: e.message });
    }
  }
  return { ok: true, scope, sent: results.filter((r) => r.ok).length, results };
}

// One-off welcome/introduction, sent via the prefect_intro template to
// opted-in contacts who haven't received it yet (tracked as `introSent` on
// the contact). Idempotent: a second run sends nothing. Pass {names: [...]}
// to (re)send to specific contacts regardless of the flag.
//
// start/end are the DUTY PERIOD DATES for the current rotation (e.g. "16/9"
// and "30/10"), supplied by the admin page and remembered in Redis so the
// next batch of intros reuses them until the period changes.
export async function sendIntro({ names, start, end } = {}) {
  const stored = (await kvGet('prefect:intro-period')) || {};
  const period = {
    start: String(start || stored.start || '').trim().slice(0, 20),
    end: String(end || stored.end || '').trim().slice(0, 20),
  };
  if (!period.start || !period.end) {
    return { ok: false, error: 'Duty period start and end dates are required (e.g. 16/9 and 30/10)' };
  }
  if (period.start !== stored.start || period.end !== stored.end) {
    await kvSet('prefect:intro-period', period);
  }

  const contacts = await getContacts();
  const wanted = Array.isArray(names) && names.length
    ? contacts.filter((c) => names.some((n) => norm(n) === norm(c.name)))
    : contacts.filter((c) => c.optIn && !c.introSent);
  if (!wanted.length) return { ok: true, sent: 0, results: [], note: 'nobody pending an intro' };

  const results = [];
  for (const c of wanted) {
    if (!c.optIn) { results.push({ name: c.name, ok: false, error: 'not opted in' }); continue; }
    try {
      await sendTemplate({
        to: c.phone,
        name: process.env.WHATSAPP_INTRO_TEMPLATE || 'prefect_intro',
        bodyParams: {
          name: first(c.name),
          vhp: process.env.PREFECT_VHP_NAME || 'Kingsley',
          start: period.start,
          end: period.end,
        },
      });
      c.introSent = true;
      results.push({ name: c.name, ok: true });
    } catch (e) {
      results.push({ name: c.name, ok: false, error: e.message });
    }
  }
  await setContacts(contacts);
  return { ok: true, sent: results.filter((r) => r.ok).length, results, period };
}

// Live reply state for the admin page: who's in, who's out (with their
// private reason — the page is VHP-only), who hasn't replied, plus today's
// suspension state for the cancel button.
export async function getReplies(date) {
  const target = date || (await guessDutyDate()) || hkDate();
  const entry = (await readRoster()).find((r) => r.date === target);
  const duty = await getDuty(target); // read-only: don't create state just by looking
  const byName = new Map(Object.values(duty?.responses || {}).map((r) => [norm(r.name), r]));

  const names = entry?.names || duty?.names || [];
  const rows = names.map((n) => {
    const r = byName.get(norm(n));
    return {
      name: n,
      status: r ? (r.status === 'in' ? 'confirmed' : 'out') : 'no reply',
      ...(r?.reason ? { reason: r.reason } : {}),
    };
  });
  const tally = {
    confirmed: rows.filter((r) => r.status === 'confirmed').length,
    out: rows.filter((r) => r.status === 'out').length,
    waiting: rows.filter((r) => r.status === 'no reply').length,
  };

  const today = hkDate();
  const hold = await getHold(today);
  return {
    date: target,
    hasDuty: Boolean(names.length),
    location: entry?.location || duty?.location || '',
    time: entry?.time || duty?.time || '',
    rows,
    tally,
    suspension: {
      date: today,
      latched: Boolean(await kvGet(`prefect:suspended:${today}`)),
      held: Boolean(hold),
      notified: Boolean(hold?.notified),
      labels: hold?.labels || [],
    },
  };
}

// ── crons ───────────────────────────────────────────────────────────────────

async function fetchActiveWarnings() {
  const res = await fetch(HKO);
  if (!res.ok) throw new Error('HKO ' + res.status);
  const json = await res.json();
  return Object.values(json).filter((w) => w && w.code && w.actionCode !== 'CANCEL');
}

// Evening cron (12:00 UTC ≈ 20:00 HK): remind tomorrow's team with the
// confirm/decline buttons. Deliberately weather-free — an evening forecast
// is stale by morning, so weather goes out with the morning cron instead.
// Quiet when the roster has nothing tomorrow.
export async function sendReminders({ date } = {}) {
  const target = date || addDays(hkDate(), 1);
  const stored = (await readRoster()).find((r) => r.date === target);
  if (!stored || !stored.names?.length) {
    return { date: target, sent: 0, results: [], note: 'no duty scheduled' };
  }
  const entry = await withDefaults(stored);

  await ensureDuty(entry);
  const contacts = await getContacts();

  const results = [];
  for (const rosterName of entry.names) {
    const c = contacts.find((x) => norm(x.name) === norm(rosterName));
    if (!c) { results.push({ name: rosterName, ok: false, error: 'no contact on file' }); continue; }
    if (!c.optIn) { results.push({ name: rosterName, ok: false, error: 'not opted in' }); continue; }
    try {
      await sendTemplate({
        to: c.phone,
        name: TPL_REMINDER(),
        bodyParams: templateParams(entry, c.name),
        buttonPayloads: [`CONFIRM:${entry.date}`, `DECLINE:${entry.date}`],
      });
      results.push({ name: rosterName, ok: true });
    } catch (e) {
      results.push({ name: rosterName, ok: false, error: e.message });
    }
  }

  return { date: target, sent: results.filter((r) => r.ok).length, results };
}

// One template variable summarising the current warnings, worded to match
// the status page (same ADVISORY table).
function advisoryLine(advisories) {
  const names = advisories.map((w) => w.name).join(', ');
  const texts = [...new Set(advisories.map((w) => ADVISORY[w.code].text))].join(' ');
  return `${names} is in force. ${texts}`;
}

// Morning-of weather update, on a day that has a duty.
//
// Goes to the WHOLE BOARD, not just that day's team (VHP decision, Aug 2026):
// a warning that moves assembly indoors or changes what to bring affects every
// prefect who might turn up, and the board asks in the group chat anyway.
//
// Sent as the approved prefect_notice template rather than
// prefect_duty_reminder_weather. That template's body reads "You'll be having
// duty at {{gate}} today" — true for the handful rostered, and actively
// misleading for the other thirty-something, who would be told to turn up.
// The rostered prefects already had their gate and time in last night's
// reminder, so nothing is lost by dropping those variables here.
//
// At most once per day, latched on prefect:wx-sent:{date}.
async function sendWeatherUpdate(entry, advisories) {
  if (await kvGet(`prefect:wx-sent:${entry.date}`)) {
    return { sent: 0, note: 'already sent today' };
  }
  const weather = advisoryLine(advisories);
  // Only advisory warnings reach here — a suspending signal takes the VHP
  // approval path instead — so duty really is going ahead.
  const out = await sendNotice({
    text: `Duty is on today, ${formatDayLabel(entry.date)}. ${weather}`,
    audience: 'board',
  });
  if (!out.ok) return { sent: 0, note: out.error, weather };

  await kvSet(`prefect:wx-sent:${entry.date}`, true, DAY);
  return { sent: out.sent, results: out.results, scope: out.scope, weather };
}

// Morning cron (22:00 UTC ≈ 06:00–07:00 HK, always past the 05:30 cutoff
// and before a 7:45 duty):
//   • Suspending signal in force → latch the whole-day suspension and ask
//     the VHP — and ONLY the VHP — whether to notify the board.
//   • Advisory warning in force and duty today → send the weather notice to
//     the whole board (morning weather beats last night's guess).
//   • Clear morning → do nothing at all.
// minutesNow is injectable for tests; real callers use the actual HK clock.
export async function morningCheck({ minutesNow = hkMinutes() } = {}) {
  const active = await fetchActiveWarnings();
  const suspending = active.filter((w) => SUSPEND.has(w.code));
  const today = hkDate();
  const entry = (await readRoster()).find((r) => r.date === today);

  if (suspending.length && minutesNow >= CUTOFF) {
    await writeLatch(today, suspending.map((w) => w.name));
    if (!entry || !entry.names?.length) {
      return { held: false, latched: true, reason: 'no duty scheduled today' };
    }
    if (await getHold(today)) return { held: true, already: true };

    const duty = await dutyFor(today);
    const { out } = coverageOf(duty);
    const onDuty = (duty.names?.length || 0) - out.length;
    const labels = suspendLabels(suspending);

    await setHold(today, { labels, notified: false });
    await notifyVhp(
      `${labels.join(', ')} in force — suspension held\n` +
      'Duty would be cancelled under the rules. Nothing has been sent to the board. ' +
      `Reply CANCEL to notify all ${onDuty} prefects, or ignore this if the school says otherwise.`,
    );
    return { held: true, labels, prefects: onDuty };
  }

  const advisories = active.filter((w) => ADVISORY[w.code]);
  if (advisories.length && entry?.names?.length) {
    const weatherUpdate = await sendWeatherUpdate(entry, advisories);
    return { held: false, weatherUpdate };
  }

  return { held: false, reason: suspending.length ? 'before the 05:30 cutoff' : 'no duty-affecting warning in force' };
}
