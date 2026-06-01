// WhatsApp Cloud API webhook.
//
//   GET  /api/whatsapp/webhook  – verification handshake (Meta dashboard)
//   POST /api/whatsapp/webhook  – incoming messages & button replies
//
// Flow:
//   • "attend" button  -> reply "Thank you {name}, see you there!"
//   • "absent" button  -> reply "Please reply with your reason for absence."
//   • plain text after an "absent" tap -> stored as the absence reason
//
// Responses are logged to Firestore (pm_responses) best-effort; a storage
// failure never blocks the user-facing reply.

import { sendText } from '../../lib/whatsapp.js';
import { recordStatus, recordReason } from '../../lib/store.js';

export default async function handler(req, res) {
  // ── GET: verification handshake ─────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge ?? '');
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // Parse body (Vercel usually gives us an object for application/json).
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  // Always ack quickly so Meta doesn't retry; guard all work in try/catch.
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (msg) {
      const from = msg.from; // sender wa_id (E.164 without '+')
      const profileName = value?.contacts?.[0]?.profile?.name || '';
      const action = readButton(msg);

      if (action === 'attend') {
        const name = profileName.split(' ')[0] || 'there';
        await sendText(from, `Thank you ${name}, see you there!`);
        await recordStatus({ phone: from, name: profileName, status: 'attend' })
          .catch((e) => console.error('store attend failed:', e.message));
      } else if (action === 'absent') {
        await sendText(from, 'Please reply with your reason for absence.');
        await recordStatus({ phone: from, name: profileName, status: 'absent' })
          .catch((e) => console.error('store absent failed:', e.message));
      } else if (msg.type === 'text') {
        const text = (msg.text?.body || '').trim();
        const stored = await recordReason({ phone: from, text })
          .catch((e) => { console.error('store reason failed:', e.message); return false; });
        if (stored) await sendText(from, 'Thank you — your reason has been recorded.');
      }
    }
  } catch (e) {
    console.error('webhook error:', e);
  }

  return res.status(200).json({ received: true });
}

// Normalise the two button shapes WhatsApp can deliver into 'attend' | 'absent'.
//   • template quick-reply  -> msg.button.payload / msg.button.text
//   • interactive button     -> msg.interactive.button_reply.id / .title
// Matching on substring keeps it robust whether the button is keyed by id
// ("attend"/"absent") or by visible label ("Attend"/"Absent").
function readButton(msg) {
  const raw = (
    msg.button?.payload ||
    msg.button?.text ||
    msg.interactive?.button_reply?.id ||
    msg.interactive?.button_reply?.title ||
    ''
  ).toLowerCase();
  if (!raw) return null;
  if (raw.includes('attend')) return 'attend';
  if (raw.includes('absent')) return 'absent';
  return null;
}
