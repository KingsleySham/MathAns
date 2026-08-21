// Redis state for the lesson-clash flow.
//
//   clash:recipients      [{ name, phone, relation, notify, userId }] — Kingsley + parents
//   clash:lessons         the tutorial catalogue, [{ code, name, tutor, when }]
//   clash:open            ids of cases still waiting on a rearrangement
//   clash:case:{id}       one clash (60-day TTL — long enough to look back at,
//                         short enough that nothing accumulates forever)
//   clash:draft:{key}     the WhatsApp question-and-answer state, per sender (2h TTL)
//
// Deliberately its own namespace and its own file: the prefect system shares
// the WhatsApp number with this flow and nothing else. Nothing here reads or
// writes a `prefect:*` key, and every read fails soft (null / []) exactly as
// the prefect store does — a Redis outage must never crash the shared webhook
// half-way through someone else's conversation.

import { getRedisClient } from './prefect-redis-client.js';
import { sanitizeCase, sanitizeLessons, sanitizeRecipients } from './clash-flow.js';

const CASE_TTL = 60 * 86400;
const DRAFT_TTL = 2 * 3600;
const MAX_OPEN = 20;

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

// ── configuration (edited on /parents/clash) ────────────────────────────────

// Seeded from the timetable in the approved template sample so the very first
// message can go out before anything has been configured. Editing the
// catalogue on the page replaces this wholesale.
export const DEFAULT_LESSONS = [
  { code: '1', name: 'Japanese', weekday: 2, start: '6pm', end: '7pm' },
  { code: '2', name: 'Piano', weekday: 3, start: '6pm', end: '7pm' },
  { code: '3', name: 'Math', weekday: 4, start: '6:30pm', end: '8pm' },
  { code: '4', name: 'Econ', weekday: 6, start: '11am', end: '12:30pm' },
];

export async function getLessons() {
  const stored = await kvGet('clash:lessons');
  return Array.isArray(stored) && stored.length ? sanitizeLessons(stored) : DEFAULT_LESSONS;
}
export const setLessons = (list) => kvSet('clash:lessons', sanitizeLessons(list));

// No default: phone numbers are personal data and belong in Redis, never in
// the repository. Until the page has been filled in, nothing is sent.
export const getRecipients = async () => sanitizeRecipients((await kvGet('clash:recipients')) || []);
export const setRecipients = (list) => kvSet('clash:recipients', sanitizeRecipients(list));

// ── who is this? ────────────────────────────────────────────────────────────

const digits = (v) => String(v ?? '').replace(/\D/g, '');

// Matches an incoming webhook to one of the three. Learns the business-scoped
// user ID on the way through, the same trick the prefect contacts use, so a
// parent who adopts a WhatsApp username keeps working.
export async function resolveClashSender({ from, fromUserId } = {}) {
  const recipients = await getRecipients();
  const phone = digits(from);
  let person = phone ? recipients.find((r) => r.phone === phone) : null;
  if (!person && fromUserId) person = recipients.find((r) => r.userId === fromUserId) || null;
  if (!person) return null;

  if (fromUserId && person.userId !== fromUserId) {
    person.userId = fromUserId;
    await setRecipients(recipients);
  }
  return {
    person,
    key: person.phone,
    replyTo: from || fromUserId || person.phone,
  };
}

// ── cases ───────────────────────────────────────────────────────────────────

const caseKey = (id) => `clash:case:${id}`;

export const readCase = async (id) => {
  if (!id) return null;
  const raw = await kvGet(caseKey(id));
  return raw ? sanitizeCase(raw) : null;
};

export const writeCase = (c) => kvSet(caseKey(c.id), sanitizeCase(c), CASE_TTL);

// The open list is an index, not the truth — a case that has expired or been
// closed is filtered out on read, so a lost write can only ever show a stale
// entry for as long as it takes to read it.
export const readOpenIds = async () => {
  const ids = await kvGet('clash:open');
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').slice(0, MAX_OPEN) : [];
};

export async function addOpen(id) {
  const ids = await readOpenIds();
  if (ids.includes(id)) return;
  await kvSet('clash:open', [id, ...ids].slice(0, MAX_OPEN));
}

export async function removeOpen(id) {
  const ids = await readOpenIds();
  if (!ids.includes(id)) return;
  await kvSet('clash:open', ids.filter((x) => x !== id));
}

// Every open case, newest first, with dead ids swept out of the index.
export async function readOpenCases() {
  const ids = await readOpenIds();
  const cases = await Promise.all(ids.map(readCase));
  const alive = cases.filter(Boolean);
  if (alive.length !== ids.length) await kvSet('clash:open', alive.map((c) => c.id));
  return alive;
}

export function newCaseId() {
  // Time-ordered and short. Randomness is what stops two cases opened in the
  // same millisecond (web and WhatsApp at once) colliding.
  const rand = Math.random().toString(36).slice(2, 6);
  return `${Date.now().toString(36)}${rand}`;
}

// ── WhatsApp draft (the question-and-answer state) ──────────────────────────
//
// Shape: { step: 'lessons' | 'events', lessons: [...], startedAt }
// Short TTL on purpose — an abandoned half-answered clash should not still be
// waiting for an answer the next day, silently swallowing an unrelated text.

export const getDraft = (key) => kvGet(`clash:draft:${key}`);
export const setDraft = (key, draft) => kvSet(`clash:draft:${key}`, draft, DRAFT_TTL);
export const clearDraft = (key) => kvDel(`clash:draft:${key}`);
