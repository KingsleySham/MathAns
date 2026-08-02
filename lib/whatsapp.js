// Thin wrapper around the WhatsApp Cloud API /messages endpoint.
//
// Reads its credentials from the environment (set these in Vercel):
//   WHATSAPP_TOKEN   – the permanent/temporary access token (Bearer)
//   PHONE_NUMBER_ID  – the Cloud API phone number ID (NOT the phone number)
//   WHATSAPP_API_VERSION (optional) – defaults to v21.0
//
// Uses the global fetch available on Vercel's Node runtime (same as
// the other functions in /api).

const VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

function config() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error('Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID environment variable');
  }
  return { token, phoneId };
}

// Low-level: POST a message payload to the Cloud API. Returns the parsed
// JSON response, or throws with the Graph error message on a non-2xx.
export async function sendMessage(payload) {
  const { token, phoneId } = config();
  const url = `https://graph.facebook.com/${VERSION}/${phoneId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code ? ` (code ${data.error.code})` : '';
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300);
    throw new Error(`WhatsApp API ${res.status}${code}: ${detail}`);
  }
  return data;
}

// Plain text message. Free, but only deliverable inside the 24h window the
// recipient opens by messaging us or tapping a button.
export function sendText(to, body) {
  return sendMessage({
    to,
    type: 'text',
    text: { preview_url: false, body },
  });
}

// Meta rejects template parameters containing newlines or tab characters.
const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// Business-initiated send of an approved template. Button labels are baked
// into the approved template; `buttonPayloads` sets the developer payload
// that comes back in the webhook when each quick-reply button is tapped
// (index order must match the template's button order).
export function sendTemplate({
  to,
  name,
  bodyParams = [],
  buttonPayloads = [],
  lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en',
}) {
  const components = [];
  if (bodyParams.length) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((v) => ({ type: 'text', text: oneLine(v) })),
    });
  }
  buttonPayloads.forEach((payload, index) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload }],
    });
  });
  return sendMessage({
    to,
    type: 'template',
    template: {
      name,
      language: { code: lang },
      ...(components.length ? { components } : {}),
    },
  });
}

// Best-effort delivery for system notices (VHP alerts, cancellations): try
// free-form text first; if the Cloud API refuses because the recipient's 24h
// window is closed (error 131047 "re-engagement"), fall back to the approved
// single-variable notice template so the message still lands as a (billable)
// Utility send.
export async function sendTextOrTemplate(to, body) {
  try {
    return await sendText(to, body);
  } catch (e) {
    if (!/131047|re-engagement/i.test(String(e.message))) throw e;
    return sendTemplate({
      to,
      name: process.env.WHATSAPP_NOTICE_TEMPLATE || 'prefect_notice',
      bodyParams: [body],
    });
  }
}
