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

// Business-scoped user IDs (Meta's 2026 usernames rollout): a user who
// adopts a WhatsApp username may have no phone number in webhooks — only a
// BSUID like "HK.13491208655302741918" (or "HK.ENT.…"). BSUIDs are
// addressed via the `recipient` field instead of `to`.
export const isBsuid = (v) => /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]+$/.test(String(v ?? ''));

// Low-level: POST a message payload to the Cloud API. Returns the parsed
// JSON response, or throws with the Graph error message on a non-2xx.
// The `to` value may be a phone number or a BSUID — rewritten here so
// callers never need to care which they're holding.
export async function sendMessage(payload) {
  const { token, phoneId } = config();
  const url = `https://graph.facebook.com/${VERSION}/${phoneId}/messages`;
  let body = { messaging_product: 'whatsapp', ...payload };
  if (isBsuid(body.to)) {
    const { to, ...rest } = body;
    body = { ...rest, recipient_type: 'individual', recipient: to };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
//
// bodyParams: a plain object for templates built with NAMED variables
// ({ name: 'Kingsley', gate: 'Front Gate' } -> {{name}}, {{gate}} — keys
// must match the variable names in the approved template exactly), or an
// array for older positional {{1}}/{{2}} templates.
// headerParams: same two shapes, for a template whose HEADER carries a
// variable (the class_clash header is "Possible clash - Kingsley {{day}}").
// Templates with a plain text header pass nothing and are unaffected.
export function sendTemplate({
  to,
  name,
  bodyParams = [],
  headerParams = [],
  buttonPayloads = [],
  lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en',
}) {
  const asParameters = (params) => (Array.isArray(params)
    ? params.map((v) => ({ type: 'text', text: oneLine(v) }))
    : Object.entries(params).map(([param, v]) => ({ type: 'text', parameter_name: param, text: oneLine(v) })));

  const components = [];
  const headerParameters = asParameters(headerParams);
  if (headerParameters.length) {
    components.push({ type: 'header', parameters: headerParameters });
  }
  const parameters = asParameters(bodyParams);
  if (parameters.length) {
    components.push({ type: 'body', parameters });
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

// Interactive reply buttons (up to three). Free-form, so — like sendText —
// only deliverable inside the recipient's open 24h window; every use in this
// project answers a tap or a message, which is what opens that window.
// `buttons` is [{ id, title }]; the id comes back as
// interactive.button_reply.id in the webhook.
export function sendButtons(to, { body, buttons, footer }) {
  return sendMessage({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: String(body).slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
        })),
      },
    },
  });
}

// A single-select list — WhatsApp's only "pick from many" control. Ten rows
// maximum, one section, and the reply arrives as interactive.list_reply.id.
// There is no multi-select in the Cloud API, which is why the lesson picker
// takes one lesson per pass.
export function sendList(to, { body, header, footer, button, rows }) {
  return sendMessage({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(header ? { header: { type: 'text', text: String(header).slice(0, 60) } } : {}),
      body: { text: String(body).slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: {
        button: String(button).slice(0, 20),
        sections: [{
          rows: rows.slice(0, 10).map((r) => ({
            id: String(r.id).slice(0, 200),
            title: String(r.title).slice(0, 24),
            ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
          })),
        }],
      },
    },
  });
}

// Best-effort delivery for system notices (VHP alerts, cancellations): try
// free-form text first; if the Cloud API refuses because the recipient's 24h
// window is closed (error 131047 "re-engagement"), fall back to the approved
// single-variable notice template so the message still lands as a (billable)
// Utility send.
export async function sendTextOrTemplate(to, body, { template } = {}) {
  try {
    return await sendText(to, body);
  } catch (e) {
    if (!/131047|re-engagement/i.test(String(e.message))) throw e;
    return sendTemplate({
      to,
      name: template || process.env.WHATSAPP_NOTICE_TEMPLATE || 'prefect_notice',
      bodyParams: { notice: body },
    });
  }
}
