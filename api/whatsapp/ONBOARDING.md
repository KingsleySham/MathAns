# Prefect Hub WhatsApp — onboarding, step by step

> **This guide lives on the site too:**
> [mathans.app/prefects/setup](https://www.mathans.app/prefects/setup) — same
> phases as an interactive checklist (ticks persist per device). This file
> is the repo copy; keep the two in sync when steps change.

Follow this top to bottom. Each phase ends with a check you can actually
run; don't move on until it passes. Reference material (template bodies,
env var meanings, Redis keys) lives in [README.md](README.md) — this file
is the order to do things in.

Rough calendar: phases 1–4 are an afternoon. Phase 5 (template approval)
is usually hours but can take a day. Phase 6 (collecting opt-ins) takes as
long as forty people take to reply — start it early, it runs in parallel.

---

## Phase 0 — what you already have

- [ ] The MathAns Vercel project, deploying `main` to mathans.app
- [ ] `REDIS_URL` already set (the status endpoint uses it)
- [ ] `PREFECT_ADMIN_SECRET` already set (the status update page uses it)
- [ ] The duty roster maintained at `/prefects/status/update`
- [ ] This branch merged and deployed — **crons and rewrites only take
      effect on the production deployment**, so nothing below works from a
      preview URL except the API routes themselves

## Phase 1 — Meta accounts and the app

You need three nested things: a personal Facebook account → a Meta
Business portfolio → a developer app with WhatsApp attached.

1. [ ] Sign in at [developers.facebook.com](https://developers.facebook.com)
       with your Facebook account and register as a developer if asked.
2. [ ] **Create App** → use case "Other" → type **Business**. Name it
       something like `Prefect Hub`. If it asks for a Business portfolio,
       create one (this is the "Meta Business Account" — no company
       registration or verification needed at our scale).
3. [ ] On the app dashboard, find **WhatsApp** and click **Set up**. This
       gives you a **test number** for free.
4. [ ] Open **WhatsApp → API Setup** and copy two values somewhere safe:
       - **Phone number ID** (a long number — this is `PHONE_NUMBER_ID`,
         *not* the phone number itself)
       - the **temporary access token** (lasts ~24h; fine for today,
         replaced in Phase 7)
5. [ ] Still in API Setup, add your own number under **To** (it sends you
       an OTP). The test number can message at most **5 verified numbers**
       — enough for you + the pilot trio + one spare. Add the VHP number
       here too if that isn't you.

**Check:** use the "Send message" button in API Setup to send yourself the
hello_world template. It should arrive on your phone.

## Phase 2 — environment variables in Vercel

Vercel → MathAns project → **Settings → Environment Variables**, scope
**Production** (add to Preview too if you want to test from previews).

| Add | Value |
| --- | --- |
| `WHATSAPP_TOKEN` | the temporary token from Phase 1 (swapped in Phase 7) |
| `PHONE_NUMBER_ID` | from Phase 1 |
| `WHATSAPP_VERIFY_TOKEN` | invent a random string (e.g. run `openssl rand -hex 16`) |
| `META_APP_SECRET` | app dashboard → **App settings → Basic → App secret** |
| `VHP_PHONE` | the VHP's number, digits only with country code, e.g. `85291234567` |
| `CRON_SECRET` | invent another random string — Vercel automatically attaches it to cron requests |

Leave the template-name variables alone; the defaults match Phase 5.

- [ ] All six set → **redeploy** (env changes don't apply to the running
      deployment).

**Check:** `curl https://www.mathans.app/api/whatsapp/remind` returns
`{"error":"Unauthorized"}` — the route is alive and locked.

## Phase 3 — connect the webhook

1. [ ] App dashboard → **WhatsApp → Configuration → Webhook → Edit**:
       - **Callback URL:** `https://www.mathans.app/whatsapp/prefects`
       - **Verify token:** the exact `WHATSAPP_VERIFY_TOKEN` value
2. [ ] Click **Verify and save**. Meta calls our GET handshake; if it
       fails, the token doesn't match or the deploy hasn't finished.
3. [ ] Under **Webhook fields**, subscribe to **messages** (only that one).

**Check:** send any WhatsApp text *to* the test number from your verified
phone. Vercel → project → **Logs** should show a POST to
`/api/whatsapp/webhook` returning 200. (You won't get a reply — free text
from a prefect is deliberately ignored unless a reason is pending.)

## Phase 4 — load contacts and roster

1. [ ] Load the opt-in contact list — easiest via the **contacts editor**
       on `/prefects/status/update` (WhatsApp section); start with just the
       pilot people, and `name` must match the names you type into the duty
       roster exactly. The curl equivalent:

```bash
curl -X POST https://www.mathans.app/api/whatsapp/contacts \
  -H "Content-Type: application/json" -H "x-admin-secret: $PREFECT_ADMIN_SECRET" \
  -d '{ "contacts": [
    { "name": "Kingsley", "phone": "+85291234567", "role": "prefect", "optIn": true },
    { "name": "Angelia",  "phone": "+85298765432", "role": "prefect", "optIn": true } ] }'
```

2. [ ] On `/prefects/status/update`, make sure tomorrow (or your test day)
       has a duty entry with those names, a location (e.g. `Front Gate`)
       and a time (e.g. `7:45am`).

**Check:** `curl -H "x-admin-secret: …" https://www.mathans.app/api/whatsapp/contacts`
returns your list, phones normalised to digits.

## Phase 5 — create the three templates

WhatsApp Manager (from the app: **WhatsApp → Message templates**) →
**Create template**. Category **Utility**, language **English (en)** for
all three. Copy names and bodies **exactly** from
[README.md → Message templates](README.md#message-templates-create-in-meta--whatsapp-manager-all-utility):

All three use **named variables** (`{{name}}`, `{{gate}}`, `{{time}}`,
`{{day}}`, `{{weather}}`, `{{notice}}`) — pick "Name" as the variable type
in the builder and keep those exact variable names:

- [ ] `prefect_duty_reminder` — with buttons `I'll be there`, `I can't make it` **in that order**
- [ ] `prefect_duty_reminder_weather` — the "today" morning variant with the `{{weather}}` block, **no buttons**
- [ ] `prefect_notice` — `{{notice}}` body, no buttons

Then wait for each to show **Approved** (minutes to ~24h). Meta emails you.
If one is rejected, tweak the sample values (they must look like a real
message) and resubmit — do **not** change the variable order.

The three hand-sent notice templates in
[notice-templates.md](../../notice-templates.md) can wait — finalise the
wording and submit them whenever; nothing in code depends on them.

**Check:** all three show Approved in WhatsApp Manager.

## Phase 6 — dry-run the whole flow (test number, pilot trio)

Everything in one sitting, playing both roles:

1. [ ] Trigger tomorrow's reminders by hand:
       `curl -H "x-admin-secret: …" "https://www.mathans.app/api/whatsapp/remind?date=YYYY-MM-DD"`
       — the JSON response lists each rostered name and `ok` or the reason
       it was skipped (`no contact on file` means a roster/contact name
       mismatch).
2. [ ] The reminder lands on the pilot phones with both buttons.
3. [ ] One person taps **I'll be there** → "Thanks — see you at the gate."
4. [ ] Another taps **I can't make it** → gets the reason question →
       replies → gets "Noted" — and the VHP phone receives the private
       relay plus, if the slot dropped below two, the short alert.
5. [ ] From the VHP phone, send `anything` → you get the command help
       (proves the VHP number matches `VHP_PHONE`).
6. [ ] `curl -H "x-admin-secret: …" https://www.mathans.app/api/whatsapp/morning`
       → on a clear day returns `{"held":false,"reason":"no suspending
       signal in force"}`. That's the expected result — the full
       suspension flow can only fire on a real Red/Black/No. 8 morning
       (and on advisory-warning mornings this same endpoint sends the
       "today" weather reminder), so
       just read `morningCheck` twice: the held message goes to the VHP
       only, and `CANCEL` is what releases it.

**Check:** every box above, on real phones.

## Phase 7 — go permanent

The temporary token dies daily; swap it before relying on the crons.

1. [ ] business.facebook.com → **Business settings → Users → System
       users** → **Add** → name it `prefect-hub`, role **Admin**.
2. [ ] **Add assets** → Apps → your app → full control.
3. [ ] **Generate new token** → pick the app → expiry **never** →
       permissions `whatsapp_business_messaging` and
       `whatsapp_business_management` → copy it.
4. [ ] Replace `WHATSAPP_TOKEN` in Vercel and redeploy.
5. [ ] Re-run the Phase 6 step 1 curl to confirm sends still work.

**Real number (when ready to leave the 5-recipient test cage):** the
number must not be registered on the WhatsApp app — open WhatsApp on that
phone → Settings → Account → Delete account ("free the number"), wait a
few minutes, then **WhatsApp → API Setup → Add phone number**, verify by
SMS, and update `PHONE_NUMBER_ID` in Vercel (the ID changes with the
number!). Re-verify the webhook still shows subscribed. Tier 0 unverified
allows 250 unique recipients per rolling 24h — the full board fits.

## Phase 8 — pilot, then the board

- [ ] Confirm the crons fired on their own: Vercel → **Logs** (or
      Settings → Cron Jobs) should show `/api/whatsapp/remind` around
      12:00–13:00 UTC (20:00–21:00 HK) and `/api/whatsapp/morning` around
      22:00–23:00 UTC. No duty tomorrow = a quiet
      `{"sent":0,"note":"no duty scheduled"}` — that's correct.
- [ ] Run the pilot: three prefects, one week, real duties. Collect
      complaints about wording now — template edits need re-approval.
- [ ] Meanwhile collect the rest of the board's numbers **with explicit
      opt-in** (a Google Form works: name as it appears on the roster,
      number, "I agree to receive duty reminders on WhatsApp"). Only then
      POST them to `/api/whatsapp/contacts` with `"optIn": true`.
- [ ] Scale up the contact list. Done.

## When something misbehaves

| Symptom | Look at |
| --- | --- |
| Webhook verify fails | `WHATSAPP_VERIFY_TOKEN` mismatch, or deploy not finished |
| Every POST from Meta gets 403 | `META_APP_SECRET` is wrong — copy it again from App settings → Basic |
| Reminder curl says `no contact on file` | contact `name` ≠ roster name (exact, case-insensitive) |
| Reminder curl says `not opted in` | that contact was saved with `optIn` missing or false |
| Template send error 132001 | template name/language mismatch — envs must equal the *approved* name and `en` |
| Sends fail with 131030 | recipient not in the test number's 5 verified numbers |
| VHP gets nothing | `VHP_PHONE` digits don't match the VHP's wa_id — check a webhook log line for the real `from` value |
| VHP alerts fail with 131047 | VHP's 24h window closed and `prefect_notice` isn't approved yet |
| Crons never fire | branch not merged/deployed to production, or `CRON_SECRET` unset (then the route 401s Vercel's own call — check Logs) |
| Everything silent | Vercel Logs first, then Meta → WhatsApp → API Setup → webhook delivery attempts |
