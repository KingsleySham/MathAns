// WhatsApp Cloud API webhook — the Meta callback URL is
// https://mathans.app/whatsapp/prefects (rewritten here by vercel.json).
//
//   GET   – verification handshake (Meta dashboard "Verify and save")
//   POST  – incoming messages: reminder buttons, absence reasons, VHP commands
//
// Uses the Web Request/Response handler signature (unlike the rest of /api)
// because X-Hub-Signature-256 must be computed over the RAW request body —
// the (req, res) helpers parse JSON before we could hash the exact bytes.
//
// All conversational logic lives in lib/prefect-messenger.js; this file only
// verifies, parses, and routes.

import crypto from 'node:crypto';
import { isVhp, handleButton, handlePrefectText, handleVhpText } from '../../lib/prefect-messenger.js';

export async function GET(request) {
  const url = new URL(request.url, 'http://localhost');
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request) {
  const raw = await request.text();

  // Reject anything Meta didn't sign. META_APP_SECRET unset = pre-launch
  // grace mode (accept unsigned) so the flow can be tested before the app
  // secret is configured; set it before the pilot.
  const secret = process.env.META_APP_SECRET;
  if (secret && !validSignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return new Response('Invalid signature', { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = {};
  }

  // Ack fast regardless of outcome so Meta doesn't retry-storm the endpoint.
  try {
    await route(body);
  } catch (e) {
    console.error('webhook error:', e);
  }
  return Response.json({ received: true });
}

function validSignature(raw, header, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const got = String(header || '');
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function route(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return; // delivery/read status callbacks — nothing to do

  const from = msg.from; // sender wa_id (E.164 without '+')
  const profileName = value?.contacts?.[0]?.profile?.name || '';

  const button = readButton(msg);
  if (button) return handleButton({ from, profileName, ...button });

  if (msg.type === 'text') {
    const text = (msg.text?.body || '').trim();
    if (isVhp(from)) return handleVhpText(text);
    return handlePrefectText({ from, profileName, text });
  }
}

// Normalise the two button shapes WhatsApp can deliver.
//   • template quick-reply -> msg.button.payload / msg.button.text
//   • interactive button   -> msg.interactive.button_reply.id / .title
// Payloads are set at send time as "CONFIRM:YYYY-MM-DD" etc.; the label
// fallback keeps taps working if a template was ever sent without payloads.
function readButton(msg) {
  const payload = msg.button?.payload || msg.interactive?.button_reply?.id || '';
  const m = /^(CONFIRM|DECLINE):(\d{4}-\d{2}-\d{2})$/.exec(payload);
  if (m) return { action: m[1].toLowerCase(), date: m[2] };

  const label = (payload || msg.button?.text || msg.interactive?.button_reply?.title || '').toLowerCase();
  if (!label) return null;
  if (/there|attend|confirm|yes/.test(label)) return { action: 'confirm', date: null };
  if (/can.?t|cannot|absent|decline/.test(label)) return { action: 'decline', date: null };
  return null;
}
