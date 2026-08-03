# CX Status Run — planner & fare tracker

Two tools sharing one domain engine, at `mathans.app/flights`:

- **Mileage run planner** — ranks return trips by cost per Cathay status
  point and hours away, off Cathay's published earning table (departures on
  or after 20 Aug 2025). Deterministic; fares are modelled estimates until
  the tracker replaces them.
- **Fare tracker** — watches routes, prices them twice a day via Amadeus,
  hard-filters LCCs, and alerts on target hits. Every quote carries a
  cost-per-status-point figure.

## How it fits this repo

MathAns is a static site with plain Vercel serverless functions — not
Next.js — so the layout differs from the original brief in shape, not
behaviour:

| Brief assumed | Here |
|---|---|
| `app/flights/page.jsx` (App Router) | `flights/index.html` (static page, vanilla JS) |
| `app/api/flights/watches/route.js` + `app/api/flights/cron/track/route.js` | one consolidated `api/flights.js` (`?op=` multiplexed, same pattern as `api/whatsapp/tasks.js`, same Hobby function-budget reason), public paths preserved via `vercel.json` rewrites |
| Vercel cron `0 1,13 * * *` | `.github/workflows/flights-track.yml` — Hobby allows only 2 daily crons and both are taken by the prefect messenger. On Pro, move the schedule into `vercel.json` and delete the workflow. |
| `lib/flights/*` | `lib/flights/*` (unchanged; `status-points.js` is served statically and imported by the browser too — one source of truth) |

Public routes (all via rewrites):

- `GET /flights` — the planner (basic auth)
- `GET/POST/PATCH /api/flights/watches` and `/flights/api/watches` — watch management (basic auth; the `/flights/api/` alias lets the browser reuse the page's credentials)
- `GET /api/flights/cron/track` — the sweep (`Authorization: Bearer $CRON_SECRET`; `?force=1` overrides the freshness guard)

## Setup

1. **Database** — provision a Neon Postgres (none existed in this project;
   the rest of the site uses Redis/Firestore), then:
   ```bash
   psql "$DATABASE_URL" -f schema.sql
   ```
2. **Vercel env vars** (Production):
   ```
   DATABASE_URL
   AMADEUS_CLIENT_ID
   AMADEUS_CLIENT_SECRET
   AMADEUS_HOST=test.api.amadeus.com    # api.amadeus.com when live
   CRON_SECRET
   MIN_GAP_HOURS=10
   MAX_DATES_PER_WATCH=5
   FLIGHTS_USER
   FLIGHTS_PASS
   RESEND_API_KEY                        # optional
   ALERT_FROM
   ALERT_TO
   ```
3. **GitHub repo secret** — `CRON_SECRET` (same value), for the scheduled
   workflow.

Everything degrades gracefully while unset: the planner is fully client-side;
the tracked-fares panel says plainly when the database isn't wired up.

## Quota maths — take this seriously

```
calls/month = watches × dates × 2 × 30
```

Six watches at 5 dates is 1,800 calls a month, already near a typical
Amadeus free-tier allowance. Twice-daily means fewer routes *or* narrower
windows, not both. The levers:

- `MAX_DATES_PER_WATCH` (default 5) — dates sampled per watch per run,
  spread evenly across the departure window.
- `MIN_GAP_HOURS` (default 10) — a watch priced more recently than this is
  skipped, so manual triggers and platform retries can't double-spend.
- Pause watches from the UI (or `PATCH {id, active:false}`) instead of
  deleting them — history is kept.
- The sweep **stops entirely on the first 429** and reports partial
  coverage rather than hammering a rate-limited API.

## Alerts

Reasons: `new_low` (beats all-time low), `under_ceiling` (≤ `max_price`),
`cpp_target` (≤ `target_cpp`, exact-brand quotes only — upper-bound points
never trigger it), `big_drop` (≥12% below the 60-day median, needs ≥5
observations in the window). Deduped per watch/reason per 12-hour bucket;
emailed via Resend when configured, skipped silently when not.

## Known weak point — branded fares

Amadeus doesn't reliably return the Light/Essential/Flex brand, and that
brand is the difference between 3 and 25 points on the same seat. Current
policy: a CX quote with no brand scores the **Flex row as an upper bound**,
stored with `points_upper_bound = true` and shown as `≤ N`, and it never
triggers `cpp_target`. Watch how often the brand is missing in real
responses before trusting cross-route cpp comparisons.

## Tests

```bash
npm run test:flights
```

Covers the earning engine: zone boundaries, the published table (including
null for partner-marketed and unpublished class/brand combinations), and
the 2026-reset ladder maths.
