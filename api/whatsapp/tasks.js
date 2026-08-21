// Consolidated cron/admin routes for the prefect messenger. Public paths are
// unchanged for callers — vercel.json rewrites them here (the Hobby plan
// caps a deployment at 12 serverless functions, same reason api/notes.js is
// consolidated):
//
//   GET  /api/whatsapp/remind    -> ?op=remind    evening-before reminders,
//                                   buttons but no weather (cron 12:00 UTC
//                                   ≈ 20:00 HK; add &date=YYYY-MM-DD for a
//                                   manual run)
//   GET  /api/whatsapp/morning   -> ?op=morning   morning check (cron 22:00
//                                   UTC ≈ 06:00–07:00 HK, always past the
//                                   05:30 cutoff): suspension → latch + ask
//                                   ONLY the VHP; advisory warning → send
//                                   the "today" weather reminder
//   GET/POST /api/whatsapp/contacts -> ?op=contacts  opt-in contact list
//
// Admin-page ops (called directly as /api/whatsapp/tasks?op=..., used by
// /prefects/status/update — all x-admin-secret only):
//   GET  ?op=replies&date=YYYY-MM-DD  who confirmed/declined/hasn't replied
//                                     + today's suspension state
//   POST ?op=notice   {text, audience: 'board'|'duty', date?}  one-off notice
//   POST ?op=cancel   approve a held suspension (same as texting CANCEL)
//
// Auth: remind/morning accept Vercel's cron header (`Authorization: Bearer
// ${CRON_SECRET}`, attached automatically once CRON_SECRET is set) or
// x-admin-secret for manual runs. contacts is x-admin-secret only — it's
// personal data. Nothing here is public: reminders are billable template
// sends and contacts hold phone numbers.

import {
  sendReminders, morningCheck,
  getContacts, setContacts, sanitizeContacts, MAX_CONTACTS,
  sendNotice, getReplies, approveCancel, sendIntro,
  getHandbookStatus, startHandbookRound,
} from '../../lib/prefect-messenger.js';
import {
  readRoster, readSettings, writeSettings, purgeEndedDuties, syncWithNotion,
} from '../../lib/prefect-roster-store.js';
import { describeDatabase } from '../../lib/prefect-notion.js';
import { sanitizeNotionConfig } from '../../lib/prefect-duty-status-logic.js';
import { getClashState, openClash, planClash, resolveLessons } from '../../lib/clash-messenger.js';
import { readCase, removeOpen, setLessons, setRecipients, writeCase } from '../../lib/clash-store.js';
import { parseEvents, sanitizeEvents } from '../../lib/clash-flow.js';

const hkDate = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// Roster housekeeping, both hung off the two existing crons.
//
// The Hobby plan allows exactly two cron jobs and both are already spoken for,
// so rather than add a third these piggyback on remind (20:00 HK) and morning
// (06:00 HK). Neither costs much on a quiet day: one Redis read, one Notion query.
//
// Both are deliberately best-effort and swallow their own errors — a clean-up or
// sync problem must never stop the reminders going out.

// Two-way Notion sync. Runs BEFORE the purge, so a row pulled in from Notion
// that has already ended is cleaned up in the same run rather than lingering a
// day. Silent when the sync is switched off.
async function syncNotionQuietly(op) {
  try {
    const { notion } = await readSettings();
    if (!notion?.enabled) return;
    const out = await syncWithNotion(hkDate());
    if (out.ok) console.log(`${op}: notion sync — ${out.pulled} in, ${out.pushed} out, ${out.archived} archived`);
    else console.error(`${op}: notion sync failed:`, out.error);
  } catch (e) {
    console.error('notion sync failed:', e);
  }
}

// Automatic clean-up of ended duty days.
async function purgeQuietly(op) {
  try {
    const [roster, settings] = await Promise.all([readRoster(), readSettings()]);
    const { removed } = await purgeEndedDuties(roster, settings, hkDate());
    if (removed) console.log(`${op}: purged ${removed} ended duty day(s) from the roster`);
  } catch (e) {
    console.error('roster purge failed:', e);
  }
}

function adminOk(req, body) {
  const admin = process.env.PREFECT_ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'] || body?.secret;
  return Boolean(admin) && provided === admin;
}

// The clash page is Kingsley's, not the prefect board's. It takes its own
// secret so the two systems can be locked separately, and falls back to the
// prefect one only so the page works before CLASH_ADMIN_SECRET is set.
function clashAdminOk(req, body) {
  const admin = process.env.CLASH_ADMIN_SECRET || process.env.PREFECT_ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'] || body?.secret;
  return Boolean(admin) && provided === admin;
}

function cronOrAdminOk(req) {
  const cron = process.env.CRON_SECRET;
  if (cron && (req.headers['authorization'] || '') === `Bearer ${cron}`) return true;
  return adminOk(req, null);
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const op = url.searchParams.get('op');

  if (op === 'remind' || op === 'morning') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!cronOrAdminOk(req)) return res.status(401).json({ error: 'Unauthorized' });

    try {
      // Neither throws — a sync or clean-up problem must not cost the board its
      // reminders. Both run first so the send works off a synced, pruned roster.
      await syncNotionQuietly(op);
      await purgeQuietly(op);

      if (op === 'morning') return res.status(200).json(await morningCheck());

      const date = url.searchParams.get('date') || undefined;
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }
      return res.status(200).json(await sendReminders({ date }));
    } catch (e) {
      console.error(`${op} failed:`, e);
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  if (op === 'contacts') {
    let body = {};
    if (req.method === 'POST') {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    if (!process.env.PREFECT_ADMIN_SECRET) {
      return res.status(500).json({ error: 'PREFECT_ADMIN_SECRET is not set on the server' });
    }
    if (!adminOk(req, body)) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') return res.status(200).json({ contacts: await getContacts() });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (Array.isArray(body.contacts) && body.contacts.length > MAX_CONTACTS) {
      return res.status(400).json({ error: `At most ${MAX_CONTACTS} contacts` });
    }
    const contacts = sanitizeContacts(body.contacts);
    const ok = await setContacts(contacts);
    if (!ok) return res.status(502).json({ error: 'Could not save to Redis' });
    return res.status(200).json({ ok: true, contacts });
  }

  // Notion sync, admin-only. Folded in here rather than given its own file
  // because the deployment already sits on the Hobby cap of 12 serverless
  // functions — the same reason replies/notice/cancel/intro live here.
  if (op === 'notion-props' || op === 'notion-sync' || op === 'notion-config') {
    let body = {};
    if (req.method === 'POST') {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    if (!adminOk(req, body)) return res.status(401).json({ error: 'Unauthorized' });

    try {
      if (op === 'notion-config') {
        // The config never rides on the public status endpoint, so the update
        // page reads and writes it here.
        if (req.method === 'GET') return res.status(200).json({ notion: (await readSettings()).notion });
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const settings = await readSettings();
        // lastSync belongs to the sync, not the admin — keep the stored one.
        const notion = sanitizeNotionConfig({ ...body.notion, lastSync: settings.notion.lastSync });
        const ok = await writeSettings({ ...settings, notion });
        if (!ok) return res.status(502).json({ error: 'Could not save to Redis' });
        return res.status(200).json({ ok: true, notion });
      }

      if (op === 'notion-props') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        // Read the id from the query so the admin can test one before saving it.
        const id = url.searchParams.get('database') || (await readSettings()).notion.databaseId;
        if (!id) return res.status(400).json({ error: 'No Notion database ID given or saved' });
        return res.status(200).json(await describeDatabase(id));
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const out = await syncWithNotion(hkDate());
      return res.status(out.ok ? 200 : 400).json(out);
    } catch (e) {
      console.error(`${op} failed:`, e);
      return res.status(502).json({ error: String(e.message || e) });
    }
  }

  // Handbook read-check, admin-only. Same function for the same reason as the
  // Notion ops above: the deployment sits on the Hobby cap of 12.
  if (op === 'handbook' || op === 'handbook-start') {
    let body = {};
    if (req.method === 'POST') {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    if (!adminOk(req, body)) return res.status(401).json({ error: 'Unauthorized' });

    try {
      if (op === 'handbook') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return res.status(200).json(await getHandbookStatus());
      }
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const out = await startHandbookRound(body);
      return res.status(out.ok ? 200 : 400).json(out);
    } catch (e) {
      console.error(`${op} failed:`, e);
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  if (op === 'replies' || op === 'notice' || op === 'cancel' || op === 'intro') {
    let body = {};
    if (req.method === 'POST') {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    if (!adminOk(req, body)) return res.status(401).json({ error: 'Unauthorized' });

    try {
      if (op === 'replies') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const date = url.searchParams.get('date') || undefined;
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
        }
        return res.status(200).json(await getReplies(date));
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      if (op === 'intro') {
        const out = await sendIntro(body);
        return res.status(out.ok ? 200 : 400).json(out);
      }
      if (op === 'notice') {
        if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
          return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
        }
        const out = await sendNotice(body);
        return res.status(out.ok ? 200 : 400).json(out);
      }
      // op === 'cancel'
      const out = await approveCancel({ viaWeb: true });
      return res.status(out.ok ? 200 : 409).json(out);
    } catch (e) {
      console.error(`${op} failed:`, e);
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  // Lesson-clash ops, for /parents/clash. Folded in here for the same reason
  // as everything above — the deployment sits on the Hobby cap of 12
  // serverless functions — but they are otherwise unrelated to the prefect
  // system: separate lib, separate Redis namespace, separate secret.
  if (op && op.startsWith('clash-')) {
    let body = {};
    if (req.method === 'POST') {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }
    if (!clashAdminOk(req, body)) return res.status(401).json({ error: 'Unauthorized' });

    try {
      if (op === 'clash-state') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return res.status(200).json(await getClashState());
      }
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      if (op === 'clash-config') {
        const saved = await Promise.all([
          Array.isArray(body.lessons) ? setLessons(body.lessons) : true,
          Array.isArray(body.recipients) ? setRecipients(body.recipients) : true,
        ]);
        if (saved.some((ok) => !ok)) return res.status(502).json({ error: 'Could not save to Redis' });
        return res.status(200).json(await getClashState());
      }

      if (op === 'clash-detect') {
        // What would happen if this were sent: which lessons the event runs
        // over and where each can be made up. Sends nothing.
        const out = await planClash({
          events: Array.isArray(body.events) ? body.events : [],
          codes: Array.isArray(body.codes) ? body.codes.map(String) : null,
          makeups: Array.isArray(body.makeups) ? body.makeups : null,
        });
        return res.status(out.ok || out.none ? 200 : 400).json(out);
      }

      if (op === 'clash-open') {
        const out = await openClash({
          // Ticked lessons and edited slots override the detection; without
          // them the event alone decides.
          codes: Array.isArray(body.codes) ? body.codes.map(String) : null,
          makeups: Array.isArray(body.makeups) ? body.makeups : null,
          // The page posts structured events; a typed-in blob (or a curl) is
          // parsed the same way a WhatsApp reply would be.
          events: Array.isArray(body.events) ? sanitizeEvents(body.events) : parseEvents(String(body.events || '')),
          day: body.day,
          note: body.note,
          via: 'web',
        });
        return res.status(out.ok ? 200 : 400).json(out);
      }

      if (op === 'clash-resolve') {
        // One lesson or several — the page ticks boxes, so it usually sends
        // several, and either way it is one message to the family.
        const codes = Array.isArray(body.codes) ? body.codes.map(String) : [String(body.code || '')];
        const out = await resolveLessons({ caseId: body.caseId, codes, by: body.by });
        return res.status(out.ok ? 200 : 400).json(out);
      }

      if (op === 'clash-close') {
        // The escape hatch for a case opened by mistake: it stops being
        // outstanding without telling anyone it was arranged.
        const caseRec = await readCase(body.caseId);
        if (!caseRec) return res.status(404).json({ error: 'No such clash' });
        caseRec.closedAt = new Date().toISOString();
        await writeCase(caseRec);
        await removeOpen(caseRec.id);
        return res.status(200).json({ ok: true });
      }
    } catch (e) {
      console.error(`${op} failed:`, e);
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  return res.status(404).json({ error: 'Unknown op' });
}
