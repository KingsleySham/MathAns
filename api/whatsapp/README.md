# Prefect Hub — WhatsApp messaging

The reminder half of [PREFECT_HUB.md](../../PREFECT_HUB.md): evening-before
duty reminders, a morning-of weather update, private absence reporting to
the VHP, two-prefect coverage alerts, and the VHP-approved suspension
flow. Meta WhatsApp Cloud API, direct — no BSP.

Plain Vercel serverless functions, same style as the rest of `/api`
(the webhook alone uses the Web `Request`/`Response` signature — signature
verification needs the raw request body).

**Setting this up for the first time?** Follow the step-by-step guide:
[ONBOARDING.md](ONBOARDING.md), or the interactive checklist version at
[mathans.app/prefects/setup](https://www.mathans.app/prefects/setup).

## Endpoints

| Path | Purpose |
| --- | --- |
| **`https://www.mathans.app/whatsapp/prefects`** | Meta webhook callback URL (rewritten to `api/whatsapp/webhook.js`) |
| `api/whatsapp/webhook.js` | GET verify handshake + POST handler (buttons, reasons, VHP commands) |
| `api/whatsapp/tasks.js` | One function, three rewritten routes (Hobby caps deployments at 12 functions): `/api/whatsapp/remind` — cron 12:00 UTC (~20:00 HK), tomorrow's reminders; `/api/whatsapp/morning` — cron 22:00 UTC (~06:00 HK), suspension check (asks the VHP only) + morning weather update; `/api/whatsapp/contacts` — admin route for the opt-in contact list; plus admin-page ops `?op=replies` (who confirmed/declined + suspension state), `?op=notice` (one-off notice to board or a day's team), `?op=cancel` (approve a held suspension) |
| `lib/prefect-messenger.js` | All conversational logic + Redis state |
| `lib/whatsapp.js` | Cloud API send helpers (`sendText`, `sendTemplate`, `sendTextOrTemplate`) |

## The flows

**Prefect** — the evening before a duty (~20:00 HK), each rostered prefect
gets the reminder template with two quick-reply buttons:

- **I'll be there** → "Thanks — see you at the gate."
- **I can't make it** → "No problem. What's the reason? Your reply goes to
  the VHP only." The next text from that number is relayed **privately to
  the VHP** ("Angelia is out on Mon 22 June — medical appointment.") and
  acknowledged with "Noted, thanks for letting me know."

Any other text to the bot — from a prefect or a stranger — gets an
automated redirect: this line isn't read, contact the enquiries number
instead. Sent at most once per sender per day.

The evening reminder is deliberately weather-free — an evening forecast is
stale by morning. Instead, the morning cron (06:00–07:00 HK) sends the
**"today" weather variant** (no buttons) when a warning is actually in
force, to today's team minus anyone who declined. Clear mornings send
nothing.

**VHP** — gets a WhatsApp ping for **every reply** (their request), as a
one-liner with a running tally: "Kingsley confirmed for Mon 22 June
(2 in · 0 out · 1 waiting)." The coverage alerts below carry the same news,
so a reply that triggers one doesn't also send the generic ping. Beyond
that:

- Coverage alert when confirmed replies drop below the two-prefect minimum
  ("Mon 22 June — one prefect short. Only 1 confirmed, minimum is two. …").
  Once everyone has replied and it's still short, one follow-up alert says
  so — cover is then arranged in the group chat.
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
| `WHATSAPP_NOTICE_TEMPLATE` | `prefect_notice` |
| `WHATSAPP_TEMPLATE_LANG` | `en` (must match the language picked in Meta) |
| `PREFECT_MIN_ON_DUTY` | `2` — the coverage minimum (do not lower without asking, per the brief) |
| `PREFECT_ENQUIRY_PHONE` | `+852 9257 7822` — the number the free-text auto-reply points enquiries to |

## Message templates (create in Meta → WhatsApp Manager, all **Utility**)

All three use Meta's **named variables** ("Type of variable: Name" in the
builder) — the code sends `parameter_name` values, so the variable names
below (`name`, `gate`, `time`, `day`, `weather`, `notice`) must match the
approved templates exactly. Wording around them can be adjusted freely
(each edit goes back through review). Values are collapsed to one line by
the send helper. The code fills: `name` = the contact's first name,
`gate` = the roster row's location (e.g. `Front Gate`), `time` = the
roster row's time, `day` = e.g. `Mon 22 June`.

**`prefect_duty_reminder`** — header `Prefect Duty Reminder`, body:

```
Hello {{name}},
You'll be having duty at *{{gate}} tomorrow* 👋
Details are as follows:
⏰ Time: {{time}}
🗓 Date: {{day}}
Thank you for your kind attention 🙏
```

Footer: `Please be punctual and refer to the Notion for updates.`
Quick-reply buttons, in this order: `I'll be there`, `I can't make it`.

**`prefect_duty_reminder_weather`** — same header/footer, **no buttons**
(it's a morning-of update, sent by the morning cron only when a warning is
in force — hence "today"):

```
Hello {{name}},
You'll be having duty at *{{gate}} today* 👋
Details are as follows:
⏰ Time: {{time}}
🗓 Date: {{day}}

⚠️ Weather Alert:
{{weather}}

Thank you and stay safe 🙏
```

Sample for `{{weather}}`: `Thunderstorm Warning is in force. Assembly moves indoors — bring an umbrella.`

**`prefect_notice`** — the fallback for VHP alerts and cancellations when
the recipient's 24-hour window is closed. Footer `Prefect Team`, body:

```
⚠️ *{{notice}}*

Thank you for your kind attention.
```

(Sample for `{{notice}}`:
`Duty on Thu 25 June is cancelled — Red Rainstorm in force. Do not report for duty.`)

The three general notice templates live in
[`notice-templates.md`](../../notice-templates.md) and are sent by hand, not
by this code.

The webhook reads button payloads (`CONFIRM:2026-06-22`, `DECLINE:…`) set
at send time, and falls back to matching the visible label, so the button
text can be reworded in Meta without touching code.

## Usernames & BSUIDs (Meta's 2026 rollout)

WhatsApp is rolling out usernames: a prefect who adopts one may have **no
phone number in webhooks** — only a business-scoped user ID (BSUID, e.g.
`HK.13491208655302741918`). The system is ready for this:

- Whenever a webhook carries both a phone number and a BSUID, the BSUID is
  learned onto the matching contact (stored as `userId`, preserved
  invisibly by the contacts editor). Phone-less webhooks then resolve
  through it, and replies are addressed to the BSUID via the API's
  `recipient` field.
- The VHP's BSUID is learned the same way (`prefect:vhp-bsuid`), so the
  CANCEL/command channel survives the VHP adopting a username.
- Duty state stays keyed by phone number whenever the contact is known, so
  a prefect's reply history never splits across identifiers.
- Outbound reminders still target stored phone numbers, which remain fully
  supported. The main residual risk is a prefect who adopts a username
  **before** the system has ever seen them message in — their first
  phone-less webhook won't match a contact and is ignored. Fix: have every
  prefect tap any button or text the bot once, which banks their BSUID.

## Webhook setup (Meta dashboard)

1. Deploy, then Meta → your app → **WhatsApp → Configuration → Webhook**:
   - **Callback URL:** `https://www.mathans.app/whatsapp/prefects`
   - **Verify token:** the value in `WHATSAPP_VERIFY_TOKEN`
2. **Verify and save** (hits the GET handshake), then **subscribe** to the
   `messages` field.

## Contacts and consent

Every recipient must have opted in — consent is stored alongside the number
and anyone with `optIn: false` is skipped by every send path. Easiest way
to manage the list is the contacts editor on
[`/prefects/status/update`](https://www.mathans.app/prefects/status/update);
the equivalent curl:

```bash
curl -X POST https://www.mathans.app/api/whatsapp/contacts \
  -H "Content-Type: application/json" -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  -d '{ "contacts": [
    { "name": "Kingsley Sham", "phone": "+85291234567", "role": "prefect", "optIn": true },
    { "name": "Marcus Lee",    "phone": "+85298765432", "role": "reserve", "optIn": true } ] }'
```

`name` must match the name used on the duty roster
(`/prefects/status/update`) — that's how a roster row finds its number.
(`role` is stored but currently unused — the reserve-list cover flow was
dropped; cover is arranged in the group chat.)

## The admin page

Everything above is also driveable from
[`/prefects/status/update`](https://www.mathans.app/prefects/status/update)
(same admin passcode): a **contacts editor** (add/remove prefects, opt-in
ticks — the UI version of the curl below), a live **duty replies** view (tally + per-prefect
status, including private absence reasons), a **send a notice** box (whole
board or one day's team, always delivered via the `prefect_notice`
template — Utility-category content only), **resend
reminders** for any date, **run the weather check now**, and the **send
cancellation** button, which is the same VHP approval as texting CANCEL and
only works while a suspension is held.

## Manual runs / testing

```bash
# send (or re-send) reminders for a specific date
curl -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  "https://www.mathans.app/api/whatsapp/remind?date=2026-06-25"

# run the morning suspension check by hand
curl -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  "https://www.mathans.app/api/whatsapp/morning"
```

Tier 0 (unverified) allows 250 unique recipients per rolling 24h — the
pilot (three prefects for one week) and the full board of ~40 both fit.
While on the free test number, add each tester's number in Meta first
(OTP-verified, max 5).

## Redis keys

| Key | Contents | TTL |
| --- | --- | --- |
| `prefect:contacts` | opt-in contact list | — |
| `prefect:duty:{date}` | per-day replies and alert flags | 7 days |
| `prefect:awaiting:{phone}` | duty date an absence reason is pending for | 24 h |
| `prefect:wx-sent:{date}` | morning weather update already sent | 24 h |
| `prefect:hold:{date}` | suspension awaiting the VHP's `CANCEL` | 24 h |
| `prefect:suspended:{date}` | whole-day latch (shared with the status embed) | 24 h |

No student conduct or violation data is stored in any of these — duty
replies and absence reasons concern prefects' own availability only.
