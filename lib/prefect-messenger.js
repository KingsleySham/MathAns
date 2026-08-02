// Prefect Hub messaging flows (see PREFECT_HUB.md).
//
// Everything conversational lives here — the evening-before reminders, the
// confirm/decline buttons, private absence reasons relayed to the VHP, the
// two-prefect coverage minimum, the reserve-list cover flow, and the
// VHP-approved suspension flow. api/whatsapp/* are thin transport shims
// around these functions.
//
// Hard rules carried over from the brief:
//   • Absence reasons go to the VHP privately, never to a group.
//   • The VHP is alerted when a slot falls below MIN_ON_DUTY (two).
//   • A suspension is never announced to prefects until the VHP replies
//     CANCEL — the morning check only ever messages the VHP.
//   • No student conduct data is stored anywhere here.
//
// Redis keys (all JSON-encoded):
//   prefect:contacts          [{ name, phone, role: 'prefect'|'reserve', optIn }]
//   prefect:roster            [{ date, location, time, names }] — written by
//                             /prefects/status/update, read-only here
//   prefect:duty:{date}       per-day reply state (7-day TTL)
//   prefect:awaiting:{phone}  duty date whose absence reason we're waiting for (24h TTL)
//   prefect:last-short        most recent date the VHP was told is short (48h TTL)
//   prefect:hold:{date}       suspension awaiting the VHP's CANCEL (24h TTL)
//   prefect:suspended:{date}  whole-day latch, same shape api/prefects/status.js writes

import { getRedisClient } from './prefect-redis-client.js';
import { sendText, sendTemplate, sendTextOrTemplate } from './whatsapp.js';
import { SUSPEND, ADVISORY, CUTOFF, formatDayLabel } from './prefect-duty-status-logic.js';

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';

const TPL_REMINDER = () => process.env.WHATSAPP_TEMPLATE || 'prefect_duty_reminder';
const TPL_REMINDER_WEATHER = () => process.env.WHATSAPP_TEMPLATE_WEATHER || 'prefect_duty_reminder_weather';
const TPL_COVER = () => process.env.WHATSAPP_COVER_TEMPLATE || 'prefect_cover_request';

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

// "Front Gate" -> the "front gate duty" phrasing in the reminder template
const dutyPhrase = (entry) => (entry.location || 'morning').toLowerCase();

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
    responses: {},                    // phone -> { name, status: 'in'|'out', reason?, cover? }
    cover: { asked: [], filledBy: null },
    shortAlerted: false,              // first "slot is short" alert sent
    coverOffered: false,              // escalation with the COVER hint sent
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
// first decline that leaves the slot short, and once more with the COVER
// hint when everyone has replied and nobody is left to fill it organically.
async function maybeAlertShort(duty) {
  const { confirmed, out, noReply } = coverageOf(duty);
  const min = MIN_ON_DUTY();
  if (confirmed.length >= min) return;

  const allReplied = !noReply.length;
  const firstAlert = !duty.shortAlerted && (out.length || allReplied);
  const escalation = duty.shortAlerted && !duty.coverOffered && allReplied;
  if (!firstAlert && !escalation) return;

  duty.shortAlerted = true;
  if (allReplied) duty.coverOffered = true;
  await saveDuty(duty);
  await kvSet('prefect:last-short', duty.date, 2 * DAY);

  const shortBy = min - confirmed.length;
  let text = `${formatDayLabel(duty.date)} — ${word(shortBy)} prefect${shortBy === 1 ? '' : 's'} short\n` +
    `Only ${confirmed.length} confirmed, minimum is ${word(min)}. Out: ${out.map((e) => e.name).join(', ') || 'none'}.`;
  if (allReplied) text += ' Reply COVER to ask the reserve list.';
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

// action: 'confirm' | 'decline' | 'cover'; date comes from the button payload
// ("CONFIRM:2026-06-22") or null for label-only fallback matches.
export async function handleButton({ from, profileName, action, date }) {
  const contacts = await getContacts();
  const contact = contacts.find((c) => c.phone === digits(from));
  const name = contact?.name || profileName || 'there';

  if (action === 'cover') return acceptCover({ from, name, date });

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

// First reserve to tap the cover button gets the slot. (Read-modify-write,
// so two accepts in the same second could race; with a six-person reserve
// list the worst case is one polite correction message from the VHP.)
async function acceptCover({ from, name, date }) {
  const phone = digits(from);
  const dutyDate = date || (await kvGet('prefect:last-short'));
  const duty = await dutyFor(dutyDate);
  if (!duty) {
    return safeSendText(from, 'Thanks — nothing needs cover right now.');
  }
  if (duty.cover?.filledBy && duty.cover.filledBy !== phone) {
    return safeSendText(from, `Thanks ${first(name)} — that slot has already been filled.`);
  }

  duty.cover = { ...(duty.cover || { asked: [] }), filledBy: phone };
  duty.responses[phone] = { name, status: 'in', cover: true };
  duty.metNotified = true; // the "slot filled" notice below covers it
  await saveDuty(duty);

  await safeSendText(from, `You're on for ${formatDayLabel(duty.date)} — thanks! Usual time and place.`);
  const { confirmed } = coverageOf(duty);
  await notifyVhp(`${name} can cover ${formatDayLabel(duty.date)}. Slot filled — ${word(confirmed.length)} on duty.`);
}

// ── incoming: VHP commands ──────────────────────────────────────────────────

export async function handleVhpText(text) {
  const t = String(text || '').trim().toUpperCase();
  const explicitDate = (String(text || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null;
  if (t.startsWith('COVER')) return startCover(explicitDate);
  if (t.startsWith('CANCEL')) return approveCancel();
  await safeSendText(vhpPhone(),
    'Commands — COVER: ask the reserve list to fill the most recent short slot ' +
    '(add a date like COVER 2026-06-25 to pick a day). CANCEL: confirm a held suspension and notify the affected prefects.');
}

async function startCover(explicitDate) {
  const vhp = vhpPhone();
  const dutyDate = explicitDate || (await kvGet('prefect:last-short'));
  if (!dutyDate) return safeSendText(vhp, 'Nothing is short right now.');
  const duty = await dutyFor(dutyDate);
  if (!duty) return safeSendText(vhp, `No duty found for ${dutyDate}.`);
  if (duty.cover?.filledBy) return safeSendText(vhp, `The ${formatDayLabel(duty.date)} slot is already filled.`);

  const involved = new Set([...Object.keys(duty.responses || {}), ...(duty.cover?.asked || [])]);
  const reserves = (await getContacts()).filter(
    (c) => c.role === 'reserve' && c.optIn && c.phone && !involved.has(c.phone),
  );
  if (!reserves.length) {
    return safeSendText(vhp, 'No opted-in reserve prefects left to ask — manage the list via /api/whatsapp/contacts.');
  }

  const askedNow = [];
  for (const c of reserves) {
    try {
      await sendTemplate({
        to: c.phone,
        name: TPL_COVER(),
        bodyParams: [first(c.name), dutyPhrase(duty), formatDayLabel(duty.date), duty.time || 'the usual time'],
        buttonPayloads: [`COVER:${duty.date}`],
      });
      askedNow.push(c.phone);
    } catch (e) {
      console.error(`cover request to ${c.name} failed:`, e.message);
    }
  }
  duty.cover = { asked: [...(duty.cover?.asked || []), ...askedNow], filledBy: duty.cover?.filledBy || null };
  await saveDuty(duty);
  await safeSendText(vhp, askedNow.length
    ? `Asked ${askedNow.length} prefect${askedNow.length === 1 ? '' : 's'} on the reserve list. I'll tell you when someone accepts.`
    : 'Could not reach the reserve list — check the logs.');
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
  const filler = duty.cover?.filledBy;
  if (filler && duty.responses?.[filler]) recipients.set(filler, duty.responses[filler].name);

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

// One template variable summarising tonight's weather for tomorrow's duty.
// Advisory wording matches the status page (same ADVISORY table). A failure
// here never blocks the reminder — it just goes out without the weather line.
async function eveningWeatherLine() {
  try {
    const active = await fetchActiveWarnings();
    const suspending = active.filter((w) => SUSPEND.has(w.code));
    if (suspending.length) {
      return `${suspendLabels(suspending).join(', ')} is in force this evening. ` +
        'Duty is cancelled only if a suspending signal is still in force after 5:30am — watch the group for the morning decision.';
    }
    const advisories = active.filter((w) => ADVISORY[w.code]);
    if (!advisories.length) return null;
    const names = advisories.map((w) => w.name).join(', ');
    const texts = [...new Set(advisories.map((w) => ADVISORY[w.code].text))].join(' ');
    return `${names} is in force. ${texts}`;
  } catch {
    return null;
  }
}

// Evening cron (12:00 UTC ≈ 20:00 HK): remind tomorrow's team, weather
// already factored in. Quiet when the roster has nothing tomorrow.
export async function sendReminders({ date } = {}) {
  const target = date || addDays(hkDate(), 1);
  const entry = (await readRoster()).find((r) => r.date === target);
  if (!entry || !entry.names?.length) {
    return { date: target, sent: 0, results: [], note: 'no duty scheduled' };
  }

  const duty = await ensureDuty(entry);
  const contacts = await getContacts();
  const weatherLine = await eveningWeatherLine();

  const results = [];
  for (const rosterName of entry.names) {
    const c = contacts.find((x) => norm(x.name) === norm(rosterName));
    if (!c) { results.push({ name: rosterName, ok: false, error: 'no contact on file' }); continue; }
    if (!c.optIn) { results.push({ name: rosterName, ok: false, error: 'not opted in' }); continue; }
    try {
      await sendTemplate({
        to: c.phone,
        name: weatherLine ? TPL_REMINDER_WEATHER() : TPL_REMINDER(),
        bodyParams: [
          first(c.name),
          dutyPhrase(entry),
          formatDayLabel(entry.date),
          entry.time || '7:45am',
          ...(weatherLine ? [weatherLine] : []),
        ],
        buttonPayloads: [`CONFIRM:${entry.date}`, `DECLINE:${entry.date}`],
      });
      results.push({ name: rosterName, ok: true });
    } catch (e) {
      results.push({ name: rosterName, ok: false, error: e.message });
    }
  }

  return {
    date: target,
    sent: results.filter((r) => r.ok).length,
    results,
    ...(weatherLine ? { weatherLine } : {}),
    dutyState: Boolean(duty),
  };
}

// Morning cron (22:00 UTC ≈ 06:00 HK): if a suspending signal is in force
// after the 05:30 cutoff, latch the whole-day suspension and ask the VHP —
// and only the VHP — whether to notify the board. Never messages prefects.
export async function morningCheck() {
  const active = await fetchActiveWarnings();
  const suspending = active.filter((w) => SUSPEND.has(w.code));
  if (!suspending.length) return { held: false, reason: 'no suspending signal in force' };
  if (hkMinutes() < CUTOFF) return { held: false, reason: 'before the 05:30 cutoff' };

  const today = hkDate();
  await writeLatch(today, suspending.map((w) => w.name));

  const entry = (await readRoster()).find((r) => r.date === today);
  if (!entry || !entry.names?.length) {
    return { held: false, latched: true, reason: 'no duty scheduled today' };
  }
  if (await getHold(today)) return { held: true, already: true };

  const duty = await dutyFor(today);
  const { out } = coverageOf(duty);
  const onDuty = (duty.names?.length || 0) - out.length + (duty.cover?.filledBy ? 1 : 0);
  const labels = suspendLabels(suspending);

  await setHold(today, { labels, notified: false });
  await notifyVhp(
    `${labels.join(', ')} in force — suspension held\n` +
    'Duty would be cancelled under the rules. Nothing has been sent to the board. ' +
    `Reply CANCEL to notify all ${onDuty} prefects, or ignore this if the school says otherwise.`,
  );
  return { held: true, labels, prefects: onDuty };
}
