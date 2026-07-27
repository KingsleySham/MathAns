# Prefect Hub

Mobile-first platform for the Prefect Board of St. Margaret's Co-educational
English Secondary and Primary School: handbook, scenario simulations, and a
live weather/duty portal. Full requirements live in [SPEC.md](./SPEC.md).

## Stack

Next.js (App Router) + TypeScript · Tailwind CSS · Firebase Auth + Firestore ·
HKO Open Data API (proxied through `/api/weather`) · Vercel.

## Develop

```bash
cd prefect-hub
npm install
cp .env.example .env.local   # fill in Firebase web config
npm run dev
```

Without Firebase env vars the shell still runs: the weather engine serves live
HKO data with seed rules, and auth-gated pages show a "not configured" notice.

## Test

```bash
npm test           # unit tests (weather engine)
npm run test:rules # Firestore security rules against the emulator
                   # (needs firebase-tools + Java: npx firebase-tools ...)
```

## Roles

Roles (`prefect`, `vice-head`, `head`, `teacher`) are Firebase **custom
claims**, set with `scripts/set-role.ts` — never a client-writable field.
Firestore security rules are the access control; the UI only reflects them.

## Deploy

Deployed on Vercel as its own project with root directory `prefect-hub/`
(separate from the MathAns static site at the repo root).
