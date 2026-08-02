// Evening-before duty reminders (Vercel cron, 12:00 UTC ≈ 20:00 HK — Hobby
// crons fire anywhere within the hour, so expect ~20:00–21:00).
//
//   GET  /api/whatsapp/remind             – cron entry point
//   GET  /api/whatsapp/remind?date=YYYY-MM-DD – manual run for a specific day
//
// Auth: the cron's `Authorization: Bearer ${CRON_SECRET}` header (Vercel adds
// it automatically once CRON_SECRET is set), or x-admin-secret for manual
// runs. Never public — reminders are billable template sends.

import { sendReminders } from '../../lib/prefect-messenger.js';

export function authorized(req) {
  const cron = process.env.CRON_SECRET;
  const admin = process.env.PREFECT_ADMIN_SECRET;
  const auth = req.headers['authorization'] || '';
  if (cron && auth === `Bearer ${cron}`) return true;
  if (admin && req.headers['x-admin-secret'] === admin) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const date = url.searchParams.get('date') || undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  try {
    const out = await sendReminders({ date });
    return res.status(200).json(out);
  } catch (e) {
    console.error('remind failed:', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
