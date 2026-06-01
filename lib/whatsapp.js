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
    const detail = data?.error?.message || JSON.stringify(data).slice(0, 300);
    throw new Error(`WhatsApp API ${res.status}: ${detail}`);
  }
  return data;
}

// Plain text reply. Free inside the 24h customer-service window, which is
// exactly where the attend/absent auto-replies and reason capture happen.
export function sendText(to, body) {
  return sendMessage({
    to,
    type: 'text',
    text: { preview_url: false, body },
  });
}

// Business-initiated template message carrying the two quick-reply buttons.
// This is the (billable, Utility) opening message — buttons are baked into
// the approved template, so we only supply the body variables here.
//
// Body variable order must match the approved template:
//   {{1}} name  {{2}} date  {{3}} time  {{4}} location  {{5}} duty
//
// Pass `bodyParams` to override the variable list for a different template.
export function sendDutyTemplate({
  to,
  name,
  date,
  time,
  location,
  duty,
  bodyParams,
  templateName = process.env.WHATSAPP_TEMPLATE || 'prefect_duty_reminder',
  lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en',
}) {
  const params = bodyParams ?? [name, date, time, location, duty];
  const text = (v) => ({ type: 'text', text: String(v ?? '') });
  return sendMessage({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [{ type: 'body', parameters: params.map(text) }],
    },
  });
}
