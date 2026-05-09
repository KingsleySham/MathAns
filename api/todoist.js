const BASE = 'https://api.todoist.com/rest/v2';
const TZ = 'Asia/Hong_Kong';

export default async function handler(req, res) {
  const token = process.env.TODOIST_TOKEN;
  if (!token) return res.status(500).json({ success: false, error: 'Missing TODOIST_TOKEN' });
  if (req.method === 'GET') {
    const r = await fetch(`${BASE}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const sorted = data.map(t => {
      const dueDate = t.due?.datetime || t.due?.date;
      const due = dueDate ? new Date(dueDate) : null;
      const isOverdue = Boolean(due && due < now);
      return { id: t.id, content: t.content, due: t.due || null, priority: t.priority, isOverdue };
    }).sort((a,b)=> (b.isOverdue - a.isOverdue) || ((a.due?.date||'9999').localeCompare(b.due?.date||'9999')) || (b.priority-a.priority)).slice(0,10);
    return res.status(200).json(sorted);
  }
  if (req.method === 'POST') {
    const { taskId } = req.body || {};
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId required' });
    const r = await fetch(`${BASE}/tasks/${taskId}/close`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    return res.status(r.status === 204 ? 200 : 500).json(r.status === 204 ? { success: true } : { success: false, error: 'Todoist close failed' });
  }
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
