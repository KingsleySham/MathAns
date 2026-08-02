# Prefect Hub — WhatsApp messaging

The reminder half of [PREFECT_HUB.md](../../PREFECT_HUB.md): evening-before
duty reminders with weather factored in, private absence reporting to the
VHP, two-prefect coverage alerts, a reserve-list cover flow, and the
VHP-approved suspension flow. Meta WhatsApp Cloud API, direct — no BSP.

Plain Vercel serverless functions, same style as the rest of `/api`
(the webhook alone uses the Web `Request`/`Response` signature — signature
verification needs the raw request body).

## Endpoints

| Path | Purpose |
| --- | --- |
| **`https://mathans.app/whatsapp/prefects`** | Meta webhook callback URL (rewritten to `api/whatsapp/webhook.js`) |
| `api/whatsapp/webhook.js` | GET verify handshake + POST handler (buttons, reasons, VHP commands) |
| `api/whatsapp/remind.js` | Cron 12:00 UTC (~20:00 HK) — sends tomorrow's reminders |
| `api/whatsapp/morning.js` | Cron 22:00 UTC (~06:00 HK) — suspension check, asks the VHP only |
| `api/whatsapp/contacts.js` | Admin route — the opt-in contact list (names, numbers, consent) |
| `lib/prefect-messenger.js` | All conversational logic + Redis state |
| `lib/whatsapp.js` | Cloud API send helpers (`sendText`, `sendTemplate`, `sendTextOrTemplate`) |

## The flows

**Prefect** — the evening before a duty, each rostered prefect gets a
template ("Hi Kingsley — you're on front gate duty tomorrow, Mon 22 June at
7:45am.", plus a weather line when a warning is in force) with two
quick-reply buttons:

- **I'll be there** → "Thanks — see you at the gate."
- **I can't make it** → "No problem. What's the reason? Your reply goes to
  the VHP only." The next text from that number is relayed **privately to
  the VHP** ("Angelia is out on Mon 22 June — medical appointment.") and
  acknowledged with "Noted, thanks for letting me know."

**VHP** — quiet by design; only speaks when something needs attention:

- Coverage alert when confirmed replies drop below the two-prefect minimum
  ("Mon 22 June — one prefect short. Only 1 confirmed, minimum is two. …").
  Once everyone has replied and it's still short, the alert offers
  **COVER**.
- `COVER` (optionally `COVER 2026-06-25`) sends the cover-request template
  to opted-in reserves; first to tap accepts the slot ("Marcus can cover
  Thu 25 June. Slot filled — two on duty."). No message when a short slot
  recovers by itself beyond one "minimum met" notice.
- Suspension: when the morning check sees a Red/Black Rainstorm or No. 8+
  after 05:30, it latches the whole-day suspension for the status embed and
  messages **only the VHP**: nothing is sent to the board until the VHP
  replies `CANCEL`. An automated script never tells the board school is off.

## Environment variables (Vercel → Project → Settings)

**Required**

| Var | What it is |
| --- | --- |
| `WHATSAPP_TOKEN` | Cloud API access token (use a permanent System-User token before going live) |
| `PHONE_NUMBER_ID` | The Cloud API **phone number ID** (not the phone number) |
| `WHATSAPP_VERIFY_TOKEN` | Any string you invent; paste the same value into Meta's webhook "Verify token" field |
| `META_APP_SECRET` | The Meta app secret — enables `X-Hub-Signature-256` verification. Unset = unsigned requests accepted (pre-launch only; set it before the pilot) |
| `VHP_PHONE` | The VHP's number, digits only with country code (e.g. `85291234567`) |
| `PREFECT_ADMIN_SECRET` | Admin secret for `/api/whatsapp/contacts` and manual cron runs (shared with the status admin page) |
| `CRON_SECRET` | Any string; Vercel automatically sends it as `Authorization: Bearer …` on cron invocations |
| `REDIS_URL` | Already set for the status endpoint |

**Optional (defaults)**

| Var | Default |
| --- | --- |
| `WHATSAPP_API_VERSION` | `v21.0` |
| `WHATSAPP_TEMPLATE` | `prefect_duty_reminder` |
| `WHATSAPP_TEMPLATE_WEATHER` | `prefect_duty_reminder_weather` |
| `WHATSAPP_COVER_TEMPLATE` | `prefect_cover_request` |
| `WHATSAPP_NOTICE_TEMPLATE` | `prefect_notice` |
| `WHATSAPP_TEMPLATE_LANG` | `en` (must match the language picked in Meta) |
| `PREFECT_MIN_ON_DUTY` | `2` — the coverage minimum (do not lower without asking, per the brief) |

## Message templates (create in Meta → WhatsApp Manager, all **Utility**)

Body parameters may not contain newlines — the send helper collapses
whitespace automatically.

**`prefect_duty_reminder`** — header `Morning duty tomorrow`, body:

```
Hi {{1}} — you're on {{2}} duty tomorrow, {{3}} at {{4}}.
```

Footer: `Prefect badge, no PE uniform. Bags to the General Office.`
Quick-reply buttons, in this order: `I'll be there`, `I can't make it`.
Samples: `Kingsley`, `front gate`, `Mon 22 June`, `7:45am`.

**`prefect_duty_reminder_weather`** — same header/footer/buttons, body:

```
Hi {{1}} — you're on {{2}} duty tomorrow, {{3}} at {{4}}.

{{5}}
```

Sample for `{{5}}`: `Thunderstorm Warning is in force. Assembly moves indoors — bring an umbrella.`

**`prefect_cover_request`** — body:

```
Hi {{1}} — can you cover {{2}} duty on {{3}} at {{4}}? First to accept gets the slot.
```

One quick-reply button: `I can cover it`.

**`prefect_notice`** — the fallback for VHP alerts and cancellations when
the recipient's 24-hour window is closed. Body:

```
{{1}}
```

(Meta may ask for context on a bare-variable body; sample:
`Duty on Thu 25 June is cancelled — Red Rainstorm in force. Do not report for duty.`)

The three general notice templates live in
[`notice-templates.md`](../../notice-templates.md) and are sent by hand, not
by this code.

The webhook reads button payloads (`CONFIRM:2026-06-22`, `DECLINE:…`,
`COVER:…`) set at send time, and falls back to matching the visible label,
so the button text can be reworded in Meta without touching code.

## Webhook setup (Meta dashboard)

1. Deploy, then Meta → your app → **WhatsApp → Configuration → Webhook**:
   - **Callback URL:** `https://mathans.app/whatsapp/prefects`
   - **Verify token:** the value in `WHATSAPP_VERIFY_TOKEN`
2. **Verify and save** (hits the GET handshake), then **subscribe** to the
   `messages` field.

## Contacts and consent

Every recipient must have opted in — consent is stored alongside the number
and anyone with `optIn: false` is skipped by every send path:

```bash
curl -X POST https://mathans.app/api/whatsapp/contacts \
  -H "Content-Type: application/json" -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  -d '{ "contacts": [
    { "name": "Kingsley Sham", "phone": "+85291234567", "role": "prefect", "optIn": true },
    { "name": "Marcus Lee",    "phone": "+85298765432", "role": "reserve", "optIn": true } ] }'
```

`name` must match the name used on the duty roster
(`/prefects/status/update`) — that's how a roster row finds its number.
`role: "reserve"` marks the reserve list the `COVER` command asks.

## Manual runs / testing

```bash
# send (or re-send) reminders for a specific date
curl -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  "https://mathans.app/api/whatsapp/remind?date=2026-06-25"

# run the morning suspension check by hand
curl -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  "https://mathans.app/api/whatsapp/morning"
```

Tier 0 (unverified) allows 250 unique recipients per rolling 24h — the
pilot (three prefects for one week) and the full board of ~40 both fit.
While on the free test number, add each tester's number in Meta first
(OTP-verified, max 5).

## Redis keys

| Key | Contents | TTL |
| --- | --- | --- |
| `prefect:contacts` | opt-in contact list | — |
| `prefect:duty:{date}` | per-day replies, cover state, alert flags | 7 days |
| `prefect:awaiting:{phone}` | duty date an absence reason is pending for | 24 h |
| `prefect:last-short` | date of the most recent short alert (`COVER` target) | 48 h |
| `prefect:hold:{date}` | suspension awaiting the VHP's `CANCEL` | 24 h |
| `prefect:suspended:{date}` | whole-day latch (shared with the status embed) | 24 h |

No student conduct or violation data is stored in any of these — duty
replies and absence reasons concern prefects' own availability only.
