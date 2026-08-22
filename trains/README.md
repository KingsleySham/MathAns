# Chatswood ⇄ Hurstville — next trains

A departure board for two people who live in Chatswood and visit Hurstville,
at `mathans.app/trains`. It answers one question on opening: **of everything
leaving in the next thirty minutes, which way gets there soonest** — and then
tells you the platform to stand on, the stops to count, and the station to get
off at, in Traditional Chinese and English.

The recommended journey is the yellow card, marked ★ 最快 / Fastest. Yellow is
never the only signal: the badge says so in words as well.

## What it does

- **Both directions.** Going to Hurstville and coming home again, each with its
  own platforms and headsigns.
- **The next thirty minutes**, ranked by arrival time. For someone deciding
  now, arriving first *is* the shortest commute — a journey that saves four
  minutes of running time by leaving twenty minutes later does not.
- **Where to get off**, twice: the interchange, and the destination. Both are
  set apart from the rest of the card, because that is the step you cannot
  recover from if you miss it.
- **Which platform**, where it is known, and "read the indicator board" where
  it is not. Never a guessed number.
- **How many stops** on each leg — the count works when you cannot hear the
  announcement.
- **Fast services flagged**: the peak South Coast expresses (two stops from
  Central) and the limited-stops T4 patterns carry a chip of their own.
- **Late at night** it shows the first trains of the morning rather than an
  empty board.

Accessibility, as an elderly-first design rather than a checklist:

- Light mode only, fixed — no theme to hunt for, no dark flash in daylight.
- 20px base with a one-tap 115% / 130% enlargement; the whole layout is in
  `rem`, so everything grows together. No horizontal scrolling results, down
  to a 320px screen at the largest size.
- 中文 / English / both, remembered between visits along with the direction and
  text size. Station names always keep their English, because that is what the
  platform sign, the announcement and the indicator board say.
- Every control is at least 48px tall, with a 4px focus ring.
- The auto-refresh does not steal focus or close an expanded list: the board
  redraws only when the trains themselves change.
- Works offline. The timetable model runs entirely in the browser, so a board
  is still a correct board on a platform with no signal (after one visit, via
  the site service worker).

## Live times

The page works with no configuration: it computes departures from the
timetable model in `lib/trains/plan.js` and labels itself **預計時間表 /
Estimated timetable**.

Set `TFNSW_API_KEY` (free from
[opendata.transport.nsw.gov.au](https://opendata.transport.nsw.gov.au)) as a
Vercel environment variable and `/api/trains` starts answering from the
Transport for NSW Trip Planner instead — real delays, real platforms — and the
badge changes to **實時班次 / Live times**. Nothing else needs to change.

The live path degrades quietly at every step. No key, a timeout, an upstream
error, a bus-replacement journey the board cannot draw: all of them answer
`{ live: false }` with HTTP 200 and the page stays on the model. It never
shows a live badge over modelled times.

> The live mapper (`lib/trains/live.js`) is tested against a fixture of the
> Trip Planner's `rapidJSON` shape, not against the live service — there was no
> key available when it was written. Worth one look at a real response when a
> key is first configured.

## How it fits this repo

| | |
|---|---|
| `trains/index.html` | the whole page — static, vanilla, no build step |
| `lib/trains/network.js` | the network: stations, stopping patterns, platforms, transfer walks |
| `lib/trains/plan.js` | the planner — pure, deterministic, no clock reads |
| `lib/trains/live.js` | Trip Planner response → the same journey shape |
| `api/transit.js` | `?op=trains` (and the pre-existing `?op=kmb`) |

`lib/trains/*.js` is imported straight into the browser as a module, the same
way `lib/flights/status-points.js` is — one source of truth for the timetable
rather than a copy in the page.

**On `api/transit.js`:** the Vercel Hobby plan allows twelve serverless
functions per deployment and all twelve were spoken for, so rather than push
the deployment over the limit, the former `api/kmb-route.js` moved into
`api/transit.js` unchanged and the trains endpoint joined it behind `?op=`.
Both public paths are preserved by rewrites in `vercel.json`, so
`/api/kmb-route` behaves exactly as before.

```bash
npm run test:trains
```

## Where the numbers come from

Every stopping pattern, platform, ride time and interchange walk is
transcribed from the journey brief that asked for this app. Two places where
the model departs from it, both deliberate:

1. **Martin Place, Central and Sydenham are on one line, in that order.** The
   brief presents them as three route options, which they are — but they are
   three points at which you leave the Metro and join *the same southbound
   train*, not three separate services. Modelling them as independent
   departure boards would invent trains that call at Sydenham without ever
   having passed Central. So each pattern is defined once, line-wide, with a
   call table; every per-interchange time is derived from it. Where the
   brief's own per-option ride times disagree with each other (they imply
   different Martin Place → Central runs for one train), the call table wins.

2. **All-stops runs are slower than the brief allows.** A thirteen-stop
   all-stations run from Martin Place is about 32 minutes, not the 26 the
   brief gives. The model uses the longer figure: for planning a morning out,
   an estimate that runs late is a worse failure than one that runs early.

Everything else — the ~11/15/22 minute Metro legs, the 1–2/3–4/1–2 minute
walks, the SCO express at 18 minutes from Central, the Sydenham patterns at
10/12/16 — is the brief's, and the interchange walks use the upper end of each
range, because a plan that only works at the walking pace of someone half
their age is not a plan.

Service frequencies are not from the brief and are not published timetable:
they are typical headways by daypart (Metro every 4–5 minutes in the peaks,
every 5–10 otherwise; T4 every 10–15; South Coast expresses every 30 in the
peaks only). That is why the estimated board says estimated, and why the live
feed is worth the API key.

## Station names

English is authoritative throughout — it is what is written and announced.
The Traditional Chinese names are the transliterations in common use in
Sydney's Chinese community (車士活, 好市圍, 中央車站, 高嘉華 …), shown
alongside the English so a reader can recognise a stop, never replacing it.
They live in one table in `lib/trains/network.js` if any need correcting.
