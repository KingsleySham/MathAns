// Consolidated cron/admin routes for the prefect messenger. Public paths are
// unchanged for callers — vercel.json rewrites them here (the Hobby plan
// caps a deployment at 12 serverless functions, same reason api/notes.js is
// consolidated):
//
//   GET  /api/whatsapp/remind    -> ?op=remind    evening-before reminders,
//                                   buttons but no weather (cron 12:00 UTC
//                                   ≈ 20:00 HK; add &date=YYYY-MM-DD for a
//                                   manual run)
//   GET  /api/whatsapp/morning   -> ?op=morning   morning check (cron 22:00
//                                   UTC ≈ 06:00–07:00 HK, always past the
//                                   05:30 cutoff): suspension → latch + ask
//                                   ONLY the VHP; advisory warning → send
//                                   the "today" weather reminder
//   GET/POST /api/whatsapp/contacts -> ?op=contacts  opt-in contact list
//
// Auth: remind/morning accept Vercel's cron header (`Authorization: Bearer
// ${CRON_SECRET}`, attached automatically once CRON_SECRET is set) or
// x-admin-secret for manual runs. contacts is x-admin-secret only — it's
// personal data. Nothing here is public: reminders are billable template
// sends and contacts hold phone numbers.

import {
  sendReminders, morningCheck,
  getContacts, setContacts, sanitizeContacts, MAX_CONTACTS,
} from '../../lib/prefect-messenger.js';

function adminOk(req, body) {
  const admin = process.env.PREFECT_ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'] || body?.secret;
  return Boolean(admin) && provided === admin;
}

function cronOrAdminOk(req) {
  const cron = process.env.CRON_SECRET;
  if (cron && (req.headers['authorization'] || '') === `Bearer ${cron}`) return true;
  return adminOk(req, null);
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const op = url.searchParams.get('op');

  if (op === 'remind' || op === 'morning') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!cronOrAdminOk(req)) return res.status(401).json({ error: 'Unauthorized' });

    try {
      if (op === 'morning') return res.status(200).json(await morningCheck());

      const date = url.searchParams.get('date') || undefined;
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }
      return res.status(200).json(await sendReminders({ date }));
    } catch (e) {
      console.error(`${op} failed:`, e);
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  if (op === 'contacts') {
    let body = {};
    if (req.method === 'POST') {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    if (!process.env.PREFECT_ADMIN_SECRET) {
      return res.status(500).json({ error: 'PREFECT_ADMIN_SECRET is not set on the server' });
    }
    if (!adminOk(req, body)) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') return res.status(200).json({ contacts: await getContacts() });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (Array.isArray(body.contacts) && body.contacts.length > MAX_CONTACTS) {
      return res.status(400).json({ error: `At most ${MAX_CONTACTS} contacts` });
    }
    const contacts = sanitizeContacts(body.contacts);
    const ok = await setContacts(contacts);
    if (!ok) return res.status(502).json({ error: 'Could not save to Redis' });
    return res.status(200).json({ ok: true, contacts });
  }

  return res.status(404).json({ error: 'Unknown op' });
}
