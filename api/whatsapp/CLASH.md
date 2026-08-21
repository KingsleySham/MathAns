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
        ┌── mathans.app/parents/clash ──┐   ┌── WhatsApp: text "clash" ───┐
        │  name the event, give it      │   │  "what's the event?"        │
        │  dates, press Find clashes    │   │   HKYAS, 16/8-19/8          │
        └───────────────┬───────────────┘   └──────────────┬──────────────┘
                        │                                  │
                        ▼                                  ▼
              the timetable is checked: which tutorials the event
              runs over, and where each one can be made up
                        │                                  │
              review / edit the slots            "send this? reply yes"
                        └────────────────┬─────────────────┘
                                         ▼
                        class_clash template to all three
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

## Working it out — the make-up rule

The event is the only thing anybody types. From it, `lib/clash-schedule.js`
works out **what was missed** (which tutorials the event runs over) and **where
each one goes instead**, against the weekly timetable in Settings.

The rule, which is the whole point:

> A make-up goes in the **same week** as the lesson it replaces, on a day
> **before** it, keeping the tutor's usual time.

```
    event Thursday · reported the Saturday before
    ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
    │ Mon │ Tue │ Wed │ THU │ Fri │ Sat │ Sun │
    │  ✓  │  ✓  │  ✓  │  ✗  │  ✗  │  ✗  │  ✗  │   ✓ = a make-up may go here
    └─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

The week runs Monday to Sunday. Days are tried **nearest the clash first**, so
the lesson lands as close to where it should have been as the week allows, and
a day is only offered when the slot is clear of:

- the event itself — a multi-day event blocks the earlier days too;
- every other tutorial in the timetable;
- any make-up already proposed in the same run — two lessons cannot share an hour;
- the next two hours (`MIN_NOTICE_MINUTES`) — a slot this evening is not a plan.

When nothing in the week works — a Monday clash has no earlier day at all —
the line says `→ no free slot, arrange with the tutor` rather than inventing
one. That is information, and more use than a slot nobody can make.

### Who gets a contested hour

When two clashed lessons want the same hour, "whichever clashed first" is the
wrong answer. A lesson at a centre with fixed hours may have exactly one slot
all week; a lesson whose tutor moves to suit has one every day. First-come
allocation can hand the hour to the flexible one and leave the constrained one
with nothing.

So the scarce ones are placed first — **fixed-hours lessons before flexible
ones, then fewest options first, then earliest clash**. Only the order of
allocation changes; the proposals come back in the order they were given, so
the message still reads chronologically.

The one left without is told why it lost, since that reads differently from
nothing being free: *"Maths' make-up has that hour."*

### When the centre only offers certain hours

Keeping the tutor's usual time is right for a private tutor, who moves to suit.
A tuition centre does not: it runs the subject at fixed hours, and a make-up
has to go in one of them.

So a tutorial can carry **make-up slots** — typed into Settings as
`Mon 6pm, Sat 2-4pm` — and when it has any, **those are the only times
considered**. The window does not change: still the same week, still before the
clash, still nothing on top of anything else. All that changes is which times
are candidates on each day. Where two offered slots fall on the same day, the
one nearest the lesson's usual hour wins.

Leave it blank and nothing changes — the lesson keeps its own time and only the
day moves.

**Slots that cannot be read are reported, never dropped quietly.** A lesson
whose slots all fail to parse looks exactly like a lesson with no fixed hours,
and is then scheduled at a time its centre never opens — which is precisely how
a Sunday clash ended up moving a Wednesday-only lesson to the Saturday. So the
day is found first and the rest of the line read as its time, which means all
of these work:

| Typed | Read as |
| --- | --- |
| `Sat 2pm` · `Sat, 2pm` · `Saturday, 10am` · `2pm Sat` | one slot |
| `Sat 2pm, Sun 4pm` · `Sat 2pm; Sun 4pm` · `Sat 2pm Sun 4pm` | two slots |
| `Sat 10am, 2pm` | two slots on the Saturday |
| `Sat 2-4pm` · `星期六 2-4pm` | one slot with an end time |

Anything left over comes back from `readSlots()` as `rejected`, and saving the
page says so: *"Lesson 2: could not read "next Sat" as a make-up slot"*.

A centre whose slots simply don't come up before the clash gets its own message
on the page, because the fix is different: *"None of its make-up slots
(Mon 6pm, Sat 2pm-4pm) come up before Fri 28/8 that week — pick one by hand, or
arrange it with the centre."*

### Attending online

A centre that also runs the subject online usually runs it at other hours too,
and those hours are no use to someone who has to be in the room. So a tutorial
can carry **online slots** as well as its in-person ones — `Wed 8pm, Sun 10am`
— and they stay out of the search until online is chosen **for that lesson**.

On the page, a clash whose tutorial has online hours grows an **Online** tick.
Taking it re-plans there and then and shows what it opened up:

```
before   4️⃣ Thursday 6:30pm - Maths → (none of its slots are free that week)
after    4️⃣ Thursday 6:30pm - Maths → Wed 26/8 8pm (online)
```

They are extra options, never replacements: the in-person hours are still
considered, and **in person wins a tie** — there is no reason to be online when
the room is free. A proposal that came from the online list carries `online`
and says so on the line, because "Tue 5pm" and "Tue 5pm (online)" are not the
same instruction to anybody.

### Skipping a home class

A centre's slots are scarce; a lesson at home is not. So when the **only** thing
standing between a make-up and the week is a home lesson, that is a question
rather than a dead end.

Tick **home class** on a tutorial and it may be given up for a centre make-up.
The proposal then comes back carrying what it would cost, and says so on the
line everyone reads:

```
3️⃣ Thursday 6pm - Math → Tue 25/8 6pm (skips Japanese)
```

Nothing is skipped without being asked:

- **On the page**, the row grows a question — *"Skip **Japanese** at home that
  day"* — ticked, because it is what the system suggests, but never silent.
  Untick it and the make-up goes back to unscheduled.
- **On WhatsApp**, the confirm step becomes a real either/or: *yes* sends it
  that way, *no* keeps the home lesson and leaves that make-up unscheduled.

Four things are never displaced, whatever it costs: **an event** (it cannot be
moved), **another make-up** (it is already someone's answer), **a centre
lesson** (the thing being protected), and **any lesson not ticked as a home
class**. And a genuinely free slot always beats one that costs something — the
question only comes up when there is no alternative.

The displaced lesson is **given up, not rescheduled**. Chasing it would start a
cascade, so it is named in the message and the family decides what to do about
it.

**Home class does two jobs**, both of them "this one can give way":

- when it is **in the way** of a make-up — Japanese sitting on the Tuesday slot
  Math needs — it is offered up, as above;
- when it is **itself clashed**, the page offers to skip it outright. There is
  nothing to rearrange, so a yellow box above the list asks *"Clashed, skip
  classes?"* with a **Proceed** button. The lesson stays on the list and in the
  message, with its make-up slot replaced by what to do instead:

  ```
  1️⃣ Thursday 6pm - Japanese → Skip class, notify tutor
  3️⃣ Thursday 6:30pm - Math → Mon 24/8 6:30pm
  ```

  It stays outstanding until someone ticks it off, because telling the tutor is
  still an action. *Undo* puts it back to being made up.

What it does **not** do is make the lesson being made up skippable by ticking
that lesson — a lesson is never in its own way, so ticking the clashed centre
lesson changes nothing about where its make-up goes.

That distinction is invisible when it goes wrong, so a make-up that could not
be placed now names what stood in it:

> None of its make-up slots (Tue 6pm-7:30pm) are free before Thu 27/8 that week
> — pick one by hand, or arrange it with the centre. **Japanese is on then —
> tick it as a home class in Settings if it could be skipped for this.**

Only lessons that are *not* already ticked are named, since those are the ones
where ticking would make a difference. The same sentence appears in the
WhatsApp summary.

The proposal rides along in the `class_clash` message, one per clash line:

```
1️⃣ Tuesday 6pm - Japanese → Mon 18/8 6pm
3️⃣ Thursday 6:30pm - Math → no free slot, arrange with the tutor
```

**Nothing is sent on the system's say-so.** The page shows the proposals with
the dates and times editable and a tick-box per lesson; WhatsApp shows the same
summary and waits for *yes*. Both post the reviewed plan back, so what was
approved is exactly what goes out.

The timetable is what makes any of this possible: a tutorial needs a **day and
a start time** to be detected or scheduled around. One without them can still
be picked by hand — the page's *Add a tutorial it missed* — and is hung on its
next occurrence so "the same week, before it" still means something.

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
| `lib/clash-schedule.js` | pure logic: detecting the clashes and proposing the make-ups. "Now" is always passed in |
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

1. **Name the event** and give it dates — times only if it is not all day —
   then press **Find clashes**.
2. **Check what it found**: every tutorial the event runs over, each with a
   proposed make-up date and time — drawn from the centre's offered slots where
   the tutorial has them. If any of the clashed lessons is itself a **home
   class**, a yellow box sits above the list — *"Clashed, skip classes?"* —
   with a **Proceed** button. They stay listed, with their make-up replaced by
   *"Skip class, notify tutor"*. *Undo* puts them back. Untick anything that does not need
   arranging, type over a slot that will not work, or add a tutorial the
   detection missed.
3. **Check the preview** — a mock-up of exactly what the three phones will
   show — and send.

Below that, **open clashes** with a tick-box per lesson and one *Send update*
button (the same path as picking them in WhatsApp: everyone is told, and the
template goes again if anything is left) and *Close, no message* for one
opened by mistake. Under **Settings**, the weekly timetable — day, start, end,
location, tutor — and the three phone numbers.

## Setup

1. Get `class_clash` **and** `class_clash_done` approved in Meta with the
   wording above. The flow works with only the first, but the sign-off then
   goes out as plain text.
2. Set `CLASH_ADMIN_SECRET` in Vercel (any string).
3. Open `/parents/clash`, unlock, and under **Settings** enter the three
   numbers and the weekly timetable. Nothing is sent until the numbers are
   there — they are personal data and are never committed to the repository.
   Give every tutorial a **day and a start time**: without them a lesson
   cannot be detected automatically or scheduled around. Add **make-up slots**
   (`Mon 6pm, Sat 2-4pm`) for any tutorial run by a centre with fixed hours —
   see [above](#when-the-centre-only-offers-certain-hours) — and tick **home
   class** on the ones that could be given up to fit one in.

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
| `clash:lessons` | the weekly timetable — `[{ code, name, weekday, start, end, location, tutor, makeupSlots, onlineSlots, homeClass }]` | — |
| `clash:open` | ids of clashes still outstanding (an index; the cases are the truth) | — |
| `clash:case:{id}` | one clash: the lessons with their dates and make-up slots, the events, who sorted what | 60 days |
| `clash:draft:{key}` | the half-answered WhatsApp conversation (`event` → `confirm`, or `fixing`) | 2 h |

No `prefect:*` key is read or written by any of this.
