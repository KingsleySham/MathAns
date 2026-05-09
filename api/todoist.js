const BASE = 'https://api.todoist.com/api/v1';
const TZ = 'Asia/Hong_Kong';

export default async function handler(req, res) {
  const token = process.env.TODOIST_TOKEN;
  if (!token) return res.status(500).json({ success: false, error: 'Missing TODOIST_TOKEN' });

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${BASE}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return res.status(r.status).json({ success: false, error: `Todoist ${r.status}: ${text.slice(0, 200)}` });
      }
      const data = await r.json();
      const items = Array.isArray(data) ? data : (data.results ?? data.items ?? []);
      if (!items.length && !Array.isArray(data) && !data.results && !data.items) {
        return res.status(502).json({ success: false, error: 'Unexpected Todoist response shape' });
      }

      const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
      const sorted = items
        .map(t => {
          const dueDate = t.due?.datetime || t.due?.date;
          const due = dueDate ? new Date(dueDate) : null;
          const isOverdue = Boolean(due && due < now);
          return { id: t.id, content: t.content, due: t.due || null, priority: t.priority, isOverdue };
        })
        .sort((a, b) =>
          (b.isOverdue - a.isOverdue) ||
          ((a.due?.date || '9999').localeCompare(b.due?.date || '9999')) ||
          (b.priority - a.priority)
        )
        .slice(0, 10);
      return res.status(200).json(sorted);
    }

    if (req.method === 'POST') {
      const { taskId } = req.body || {};
      if (!taskId) return res.status(400).json({ success: false, error: 'taskId required' });
      const r = await fetch(`${BASE}/tasks/${taskId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.status === 204 || r.ok) return res.status(200).json({ success: true });
      const text = await r.text().catch(() => '');
      return res.status(500).json({ success: false, error: `Todoist ${r.status}: ${text.slice(0, 200)}` });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
