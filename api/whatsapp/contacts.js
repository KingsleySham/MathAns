// Opt-in contact list for the prefect messenger (names + numbers + consent).
//
//   GET  /api/whatsapp/contacts   – read the list
//   POST /api/whatsapp/contacts   – replace the list
//     { "contacts": [ { "name": "Kingsley Sham", "phone": "+85291234567",
//                       "role": "prefect" | "reserve", "optIn": true } ] }
//
// Both admin-only (x-admin-secret) — this is personal data. The brief's rule
// is enforced at the source: sanitizeContacts stores optIn explicitly and the
// send paths skip anyone whose optIn is not true. Contact names must match
// the roster names used on /prefects/status/update, or reminders can't find
// the number. No student conduct data lives here or anywhere else.

import { getContacts, setContacts, sanitizeContacts, MAX_CONTACTS } from '../../lib/prefect-messenger.js';

export default async function handler(req, res) {
  const secret = process.env.PREFECT_ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'PREFECT_ADMIN_SECRET is not set on the server' });

  let body = {};
  if (req.method === 'POST') {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const provided = req.headers['x-admin-secret'] || body.secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    return res.status(200).json({ contacts: await getContacts() });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contacts = sanitizeContacts(body.contacts);
  if (Array.isArray(body.contacts) && body.contacts.length > MAX_CONTACTS) {
    return res.status(400).json({ error: `At most ${MAX_CONTACTS} contacts` });
  }
  const ok = await setContacts(contacts);
  if (!ok) return res.status(502).json({ error: 'Could not save to Redis' });
  return res.status(200).json({ ok: true, contacts });
}
