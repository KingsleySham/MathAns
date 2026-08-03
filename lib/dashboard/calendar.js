import ical from 'node-ical';

const TZ = 'Asia/Hong_Kong';

export default async function handler(req, res) {
  const url = process.env.GCAL_ICAL_URL;
  if (!url) return res.status(500).json({ error: 'Missing GCAL_ICAL_URL' });

  if (!url.includes('calendar.google.com') && !url.includes('.ics')) {
    return res.status(500).json({ error: 'GCAL_ICAL_URL does not look like a Google Calendar iCal link. It should contain calendar.google.com and end with .ics' });
  }

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
    const msg = e.message || '';
    if (msg.includes('404')) {
      return res.status(500).json({ error: 'iCal URL returned 404. The Google Calendar private link may be wrong or revoked. Go to Google Calendar → Settings → [your calendar] → "Secret address in iCal format" and copy the URL again.' });
    }
    return res.status(500).json({ error: `Calendar fetch failed: ${msg}` });
  }
}
