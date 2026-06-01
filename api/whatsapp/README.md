# WhatsApp Prefect-Duty Reminder

Cloud API backend for the **Prefect Messenger** app (`/9jgCSHsfKTTOHU6D`).
Sends each prefect a "duty tomorrow" template with **Attend / Absent** quick-reply
buttons, auto-replies to the tap, and captures a free-text absence reason.

Built as plain Vercel serverless functions (same style as the rest of `/api`).

## Files

| Path | Purpose |
| --- | --- |
| `api/whatsapp/webhook.js` | GET verify handshake + POST handler (buttons, text, auto-replies) |
| `api/whatsapp/send-duty.js` | Admin route — sends the template to a list of prefects |
| `lib/whatsapp.js` | Cloud API send helper (`sendText`, `sendDutyTemplate`) |
| `lib/firestore.js` | Dependency-free Firestore REST read/write |
| `lib/store.js` | Response logging (`recordStatus`, `recordReason`) |
| `scripts/send-duty.mjs` | CLI alternative to the admin route |

## Environment variables (set in Vercel → Project → Settings → Environment Variables)

**Required**

| Var | What it is |
| --- | --- |
| `WHATSAPP_TOKEN` | Cloud API access token (Bearer). Use the temporary token while testing; create a permanent System-User token before going live. |
| `PHONE_NUMBER_ID` | The Cloud API **Phone number ID** (not the phone number itself). |
| `WHATSAPP_VERIFY_TOKEN` | Any string you invent; paste the same value into Meta's webhook "Verify token" field. |
| `PREFECT_ADMIN_SECRET` | Any string you invent; required to call `/api/whatsapp/send-duty`. |

**Optional (sensible defaults)**

| Var | Default |
| --- | --- |
| `WHATSAPP_API_VERSION` | `v21.0` |
| `WHATSAPP_TEMPLATE` | `prefect_duty_reminder` |
| `WHATSAPP_TEMPLATE_LANG` | `en` (match the language you pick in Meta — e.g. `en_US`) |
| `FIREBASE_PROJECT_ID` | `mathans-prefect` |
| `FIREBASE_API_KEY` | the app's public web key |
| `FIREBASE_RESPONSES_COLLECTION` | `pm_responses` |

## The message template (create this in the Meta dashboard)

Meta → WhatsApp Manager → **Message templates → Create template**

- **Category:** Utility
- **Name:** `prefect_duty_reminder` (must match `WHATSAPP_TEMPLATE`)
- **Language:** English (`en`) — must match `WHATSAPP_TEMPLATE_LANG`
- **Body** (5 variables, in this order):

  ```
  Hello {{1}}, you are on prefect duty tomorrow ({{2}}) from {{3}}.
  Location: {{4}}
  Duty: {{5}}

  Please confirm below.
  ```

  Sample values for review: `Alice`, `Mon 2 Jun`, `07:45–08:10`, `Rear Gate`, `Morning Duty`
- **Buttons → Quick reply** (add two):
  - `Attend`
  - `Absent`

> The button **labels** can be anything containing "attend"/"absent" — the
> webhook matches on substring, so `Attend` / `I'll be absent` both work.

## Webhook setup (Meta dashboard)

1. Deploy this branch to Vercel.
2. Meta → your app → **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL:** `https://<your-domain>/api/whatsapp/webhook`
   - **Verify token:** the value you set in `WHATSAPP_VERIFY_TOKEN`
3. Click **Verify and save** (this hits the GET handshake).
4. **Subscribe** to the `messages` field.

## Firestore rules

The webhook writes responses unauthenticated (same model the PWA already uses),
so allow the responses collection in the **`mathans-prefect`** project's rules:

```
match /pm_responses/{phone} {
  allow read, write: if true;
}
```

(Tighten later if you add server-side auth / a service account.)

## Sending duty reminders

**Via the admin route**

```bash
curl -X POST https://<your-domain>/api/whatsapp/send-duty \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  -d '{
    "date": "2026-06-02",
    "prefects": [
      { "name": "Alice", "phone": "+85291234567",
        "time": "07:45–08:10", "location": "Rear Gate", "duty": "Morning Duty" }
    ]
  }'
```

**Via the CLI**

```bash
WHATSAPP_TOKEN=... PHONE_NUMBER_ID=... \
  node scripts/send-duty.mjs scripts/prefects.example.json 2026-06-02
```

## Testing on the free test number

1. In Meta, add up to 5 recipient numbers (each OTP-verified) under the test number.
2. Set the env vars in Vercel (use the temporary token + the test `PHONE_NUMBER_ID`).
3. Verify the webhook (step above).
4. Send yourself a reminder, tap **Attend** / **Absent**, and watch the auto-reply.
   For **Absent**, send a follow-up text — it's stored as the reason in
   `pm_responses/<your-number>`.

## Notes / possible follow-ups

- The opening message **must** be a template (business-initiated). Buttons baked
  into the template come back as `messages[].button` webhooks; the webhook also
  handles `interactive.button_reply` in case you send buttons inside the 24h window.
- Replies inside the 24h window (auto-replies + reason capture) are free; only the
  opening template is billable (Utility).
- The auto-reply greets the prefect by their **WhatsApp profile name**. Wiring it to
  the roster's display name, and adding a "Send via Cloud API" button + a responses
  view inside the PWA, are easy next steps (kept out for now to avoid exposing the
  admin secret client-side).
