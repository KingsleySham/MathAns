// Morning suspension check (Vercel cron, 22:00 UTC ≈ 06:00 HK — Hobby crons
// fire anywhere within the hour, always after the 05:30 cutoff).
//
// If a suspending signal (Red/Black Rainstorm, No. 8+) is in force, this
// latches the whole-day suspension (same Redis key the status embed reads)
// and messages the VHP — and ONLY the VHP — asking for a CANCEL reply before
// anything is sent to the board. Green mornings do nothing at all.
//
//   GET /api/whatsapp/morning   – cron entry point (same auth as remind)

import { morningCheck } from '../../lib/prefect-messenger.js';
import { authorized } from './remind.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const out = await morningCheck();
    return res.status(200).json(out);
  } catch (e) {
    console.error('morning check failed:', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
