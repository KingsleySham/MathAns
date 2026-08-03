// Consolidated personal-dashboard proxies. Public paths are unchanged for
// callers — vercel.json rewrites them here (the Hobby plan caps a
// deployment at 12 serverless functions, same reason api/notes.js and
// api/whatsapp/tasks.js are consolidated; this merge freed the slot the
// flights tracker now uses):
//
//   GET      /api/calendar -> ?op=calendar   today's events from the
//                             GCAL_ICAL_URL private iCal feed
//   GET/POST /api/todoist  -> ?op=todoist    top tasks / close a task
//
// The handlers themselves moved verbatim to lib/dashboard/ — behaviour,
// env vars and response shapes are identical.

import calendarHandler from '../lib/dashboard/calendar.js';
import todoistHandler from '../lib/dashboard/todoist.js';

export default async function handler(req, res) {
  const op = req.query?.op;
  if (op === 'calendar') return calendarHandler(req, res);
  if (op === 'todoist') return todoistHandler(req, res);
  return res.status(404).json({ error: 'unknown op' });
}
