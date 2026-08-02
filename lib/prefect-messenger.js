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
//   prefect:duty:{date}       per-day reply state (7-day TTL)
//   prefect:awaiting:{phone}  duty date whose absence reason we're waiting for (24h TTL)
//   prefect:wx-sent:{date}    morning weather update already sent (24h TTL)
//   prefect:hold:{date}       suspension awaiting the VHP's CANCEL (24h TTL)
//   prefect:suspended:{date}  whole-day latch, same shape api/prefects/status.js writes

import { getRedisClient } from './prefect-redis-client.js';
import { sendText, sendTemplate, sendTextOrTemplate } from './whatsapp.js';
import { SUSPEND, ADVISORY, CUTOFF, formatDayLabel } from './prefect-duty-status-logic.js';

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';

const TPL_REMINDER = () => process.env.WHATSAPP_TEMPLATE || 'prefect_duty_reminder';
const TPL_REMINDER_WEATHER = () => process.env.WHATSAPP_TEMPLATE_WEATHER || 'prefect_duty_reminder_weather';

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
export const isVhp = (from) => {
  const v = vhpPhone();
  return Boolean(v) && digits(from) === v;
};

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

// The "slot is short" alerts. Triggered by declines (and by the last
// outstanding reply arriving), never by silence alone — an evening of no
// replies yet isn't an emergency. Speaks at most twice per day: once on the
// first decline that leaves the slot short, and once more when everyone has
// replied and it's still short (cover is arranged in the group chat).
async function maybeAlertShort(duty) {
  const { confirmed, out, noReply } = coverageOf(duty);
  const min = MIN_ON_DUTY();
  if (confirmed.length >= min) return;

  const allReplied = !noReply.length;
  const firstAlert = !duty.shortAlerted && (out.length || allReplied);
  const escalation = duty.shortAlerted && !duty.escalated && allReplied;
  if (!firstAlert && !escalation) return;

  duty.shortAlerted = true;
  if (allReplied) duty.escalated = true;
  await saveDuty(duty);

  const shortBy = min - confirmed.length;
  let text = `${formatDayLabel(duty.date)} — ${word(shortBy)} prefect${shortBy === 1 ? '' : 's'} short\n` +
    `Only ${confirmed.length} confirmed, minimum is ${word(min)}. Out: ${out.map((e) => e.name).join(', ') || 'none'}.`;
  if (allReplied) text += ' Everyone has replied — arrange cover in the group.';
  else text += ` No reply yet: ${noReply.join(', ')}.`;
  await notifyVhp(text);
}

// The quiet counterpart: only speaks when a previously-alerted slot recovers.
async function maybeNotifyMet(duty, confirmerName) {
  const { confirmed } = coverageOf(duty);
  const min = MIN_ON_DUTY();
  if (!duty.shortAlerted || duty.metNotified || confirmed.length < min) return;
  duty.metNotified = true;
  await saveDuty(duty);
  await notifyVhp(`${confirmerName} confirmed. ${cap(word(confirmed.length))} on duty ${relativeDay(duty.date)} — minimum met.`);
}

// ── incoming: prefect buttons and texts ─────────────────────────────────────

// action: 'confirm' | 'decline'; date comes from the button payload
// ("CONFIRM:2026-06-22") or null for label-only fallback matches.
export async function handleButton({ from, profileName, action, date }) {
  const contacts = await getContacts();
  const contact = contacts.find((c) => c.phone === digits(from));
  const name = contact?.name || profileName || 'there';

  const dutyDate = date || (await guessDutyDate());
  const duty = await dutyFor(dutyDate);
  if (!duty) {
    return safeSendText(from, "Thanks — I couldn't find a duty for that day. Please check with the VHP.");
  }

  if (action === 'confirm') {
    duty.responses[digits(from)] = { name, status: 'in' };
    await saveDuty(duty);
    await clearAwaiting(digits(from));
    await safeSendText(from, 'Thanks — see you at the gate.');
    await maybeNotifyMet(duty, name);
    return;
  }

  // decline
  duty.responses[digits(from)] = { name, status: 'out' };
  await saveDuty(duty);
  await setAwaiting(digits(from), duty.date);
  await safeSendText(from, "No problem. What's the reason? Your reply goes to the VHP only.");
  await maybeAlertShort(duty);
}

// Free text from a prefect only matters as an absence reason we asked for;
// anything else stays unanswered — the group chat is for conversation.
export async function handlePrefectText({ from, profileName, text }) {
  const phone = digits(from);
  const awaiting = await getAwaiting(phone);
  if (!awaiting) return;

  const contacts = await getContacts();
  const name = contacts.find((c) => c.phone === phone)?.name || profileName || 'A prefect';
  const reason = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');

  await clearAwaiting(phone);
  const duty = await dutyFor(awaiting);
  if (duty) {
    duty.responses[phone] = { ...(duty.responses[phone] || {}), name, status: 'out', reason };
    await saveDuty(duty);
  }

  await safeSendText(from, 'Noted, thanks for letting me know.');
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

// The CANCEL reply to a held suspension. This is the only path that ever
// tells prefects duty is off, and it always requires this human step first.
async function approveCancel() {
  const vhp = vhpPhone();
  const today = hkDate();
  const hold = await getHold(today);
  if (!hold) return safeSendText(vhp, "There's no suspension waiting for approval today.");
  if (hold.notified) return safeSendText(vhp, 'Already sent — the board has been notified.');

  const duty = await dutyFor(today);
  if (!duty) return safeSendText(vhp, 'No duty is scheduled today — nothing to cancel.');

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
  const entry = (await readRoster()).find((r) => r.date === target);
  if (!entry || !entry.names?.length) {
    return { date: target, sent: 0, results: [], note: 'no duty scheduled' };
  }

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

// Morning-of weather update: the "today" weather template (no buttons),
// sent to today's team minus anyone who declined, at most once per day.
async function sendWeatherUpdate(entry, advisories) {
  if (await kvGet(`prefect:wx-sent:${entry.date}`)) {
    return { sent: 0, note: 'already sent today' };
  }
  const duty = await dutyFor(entry.date);
  const contacts = await getContacts();
  const weather = advisoryLine(advisories);

  const results = [];
  for (const rosterName of entry.names) {
    const c = contacts.find((x) => norm(x.name) === norm(rosterName));
    if (!c || !c.optIn) { results.push({ name: rosterName, ok: false, error: c ? 'not opted in' : 'no contact on file' }); continue; }
    if (duty?.responses?.[c.phone]?.status === 'out') { results.push({ name: rosterName, ok: false, error: 'declined this duty' }); continue; }
    try {
      await sendTemplate({
        to: c.phone,
        name: TPL_REMINDER_WEATHER(),
        bodyParams: { ...templateParams(entry, c.name), weather },
      });
      results.push({ name: rosterName, ok: true });
    } catch (e) {
      results.push({ name: rosterName, ok: false, error: e.message });
    }
  }
  await kvSet(`prefect:wx-sent:${entry.date}`, true, DAY);
  return { sent: results.filter((r) => r.ok).length, results, weather };
}

// Morning cron (22:00 UTC ≈ 06:00–07:00 HK, always past the 05:30 cutoff
// and before a 7:45 duty):
//   • Suspending signal in force → latch the whole-day suspension and ask
//     the VHP — and ONLY the VHP — whether to notify the board.
//   • Advisory warning in force and duty today → send the "today" weather
//     reminder to the team (morning weather beats last night's guess).
//   • Clear morning → do nothing at all.
export async function morningCheck() {
  const active = await fetchActiveWarnings();
  const suspending = active.filter((w) => SUSPEND.has(w.code));
  const today = hkDate();
  const entry = (await readRoster()).find((r) => r.date === today);

  if (suspending.length && hkMinutes() >= CUTOFF) {
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
