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

**The number is shared.** Kingsley's family lesson-clash bot runs on the same
WhatsApp number — separate library, separate `clash:*` Redis keys, separate
admin secret, and it hands every message it does not own straight back to the
flows below. See [CLASH.md](CLASH.md), whose "Sharing the number" table is the
contract between the two.

## Endpoints

| Path | Purpose |
| --- | --- |
| **`https://www.mathans.app/whatsapp/prefects`** | Meta webhook callback URL (rewritten to `api/whatsapp/webhook.js`) |
| `api/whatsapp/webhook.js` | GET verify handshake + POST handler (buttons, reasons, VHP commands) |
| `api/whatsapp/tasks.js` | One function, three rewritten routes (Hobby caps deployments at 12 functions): `/api/whatsapp/remind` — cron 12:00 UTC (~20:00 HK), tomorrow's reminders; `/api/whatsapp/morning` — cron 22:00 UTC (~06:00 HK), suspension check (asks the VHP only) + morning weather update; `/api/whatsapp/contacts` — admin route for the opt-in contact list; plus admin-page ops `?op=replies` (who confirmed/declined + suspension state), `?op=notice` (one-off notice to board or a day's team), `?op=cancel` (approve a held suspension), `?op=intro` (welcome template to not-yet-introduced contacts), and the Notion sync ops `?op=notion-config` (read/write the mapping), `?op=notion-props` (list the database's columns), `?op=notion-sync` (run a sync now) |
| `lib/prefect-messenger.js` | All conversational logic + Redis state |
| `lib/whatsapp.js` | Cloud API send helpers (`sendText`, `sendTemplate`, `sendTextOrTemplate`) |
| `lib/prefect-notion.js` | Notion REST client (API version pinned to `2022-06-28`) |
| `lib/prefect-notion-sync.js` | Pure mapping + the reconcile rules, unit-tested without Redis or network |
| `lib/clash-messenger.js` | Not the prefect system — the family lesson-clash flow sharing this number ([CLASH.md](CLASH.md)) |

## Handbook read-check

At the start of a change, after the intro template, the VHP starts a *round*
from the WhatsApp tab of `/prefects/status/update`. Every opted-in prefect gets a
`prefect_notice` pointing at the handbook; the page carries a 6-digit code
(`/prefects/handbook`, meant to be embedded in the Notion handbook itself) which
they send back here to confirm.

- The code rotates every 10 minutes — HMAC-SHA256 over a clock counter, i.e.
  TOTP without the library (`lib/prefect-handbook.js`). The **previous** window
  still verifies so a slow app-switch is not punished; **future** windows never
  do.
- **It is an attendance code, not authentication.** The Notion embed has no
  login, so every prefect sees the same code and the first to open it can paste
  it in the group chat. The rotation stops a code circulating days later, which
  is the realistic failure. Starting a round rotates the secret, killing every
  code shown before it.
- A bare six-digit message is what distinguishes a code from an absence reason
  (which is prose), and it is only claimed while a round is open. Confirming does
  not consume a pending absence-reason question.
- `prefect:handbook-secret` is made on first use, so there is no extra env var.
  `prefect:handbook` holds `{ round, confirmed }` and is cleared per round.

## Notion roster sync

Two-way, last-write-wins per duty day, between `prefect:roster` and a Notion
database. Runs on the two crons above (the Hobby plan's cron slots were already
spent, so it piggybacks rather than adding a third) and on the **Sync now**
button on `/prefects/status/update`.

Three fields cross the boundary, and only three:

| Notion | Roster | Direction |
| --- | --- | --- |
| `Date` (datetime) | `date` **and** `time` — `7:45am` becomes `T07:45:00+08:00` | both ways |
| `Status` | `status` | both ways |
| `Name` (title) | generated `9/9 Prefect Duty` | write-only, rewritten every sync |

`location`, `team` and `names` have no columns in the database, so they are
**hub-only**. A Notion win therefore merges the three synced fields into the
existing entry rather than replacing it — replacing would wipe the names the
duty reminders match against — and `entryDiffers` compares only the synced
fields, so editing a location never queues a pointless Notion write.

`Cancelled` is the one status the rest of the system acts on: the day stays on
the roster and the calendar, but no duty reminder and no morning weather goes
out for it. `Tentative` and `Special` behave as normal duties.

Two more things are easy to break and worth knowing before touching it:

- **Only days in `[today, today + 70]` are ever touched, on either side.** The
  roster's automatic clean-up deletes ended duty days. Without that window those
  deletions would propagate into Notion and destroy the VHP's history, and the
  past rows that survived there would be re-imported on the next run only to be
  purged again.
- **`prefect:notion-seen` is what makes a hub-side deletion stick.** When a duty
  day is deleted in the editor it is already gone from `prefect:roster` by the
  time a sync runs, so the row still sitting in Notion looks exactly like a new
  one and would be added straight back. That key holds the page ids linked at the
  end of the last run. If it is ever lost, the sync deliberately does nothing
  destructive — linked days with no record are left alone rather than deleted.

Setup: create an internal integration at notion.so/my-integrations, set its token
as `NOTION_TOKEN`, share the database with it (••• → Connections), then use
**Detect properties** on the Settings tab to map the columns. The mapping is
stored, not hardcoded, so a renamed column needs a re-detect rather than a deploy.

The database id and column names are **not** returned by the public
`/api/prefects/status`, only `enabled` and the last-run summary.

## The flows

**Prefect** — the evening before a duty (~20:00 HK), each rostered prefect
gets the reminder template with two quick-reply buttons:

- **I'll be there** → "Thanks — see you at the gate."
- **I can't make it** → "No problem. What's the reason? Your reply goes to
  the VHP only." The next text from that number is relayed **privately to
  the VHP** ("Angelia is out on Mon 22 June — medical appointment.") and
  acknowledged with "Noted, thanks for letting me know."

Any other text to the bot — from a prefect or a stranger — gets an
automated redirect: "This is a no-reply number. For direct enquiries,
please contact Kingsley via +852 9257 7822. / Thank you for your kind
attention." Sent at most once per sender per day.

The evening reminder is deliberately weather-free — an evening forecast is
stale by morning. Instead, the morning cron (06:00–07:00 HK) sends the
**`prefect_duty_reminder_weather` template to every opted-in contact** when
a warning is actually in force on a day that has a duty. Clear mornings
send nothing, and so do days with no duty on the roster.

It goes to all opted-in contacts rather than just that day's roster names
(VHP decision, Aug 2026): the contact list *is* the morning duty group (see
the scale note in `PREFECT_HUB.md`), so a warning that moves assembly
indoors concerns all of them. Anyone rostered who declined gets it too.

`{{gate}}`, `{{time}}` and `{{day}}` come from the day's roster entry and
are therefore the same for everyone; only `{{name}}` is per-recipient. That
is fine while the contact list stays the duty group. If the hub is ever
opened up to prefects who do not do morning duty, revisit the wording —
"You'll be having duty at {{gate}} today" would then be telling the wrong
people to turn up.

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
| `WHATSAPP_INTRO_TEMPLATE` | `prefect_intro` |
| `PREFECT_VHP_NAME` | `Kingsley` — fills `{{vhp}}` in the intro |
| `NOTION_TOKEN` | internal integration token for the roster sync — no default; the sync is simply off without it |

## Message templates (create in Meta → WhatsApp Manager, all **Utility**)

All four use Meta's **named variables** ("Type of variable: Name" in the
builder) — the code sends `parameter_name` values, so the variable names
below (`name`, `gate`, `time`, `day`, `weather`, `notice`, `vhp`,
`start`, `end`) must match the
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
in force — hence "today"). Since Aug 2026 it goes to every opted-in
contact, which is the morning duty group, so the second-person wording
still holds:

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

**`prefect_intro`** — the one-off welcome, sent from the contacts editor's
"Send intro" button to each new opted-in contact. No buttons. Body (the
code fills `name` = first name, `vhp` = `PREFECT_VHP_NAME`, and
`start`/`end` = the **duty period dates** typed on the admin page, e.g.
`16/9` and `30/10`, remembered between sends):

```
Goood Morningggg!
Hello {{name}} 👋
I'm {{vhp}}, your vice-head prefect.

☀️ Morning duty starts from {{start}} to {{end}}
☎️ Prefect reminders and notices will issue via this number.
❌ DO NOT reply unless prompted.
✅ WhatsApp me via +852 92577822
❤️ Remember to answer the reminders sent :)

Thank you for your kind attention.
Do not reply to this message, text via +852 92577822.
```

Samples: `Angelia`, `Kingsley`, `16/9`, `30/10`.

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
