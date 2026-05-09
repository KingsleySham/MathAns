import ical from 'node-ical';

const TZ = 'Asia/Hong_Kong';
export default async function handler(req, res) {
  const url = process.env.GCAL_ICAL_URL;
  if (!url) return res.status(500).json({ error: 'Missing GCAL_ICAL_URL' });
  const events = await ical.async.fromURL(url);
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const start = new Date(`${day}T00:00:00+08:00`);
  const end = new Date(`${day}T23:59:59+08:00`);
  const out = Object.values(events).filter(e => e.type === 'VEVENT').map(e => {
    const isAllDay = e.datetype === 'date';
    return { id: e.uid || e.id, title: e.summary || '(No title)', start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString(), location: e.location || '', isAllDay };
  }).filter(e => new Date(e.end) >= start && new Date(e.start) <= end).sort((a,b)=>new Date(a.start)-new Date(b.start));
  res.status(200).json(out);
}
