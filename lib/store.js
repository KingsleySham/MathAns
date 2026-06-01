// Response storage built on top of the Firestore REST helpers.
//
// One document per prefect phone in the pm_responses collection:
//   { phone, name, status, reason, awaitingReason, date, updatedAt }
//
// status         – 'attend' | 'absent'
// awaitingReason – true after an "absent" tap, so the next free-text message
//                  from that number is captured as the absence reason.

import { getResponse, setResponse } from './firestore.js';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

// Record an attend/absent button tap. Marks awaitingReason when absent so the
// follow-up text can be linked to it.
export async function recordStatus({ phone, name, status }) {
  const prev = (await getResponse(phone).catch(() => null)) || {};
  await setResponse(phone, {
    phone: String(phone),
    name: name || prev.name || '',
    status, // 'attend' | 'absent'
    reason: status === 'absent' ? (prev.reason || '') : '',
    awaitingReason: status === 'absent',
    date: prev.date || today(),
    updatedAt: new Date().toISOString(),
  });
}

// Store a free-text reason, but only if this sender is currently awaiting one
// (i.e. they tapped "absent" first). Returns true if it was stored.
export async function recordReason({ phone, text }) {
  const prev = await getResponse(phone).catch(() => null);
  if (!prev || !prev.awaitingReason) return false;
  await setResponse(phone, {
    ...prev,
    reason: text,
    awaitingReason: false,
    updatedAt: new Date().toISOString(),
  });
  return true;
}
