// Minimal, dependency-free Firestore access over the REST API.
//
// Matches the trust model the Prefect Messenger PWA already uses: the public
// Firebase web API key + unauthenticated requests. That means your security
// rules must allow read/write on the responses collection (see README).
//
//   FIREBASE_PROJECT_ID            – defaults to mathans-prefect
//   FIREBASE_API_KEY               – defaults to the public web key
//   FIREBASE_RESPONSES_COLLECTION  – defaults to pm_responses

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'mathans-prefect';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyB-r4lwsxzhfXW8EP5xd9zER0TBl0J5Kvw';
const COLLECTION = process.env.FIREBASE_RESPONSES_COLLECTION || 'pm_responses';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Encode a flat JS object into Firestore's typed-value field map.
function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number') {
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    } else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

// Decode a Firestore typed-value field map back into a flat JS object.
function fromFields(fields = {}) {
  const out = {};
  for (const [k, val] of Object.entries(fields)) {
    const type = Object.keys(val)[0];
    let v = val[type];
    if (type === 'integerValue') v = Number(v);
    else if (type === 'doubleValue') v = Number(v);
    else if (type === 'nullValue') v = null;
    out[k] = v;
  }
  return out;
}

// Phone numbers double as document IDs — strip everything but digits so the
// id is path-safe and consistent with WhatsApp's wa_id (E.164 sans '+').
const docId = (phone) => String(phone).replace(/\D/g, '');

// Fetch a single response doc, or null if it doesn't exist yet.
export async function getResponse(phone) {
  const res = await fetch(`${BASE}/${COLLECTION}/${docId(phone)}?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return fromFields(data.fields);
}

// Upsert a response doc. PATCH without an updateMask replaces the whole
// document, so always pass the complete object you want stored.
export async function setResponse(phone, obj) {
  const res = await fetch(`${BASE}/${COLLECTION}/${docId(phone)}?key=${API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
