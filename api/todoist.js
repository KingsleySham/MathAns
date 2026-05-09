const SYNC = 'https://api.todoist.com/sync/v9/sync';
const TZ = 'Asia/Hong_Kong';
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

async function syncPost(token, body) {
  const r = await fetch(SYNC, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw Object.assign(new Error(`Todoist ${r.status}: ${text.slice(0, 200)}`), { status: r.status });
  }
  return r.json();
}

export default async function handler(req, res) {
  const token = process.env.TODOIST_TOKEN;
  if (!token) return res.status(500).json({ success: false, error: 'Missing TODOIST_TOKEN' });

  try {
    if (req.method === 'GET') {
      const data = await syncPost(token, { sync_token: '*', resource_types: '["items"]' });
      if (!Array.isArray(data.items))
        return res.status(502).json({ success: false, error: 'Unexpected Todoist response' });

      const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
      const sorted = data.items
        .filter(t => !t.checked && !t.is_deleted)
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
      const cmdUuid = uid();
      const data = await syncPost(token, {
        commands: JSON.stringify([{ type: 'item_close', uuid: cmdUuid, args: { id: taskId } }])
      });
      const ok = data.sync_status?.[cmdUuid] === 'ok';
      return res.status(ok ? 200 : 500).json(ok ? { success: true } : { success: false, error: 'Close failed' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, error: e.message });
  }
}
