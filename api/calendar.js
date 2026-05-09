import ical from 'node-ical';

const TZ = 'Asia/Hong_Kong';

export default async function handler(req, res) {
  const url = process.env.GCAL_ICAL_URL;
  if (!url) return res.status(500).json({ error: 'Missing GCAL_ICAL_URL' });

  try {
    const events = await ical.async.fromURL(url);
    const now = new Date();
    const day   = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
    const start = new Date(`${day}T00:00:00+08:00`);
    const end   = new Date(`${day}T23:59:59+08:00`);

    const out = Object.values(events)
      .filter(e => e.type === 'VEVENT')
      .map(e => {
        try {
          const s = new Date(e.start);
          const f = new Date(e.end);
          if (isNaN(s) || isNaN(f)) return null;
          return {
            id: e.uid || e.id || '',
            title: e.summary || '(No title)',
            start: s.toISOString(),
            end: f.toISOString(),
            location: e.location || '',
            isAllDay: e.datetype === 'date'
          };
        } catch (_) { return null; }
      })
      .filter(e => e && new Date(e.end) >= start && new Date(e.start) <= end)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: `Calendar fetch failed: ${e.message}` });
  }
}
