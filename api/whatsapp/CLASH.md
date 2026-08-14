# Lesson clash — the family flow

School events land on top of private tutorials, and the tutorials then have to
be rearranged. This is the bot that says so: one message to Kingsley, Jessica
(mum) and Andy (dad), and a way to tick each lesson off as it gets sorted.

It runs on the **same WhatsApp number as the Prefect Hub** and shares nothing
else with it — separate library, separate Redis namespace, separate secret. The
rules that keep the two apart are in
[Sharing the number](#sharing-the-number-with-the-prefect-hub) below, and they
are what `lib/clash-routing.test.js` mostly tests.

## The flow

```
        ┌── mathans.app/parents/clash ──┐
        │  press the tutorials that     │
        │  clashed, name the event      │
        └───────────────┬───────────────┘
                        │        ┌── WhatsApp: text "clash" ──┐
                        │        │  "which tutorial(s)?" 1,3  │
                        │        │  "what is it clashing      │
                        │        │   with?"  HKYAS — 16/8     │
                        ▼        └──────────────┬─────────────┘
             class_clash template to all three ◄┘
                        │
                 tap "Actions taken 已完成調堂"
                        │
                        ▼
              the list of lessons still to arrange
                        │
             pick one ──┴── or reply "1,3" for several
                        │
                        ▼
         anything still outstanding?
              yes ─► class_clash again, that lesson moved to ✅ Arranged
              no  ─► class_clash_done — the same message, no buttons
```

Only the lessons still outstanding are ever listed as clashes: a re-send
listing a lesson that was already sorted would read as if it had come undone.
It moves down to ✅ Arranged instead, so each message shows the whole picture.

One message per action, to all three, however many lessons it ticked off.

**Two at a time.** The Cloud API's list control is single-select — there is no
multi-select in it — so tapping a row sorts one lesson. Replying with the codes
(`1,3`) sorts as many as you like in one go, in the same language the bot
already asks for when a clash is opened, and the picker says so. That reply
only means "these are arranged" while the picker is open (`clash:draft` at step
`fixing`), so a stray number from a parent can never tick a lesson off.

The page does the same thing with tick-boxes and one **Send update** button.

A genuine in-chat multi-select would mean a WhatsApp Flow — a published Flow in
Meta, its own JSON, and the `nfm_reply` webhook to handle. Worth it only if
typing two codes turns out to be the friction.

## Where it lives

| Path | Purpose |
| --- | --- |
| `parents/clash.html` | the page — `mathans.app/parents/clash`, behind the passcode |
| `lib/clash-flow.js` | pure logic: parsing, the case shape, the template mapping. No Redis, no network |
| `lib/clash-store.js` | the `clash:*` Redis keys |
| `lib/clash-messenger.js` | the conversation, both entry points, and the webhook claim rules |
| `api/whatsapp/webhook.js` | one added line — clash gets first refusal, prefects get everything else |
| `api/whatsapp/tasks.js` | `?op=clash-*`, the page's API |

There is no new serverless function: the deployment sits on the Hobby plan's
cap of twelve, so the clash ops are folded into `api/whatsapp/tasks.js` for the
same reason the Notion and handbook ops are.

## The `class_clash` template

Utility, named variables, approved in Meta → WhatsApp Manager. `lib/clash-flow.js`
fills it in `clashTemplateParams()` — one function, so a rename in Meta is a
one-line change here.

```
Header   Possible clash - Kingsley {{day}}
Body     Due to unforeseen circumstances, actions are needed.
         ⚠️ Event(s): {{events}}
         {{event2}}
         *❌ Clash(es):*
         *{{tutorial_1}}* … *{{tutorial_7}}*
         ✅ Arranged :
         {{tutorial_arranged}}
         Please make adjustments to the clashed tutorial(s).

         Thank you for your kind attention.
Footer   電腦傳送 Sent via system.
Button   Actions taken 已完成調堂   (quick reply)
```

| Variable | Filled with |
| --- | --- |
| `day` | the day it is sent, `22/8` (the page can override it) |
| `events` | every event on one line — `HKYAS (16/8-19/8) · Speech Day (21/8)` |
| `event2` | `Total: 2` |
| `tutorial_1`…`tutorial_7` | one outstanding lesson each — `1️⃣ Tuesday 6pm - Japanese` — `N/A` for the unused slots |
| `tutorial_arranged` | lessons already sorted, or `N/A` |

Two Cloud API rules this has to respect, both covered by tests: **a parameter
may not be empty** (hence `N/A`, as in the approved samples) and **may not
contain a newline** (hence the ` · ` joins). The template has exactly seven
tutorial slots — an eighth lesson collapses into `…and N more` rather than
disappearing.

The number on each line is the lesson's own catalogue code, the same code
that gets typed into WhatsApp, so the message and the reply speak the same
language.

## The `class_clash_done` template

The sign-off, sent once every lesson in a clash has been arranged. Same shape,
so it reads as the same conversation — but **no buttons**, because there is
nothing left to tap, and the tutorial slots hold the arranged lessons rather
than the clashing ones. Also Utility, also named variables.

```
Header   Clash resolved - Kingsley {{day}}
Body     All clashed tutorial(s) have been arranged.
         ⚠️ Event(s): {{events}}
         {{event2}}
         *✅ Arranged:*
         *{{tutorial_1}}* … *{{tutorial_7}}*
         No further action is needed.

         Thank you for your kind attention.
Footer   電腦傳送 Sent via system.
Buttons  none
```

`day`, `events` and `event2` are filled exactly as above; `tutorial_1`…`7`
hold the arranged lessons, `N/A` for the unused slots. There is no
`tutorial_arranged` — everything is arranged, so there is no second list.

Until it is approved in Meta the Cloud API refuses it, and the send falls back
to a plain-text summary. The family is never left un-told, but the message
looks plainer until the template is live.

## The page

`mathans.app/parents/clash`, behind `CLASH_ADMIN_SECRET` (falling back to
`PREFECT_ADMIN_SECRET` so it works before the new variable is set — set it, so
the two systems can be locked separately).

Three steps, plus the housekeeping:

1. **Press the tutorials that clashed.** Each button shows its code and normal slot.
2. **Say why** — event name and when, one row per event.
3. **Check the preview** — a mock-up of exactly what the three phones will show — and send.

Below that, **open clashes** with a *Mark arranged* button per lesson (the same
path as picking it in WhatsApp: everyone is told, and the template goes again
if anything is left) and *Close, no message* for one opened by mistake. Under
**Settings**, the tutorial catalogue and the three phone numbers.

## Setup

1. Get `class_clash` **and** `class_clash_done` approved in Meta with the
   wording above. The flow works with only the first, but the sign-off then
   goes out as plain text.
2. Set `CLASH_ADMIN_SECRET` in Vercel (any string).
3. Open `/parents/clash`, unlock, and under **Settings** enter the three
   numbers and the tutorial list. Nothing is sent until the numbers are there —
   they are personal data and are never committed to the repository.

| Variable | Default |
| --- | --- |
| `CLASH_ADMIN_SECRET` | falls back to `PREFECT_ADMIN_SECRET` |
| `WHATSAPP_CLASH_TEMPLATE` | `class_clash` |
| `WHATSAPP_CLASH_DONE_TEMPLATE` | `class_clash_done` |
| `CLASH_NOTICE_TEMPLATE` | `WHATSAPP_NOTICE_TEMPLATE`, i.e. `prefect_notice` — the fallback when the sign-off finds a closed 24-hour window |

Everything else (`WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `REDIS_URL`, …) is
already set for the Prefect Hub and is shared.

## Sharing the number with the Prefect Hub

`handleClashWebhook()` runs first in `api/whatsapp/webhook.js` and returns
`false` for anything that is not unambiguously its own; the prefect routing
then runs exactly as it did before.

**Which system a number belongs to is decided before a word of the message is
read.** `whichSystem()` checks both contact lists — `clash:recipients` and
`prefect:contacts` (plus `VHP_PHONE`) — because the same text means different
things depending on who sent it. Six digits from a prefect is a handbook code;
six digits from Mum is a mistyped lesson code, and answering her with *"open
the handbook page and send the code showing there"* is the prefect system
leaking into the family. That lookup is the only line of contact between the
two systems, and it is a read.

| Message | Claimed? |
| --- | --- |
| a button or list row whose payload starts `CLASH_` | yes — no prefect template uses that prefix |
| a button labelled `Actions taken 已完成調堂` with no payload | yes, if a clash is open |
| `CONFIRM:…` / `DECLINE:…`, from anyone | **no** |
| text from a number on neither list, or on the prefect list only | **no** |
| anything from a number on the family list only — including `CANCEL` and six digits | yes |
| a bare `CANCEL` or six-digit code from someone who is *also* a prefect | **no** — that is the VHP's suspension approval, or a handbook code |
| a stray text from Kingsley (family and VHP) | **no** — his fall through to the prefect handler |
| a stray text from a parent | yes — a one-line pointer, never the prefect brush-off |
| anything at all, when Redis or the flow throws | **no** — errors are swallowed and reported as "not ours" |

`lib/clash-routing.test.js` pins each of those down. Run both suites after
touching either system:

```bash
npm run test:clash
npm run test:prefects
```

## Redis keys

| Key | Contents | TTL |
| --- | --- | --- |
| `clash:recipients` | `[{ name, phone, relation, notify, userId }]` | — |
| `clash:lessons` | the tutorial catalogue | — |
| `clash:open` | ids of clashes still outstanding (an index; the cases are the truth) | — |
| `clash:case:{id}` | one clash: lessons, events, who sorted what | 60 days |
| `clash:draft:{key}` | the half-answered WhatsApp conversation | 2 h |

No `prefect:*` key is read or written by any of this.
