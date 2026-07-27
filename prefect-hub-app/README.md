# Prefect Hub

Mobile-first platform for the Prefect Board of St. Margaret's Co-educational
English Secondary and Primary School: handbook, scenario simulations, and a
live weather/duty portal. Full requirements live in [SPEC.md](./SPEC.md).

**Live at https://www.mathans.app/prefect-hub**

## How it is deployed

Prefect Hub is part of the main MathAns site — one Vercel project, no second
deployment:

| Piece | Lives at | Notes |
|---|---|---|
| App source | `prefect-hub-app/` | Next.js App Router + TypeScript. Not served directly. |
| Built site | `prefect-hub/` | Static export, committed, served at `/prefect-hub`. |
| Weather engine | `lib/prefect-weather.mjs` | Rules + resolution. Single source of truth. |
| HKO proxy | `api/weather.js` | Serverless function at `/api/weather`. |

The root project is a plain static deployment with serverless functions in
`api/`, so the export is committed rather than built on Vercel. **After
changing anything in `prefect-hub-app/`, publish with:**

```bash
cd prefect-hub-app
npm install
npm run export:site   # next build + copy out/ -> ../prefect-hub/
```

Then commit `prefect-hub/` along with your source changes.

## Develop

```bash
cd prefect-hub-app
npm install
cp .env.example .env.local   # fill in Firebase web config
npm run dev                  # http://localhost:3000/prefect-hub
```

`npm run dev` does not serve `/api/weather` — that function belongs to the
root site. Run `vercel dev` from the repo root if you need the live endpoint;
otherwise the banner shows its fail-soft state.

## Test

```bash
npm test           # weather engine: 9 rules, time bands, stickiness, fail-soft
npm run test:rules # Firestore security rules against the emulator
                   # (needs firebase-tools + Java)
```

Tests import `lib/prefect-weather.mjs` directly — the same module the
serverless function runs, so they test what actually ships.

## Roles

Roles (`prefect`, `vice-head`, `head`, `teacher`) are Firebase **custom
claims**, set with `scripts/set-role.ts` — never a client-writable field.
Firestore security rules are the access control; the UI only reflects them.
