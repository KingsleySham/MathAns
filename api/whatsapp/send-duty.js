// Admin trigger: send the approved duty-reminder template (with the two
// quick-reply buttons) to a list of prefects.
//
//   POST /api/whatsapp/send-duty
//   Header:  x-admin-secret: <PREFECT_ADMIN_SECRET>   (or body.secret)
//   Body:
//   {
//     "date": "2026-06-02",                 // optional fallback for all
//     "templateName": "prefect_duty_reminder", // optional override
//     "lang": "en",                          // optional override
//     "prefects": [
//       { "name": "Alice", "phone": "+85291234567",
//         "date": "2026-06-02", "time": "07:45–08:10",
//         "location": "Rear Gate", "duty": "Morning Duty" }
//     ]
//   }
//
// Guarded by PREFECT_ADMIN_SECRET so a public endpoint can't spend your
// (billable) template sends.

import { sendDutyTemplate } from '../../lib/whatsapp.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.PREFECT_ADMIN_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'PREFECT_ADMIN_SECRET is not set on the server' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const provided = req.headers['x-admin-secret'] || body.secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const prefects = Array.isArray(body.prefects) ? body.prefects : [];
  if (!prefects.length) return res.status(400).json({ error: 'No prefects provided' });

  const { date, templateName, lang } = body;
  const results = [];
  for (const p of prefects) {
    const to = String(p.phone || '').replace(/\D/g, '');
    if (!to) {
      results.push({ phone: p.phone || null, ok: false, error: 'missing/invalid phone' });
      continue;
    }
    try {
      const r = await sendDutyTemplate({
        to,
        name: p.name || '',
        date: p.date || date || '',
        time: p.time || '',
        location: p.location || '',
        duty: p.duty || '',
        templateName,
        lang,
      });
      results.push({ phone: to, ok: true, id: r?.messages?.[0]?.id || null });
    } catch (e) {
      results.push({ phone: to, ok: false, error: e.message });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return res.status(200).json({ sent, total: results.length, results });
}
