# Prefect Hub — Build Specification

---

## 0. Brief

Build **Prefect Hub**, a mobile-first web platform for the Prefect Board of St. Margaret's Co-educational English Secondary and Primary School (Hong Kong).

It does three jobs:

1. **Handbook** — the Prefect's Handbook as a searchable support-centre style knowledge base.
2. **Simulations** — branching scenario training for emergency and discipline situations.
3. **Portal** — live Hong Kong Observatory weather warnings mapped to the school's duty arrangements, plus a notice feed from Head and Vice-Head Prefects.

Plus `/head`, a restricted admin area for running all of the above.

**Audience:** secondary school prefects, ages 13–18, almost all on phones. Bilingual English/Chinese school; UI in English, with Chinese content supported in article bodies.

**Tone:** official and trustworthy — this carries real duty instructions — but energetic enough that a 14-year-old will actually open it. Not a PDF in a browser.

---

## 1. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | |
| Styling | Tailwind CSS | Design tokens as CSS variables, mapped into `tailwind.config.ts` |
| Hosting | Vercel | Deploys under the existing MathAns Vercel account |
| Auth | Firebase Auth (email/password) | Custom claims for roles |
| Database | Firebase Firestore | |
| Weather | HKO Open Data API, called from a Next.js route handler | Server-side so responses can be cached |
| Search | Fuse.js, client-side over the article index | No search backend |
| Icons | lucide-react | |
| State | React state + SWR for polling | No Redux |

**Do not** call the HKO API directly from the browser. Proxy it through `/api/weather` with a 5-minute cache so 30 prefects refreshing at 7 a.m. produce a handful of upstream requests, not hundreds.

---

## 2. Design System

### Palette

Locked by the brief — use exactly these three accents.

```css
--navy:        #0b3374;  /* primary: headers, nav, structure, body text on light */
--red:         #db1a11;  /* emergency, suspension, destructive actions ONLY */
--yellow:      #eda535;  /* caution states, CTAs, badges, highlights */

/* derived */
--navy-900:    #071f47;
--navy-700:    #0b3374;
--navy-100:    #e6ecf6;
--red-100:     #fdeceb;
--yellow-100:  #fdf3e2;
--green:       #167a4b;  /* "all clear" only — needed for the status banner */
--green-100:   #e6f2ec;
--ink:         #14181f;
--muted:       #5b6472;
--line:        #dfe3ea;
--surface:     #ffffff;
--canvas:      #f6f7fa;
```

**Colour discipline is the most important rule in this spec.** Red means "duty is suspended or something is wrong." It never appears as decoration. If red is used for a heading or a divider, a prefect glancing at their phone at 6:15 a.m. will misread the page. Yellow means "pay attention, but duty is on." Everything structural is navy.

### Typography

- **Display / headings:** Lexend — 600/700, tight tracking (`-0.02em`) at large sizes.
- **Body:** Inter — 400/500, `line-height: 1.6`.
- **Data / timestamps / signal codes:** DM Mono — 400, used for issue times, signal codes, and audit log entries. This is what makes the weather cards read as instrument readouts rather than blog posts.

Type scale: 12 / 14 / 16 / 20 / 26 / 34 / 46.

### Layout & components

- Max content width 1100px; single column under 768px.
- Cards: `--surface` on `--canvas`, 12px radius, 1px `--line` border, no drop shadows except on the sticky status bar.
- 8px spacing grid.
- **Status stripe:** every status card carries a 6px left-edge colour stripe (green / yellow / red / navy). This is the signature element — the same stripe language repeats on notice priority, callout boxes, and simulation outcomes, so colour meaning is learned once and applies everywhere.
- Callouts in handbook articles: navy = Note, yellow = Important, red = Warning.
- Motion: page-load fade-in of 120ms, hover lifts on cards, and a single deliberate moment — the weather status banner cross-fades when the arrangement changes. Respect `prefers-reduced-motion`.

### Accessibility floor

Keyboard focus visible on every interactive element. Colour is never the only signal — every status carries an icon and a text label. Contrast ratio ≥ 4.5:1 for body text. Touch targets ≥ 44px.

---

## 3. Routes

```
/                       Dashboard: weather status + latest notices + resume handbook
/login                  Sign in
/handbook               Support-centre home: search + category cards
/handbook/[category]    Category listing
/handbook/[category]/[slug]   Article
/simulations            Scenario library with completion state
/simulations/[id]       Scenario player
/portal                 Weather status + today's arrangement + notice feed
/portal/arrangements    Full weather arrangement reference table
/head                   Admin (role-gated: head, vice-head, teacher)
/api/weather            HKO proxy + rule resolution
/api/notify             WhatsApp dispatch (rate-limited)
```

---

## 4. Data Models

### `users/{uid}`

```ts
{
  name: string;
  classCode: string;        // e.g. "S3C"
  role: 'prefect' | 'vice-head' | 'head' | 'teacher';
  dutyGroup: string;        // e.g. "Gate A"
  active: boolean;
  createdAt: Timestamp;
}
```

### `notices/{id}`

```ts
{
  title: string;
  body: string;                     // markdown
  priority: 'urgent' | 'reminder' | 'general';
  audience: 'all' | { dutyGroups?: string[]; forms?: string[] };
  status: 'draft' | 'scheduled' | 'published' | 'expired';
  publishAt: Timestamp;
  expiresAt: Timestamp | null;
  sentToWhatsApp: boolean;
  authorUid: string;
  authorName: string;
  readBy: string[];                 // uids
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `weatherRules/{ruleId}`

Seeded from the table in §5. Editable in `/head` so wording can change without a redeploy.

```ts
{
  order: number;
  key: string;                      // 'VHOT' | 'COLD' | 'TS' | 'TC13' | 'RAIN_A'
                                    // | 'SUSPEND_TC8' | 'RAIN_R_0530' | 'RAIN_R_0600' | 'RAIN_R_0800'
  condition: string;                // display name
  dutyArrangement: string;          // markdown
  hkoMeasure: string;               // markdown
  severity: 'normal' | 'caution' | 'suspended' | 'special';
}
```

### `weatherOverride/current` (single doc)

```ts
{
  preNo8: boolean;
  manualActive: boolean;
  manualRuleKey: string | null;
  reason: string;
  expiresAt: Timestamp | null;
  setByUid: string;
  setByName: string;
  setAt: Timestamp;
}
```

### `handbookArticles/{slug}`

```ts
{
  title: string;
  category: 'getting-started' | 'duty-procedures' | 'discipline-conduct'
          | 'emergency-weather' | 'reporting-lines' | 'faq';
  summary: string;                  // one sentence, shown in search results
  body: string;                     // markdown with callout syntax
  keywords: string[];
  relatedSlugs: string[];
  linkedScenarioId: string | null;  // "Practise this" link at article foot
  published: boolean;
  order: number;
  updatedAt: Timestamp;
}
```

### `scenarios/{id}`

```ts
{
  title: string;
  category: 'fire' | 'injury' | 'weather' | 'conflict' | 'security' | 'general';
  difficulty: 'new' | 'senior';
  intro: string;
  estMinutes: number;
  published: boolean;
  nodes: {
    [nodeId: string]: {
      situation: string;
      imageAlt?: string;
      choices: {
        label: string;
        next: string | null;        // null = end of branch
        score: number;              // -2..+2
        feedback: string;           // shown immediately after choosing
      }[];
    };
  };
  startNode: string;
  debrief: {
    correctProcedure: string;       // markdown: what should have happened
    handbookSlug: string | null;
  };
}
```

### `auditLog/{id}`

```ts
{
  actorUid: string;
  actorName: string;
  action: string;      // 'weather.override.set', 'notice.publish', 'user.role.change', ...
  detail: string;
  at: Timestamp;
}
```

---

## 5. Weather Engine

### HKO endpoints

```
GET https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en
GET https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en
```

`warnsum` returns an object keyed by warning code. Relevant keys and types:

| Key | Types |
|---|---|
| `WTCSGNL` | `TC1`, `TC3`, `TC8NE`, `TC8SE`, `TC8NW`, `TC8SW`, `TC9`, `TC10` |
| `WRAIN` | `WRAINA` (amber), `WRAINR` (red), `WRAINB` (black) |
| `WTS` | thunderstorm |
| `WHOT` | very hot weather |
| `WCOLD` | cold weather |

Each entry carries `name`, `code`, `actionCode` (`ISSUE` / `REISSUE` / `CANCEL` / `EXTEND` / `UPDATE`) and `issueTime`. **`issueTime` is what drives the rainstorm time bands.** Verify field names against the current HKO documentation before building — treat the shape above as expected, not guaranteed, and fail soft if a key is missing.

**The Pre-No.8 Special Announcement is not in this API.** It is published through a separate announcement channel. That is why the manual override in `/head` exists and is not optional.

### Rule table (seed data)

| # | key | Condition | Duty arrangement | HKO measure | Severity |
|---|---|---|---|---|---|
| 1 | `VHOT` | Very Hot Weather Warning | Morning Assembly held inside Homerooms or Assembly Hall. | School operates as usual unless advised otherwise. | caution |
| 2 | `COLD` | Cold Weather Warning | Morning Assembly held inside Homerooms or Assembly Hall. Students may wear additional non-school jackets, including down jackets, if notified via eClass or during cold weather conditions. | School operates as usual unless advised otherwise. | caution |
| 3 | `TS` | Thunderstorm Warning | Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers. | School operates as usual unless advised otherwise. | caution |
| 4 | `TC13` | Tropical Cyclone Warning Signal No. 1 or No. 3 | If there is adverse weather (e.g. raining), Morning Assembly held inside Homerooms or Assembly Hall. | School operates as usual unless advised otherwise. | caution |
| 5 | `RAIN_A` | Amber Rainstorm Warning Signal | Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers. | School operates as usual unless advised otherwise. | caution |
| 6 | `SUSPEND_TC8` | Pre-No.8 / TC Signal No. 8 or above | **All duties suspended and cancelled.** WhatsApp message will be sent regarding the suspension. Rescheduling will not be made. | All classes suspended for the day. Students who have not left for school should stay home. Students already at school remain until it is safe to return home. | suspended |
| 7 | `RAIN_R_0530` | Red Rainstorm Signal or above issued 5:30–6:00 a.m. | **All duties suspended and cancelled.** WhatsApp message will be sent regarding the suspension. Rescheduling will not be made. | As above. | suspended |
| 8 | `RAIN_R_0600` | Red Rainstorm Signal or above issued 6:00–8:00 a.m. | **All duties suspended and cancelled.** WhatsApp message will be sent regarding the suspension. Rescheduling will not be made. | As above. | suspended |
| 9 | `RAIN_R_0800` | Red Rainstorm Signal or above issued 8:00 a.m. onwards | Duty remains as usual. If there is adverse weather (e.g. raining), Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers. | The School will continue lessons until the end of normal school hours and will ensure conditions are safe before allowing students to return home. | special |

### Resolution logic

```ts
// All time comparisons in Asia/Hong_Kong. Never use the server's local timezone.

export function resolveArrangement(
  warnings: WarnSum,
  overrides: WeatherOverride,
  rules: Record<string, WeatherRule>
): Arrangement {
  // 1. Manual override always wins.
  if (overrides.manualActive && !isExpired(overrides))
    return withSource(rules[overrides.manualRuleKey], 'override', overrides.reason);

  // 2. Pre-No.8 is announcement-only; it cannot come from the API.
  if (overrides.preNo8) return withSource(rules.SUSPEND_TC8, 'override');

  // 3. Severity first — suspension conditions before caution conditions.
  const tc = activeType(warnings.WTCSGNL);
  if (['TC8NE','TC8SE','TC8NW','TC8SW','TC9','TC10'].includes(tc))
    return withSource(rules.SUSPEND_TC8, 'api');

  const rain = activeType(warnings.WRAIN);
  if (rain === 'WRAINR' || rain === 'WRAINB') {
    const t = hkMinutes(warnings.WRAIN.issueTime);   // minutes since midnight HKT
    if (t <  6 * 60) return withSource(rules.RAIN_R_0530, 'api');  // incl. before 5:30
    if (t <  8 * 60) return withSource(rules.RAIN_R_0600, 'api');
    return              withSource(rules.RAIN_R_0800, 'api');
  }

  // 4. Caution conditions, most severe first.
  if (tc === 'TC1' || tc === 'TC3') return withSource(rules.TC13, 'api');
  if (rain === 'WRAINA')            return withSource(rules.RAIN_A, 'api');
  if (active(warnings.WTS))         return withSource(rules.TS, 'api');
  if (active(warnings.WCOLD))       return withSource(rules.COLD, 'api');
  if (active(warnings.WHOT))        return withSource(rules.VHOT, 'api');

  return NORMAL;
}
```

Helper `active()` must treat `actionCode === 'CANCEL'` as inactive.

### Two behaviours that must be built in

**Signal in force before 5:30 a.m.** A Red signal issued at, say, 4:10 a.m. and still in force at 5:30 is not covered literally by the table. This spec defaults it to suspension (rule 7). Flag this on screen as "Interpreted rule — confirm with teacher-in-charge" until the school confirms.

**Stickiness.** Once a suspension arrangement has been shown for the day, it must not silently revert if HKO cancels the signal mid-morning. Hong Kong practice is that arrangements stand once announced. Persist the resolved arrangement for the day in a `dailyArrangement/{yyyy-mm-dd}` doc; once `severity === 'suspended'` is written, keep serving it for the rest of that day and label it **"Suspended for today"**, with the live signal shown separately underneath as current conditions.

### Display

- Sticky status banner at the top of `/` and `/portal`, with the left-edge stripe: green normal, yellow caution, red suspended, navy special.
- Card contents in order: severity label → condition name → **duty arrangement, largest text on the page** → HKO measure, smaller → issue time in DM Mono → source tag (`Live from HKO` / `Set by Head Prefect`).
- Poll `/api/weather` every 10 minutes via SWR. Show "Updated HH:MM" and a manual refresh button.
- If the API fails: show the last known good result with a "Last checked HH:MM — could not reach HKO" strip. Never show an empty or "unknown" state; a prefect at 6 a.m. needs an answer.
- `/portal/arrangements` renders all nine rules as a reference table, readable on a phone.

---

## 6. `/head` — Admin

Role-gated to `head`, `vice-head`, `teacher`. Tabbed layout, navy chrome, red reserved for destructive and override actions.

**Notices.** Create with title, body (markdown), priority, audience, publish time, expiry. Draft / scheduled / published / expired states. Edit, unpublish, delete. Read-receipt count. "Also send to WhatsApp" checkbox, available for Urgent only, with a confirmation dialog naming the recipient count.

**Weather override.** Two toggles: "Pre-No.8 announced" and "Manual override" (with rule picker, free-text reason, and required auto-expiry time). A live preview panel showing exactly what prefects currently see. Every change writes to the audit log and requires a typed confirmation, because it can cancel duty for the whole roster.

**Duty arrangement rules.** Editable table of the nine rules — condition name, duty arrangement, HKO measure, severity. Keys are not editable, since the resolution logic depends on them.

**Handbook.** Markdown editor with live preview, category assignment, publish/unpublish, drag-to-reorder, related-article picker, linked-scenario picker.

**Simulations.** Import/export scenario JSON, validate node graph (every `next` resolves, no orphan nodes, reachable end), publish toggle.

**Users & roles.** Roster table, role assignment, duty group, deactivate graduating prefects, CSV bulk import for a new intake.

**System.** Last successful HKO fetch and cache age, audit log with filters, site-wide banner.

---

## 7. Handbook UX

Model it on a help centre, not a document.

- **`/handbook`:** large search field first, then six category cards with article counts. Below: "Most read" list.
- **Search:** Fuse.js over `{title, summary, keywords}` with a prebuilt index; results appear as you type, grouped by category, keyboard navigable.
- **Article page:** breadcrumb → title → "Updated 12 Mar 2026" → body → "Was this helpful? Yes / No" → related articles → "Practise this in a simulation" if `linkedScenarioId` is set.
- **Sidebar:** category tree, sticky on desktop, bottom-sheet drawer on mobile.
- **Body rendering:** markdown plus three callout types (`:::note`, `:::important`, `:::warning`) mapping to navy / yellow / red stripes, numbered step lists, and collapsible `<details>` "See example" blocks.
- **Progress:** localStorage in v1 — "You've read 6 of 10 Getting Started articles." Move to Firestore per-user later.
- **Quick answers:** a pinned set of high-frequency questions on the handbook home, e.g. "A student refuses to give their name — what do I do?"

---

## 8. Simulation Player

Situation card → 2–4 choice buttons → immediate feedback on the chosen branch → next node → debrief.

- One choice per screen; no scrolling required to see all options on a phone.
- Feedback appears inline under the chosen option before advancing, with the stripe language: green for a sound call, yellow for workable but not ideal, red for unsafe.
- Debrief screen: score out of the branch maximum, a plain-language summary of the correct procedure, and a link back to the governing handbook article.
- Completion badges stored locally in v1.
- Emergency-mode styling for `fire`, `injury`, `security` categories: darker navy canvas, red stripe, DM Mono timestamps — visibly different from the calm handbook.

**Starter scenarios (build three):** fire alarm during recess; student injury on a staircase; Red Rainstorm hoisted at 6:40 a.m. while you are already travelling to school.

Content accuracy matters more than the engine here. Get the school's actual fire drill route and typhoon arrangements from the teacher-in-charge before writing scenario text — do not invent procedures.

---

## 9. Security

- **Firestore security rules are the access control, not the UI.** Hiding the `/head` link does nothing. Write rules first, test them with the emulator.
  - `notices`: read if signed in; write if `request.auth.token.role in ['head','vice-head','teacher']`.
  - `weatherOverride`, `weatherRules`, `users`, `handbookArticles`, `scenarios`: same write rule, read as appropriate.
  - `auditLog`: write-only from server, read for `head` and `teacher`.
- Roles as Firebase custom claims, set by a Cloud Function or admin script — never a client-writable field.
- `/api/notify` rate-limited to one broadcast per 10 minutes with a hard recipient cap, so a mis-click cannot spam 30 people.
- No student names, incidents, or disciplinary records stored anywhere in the system.
- Environment variables for all keys; nothing committed.

---

## 10. Build Order

Work in phases and stop for review at the end of each. Do not scaffold everything at once.

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Project setup, design tokens, component library, nav shell, Firebase Auth with role gating | A signed-in prefect sees the shell; `/head` is blocked for role `prefect` at the rules level, verified in the emulator |
| 2 | Weather engine: `/api/weather`, rule seed, resolution logic, unit tests for all nine rules and both edge cases, status banner, `/portal/arrangements` | All nine rules resolve correctly from mocked `warnsum` payloads; API failure shows last known good |
| 3 | `/head` notices CRUD + notice feed on `/portal` and `/` | Head can publish a notice and a prefect sees it, ordered by priority |
| 4 | `/head` weather override + audit log | Toggling Pre-No.8 changes the banner within one poll cycle and writes an audit entry |
| 5 | Handbook: schema, category and article pages, search, callouts, progress | Six categories, search returns results as you type, mobile drawer works |
| 6 | Simulations: schema, player, scoring, debrief, three scenarios | A scenario can be played end to end on a phone |
| 7 | `/head` handbook and simulation editors, user management, CSV import | Content can be edited without a redeploy |
| 8 | Mobile polish, PWA install, reduced-motion pass, keyboard pass, pilot with 5 prefects | Lighthouse ≥ 90 on mobile; pilot feedback logged |

---

## 11. Non-Negotiables

1. Red is only ever suspension, emergency, or destructive. Never decoration.
2. The weather engine must fail soft — a stale answer beats no answer.
3. Suspension arrangements are sticky for the day and never silently revert.
4. Firestore rules enforce roles; the UI only reflects them.
5. Every emergency procedure in the handbook and simulations must come from the school, not from the model. Where the source is unknown, mark it `TODO: confirm with teacher-in-charge` rather than writing plausible-sounding steps.
6. Everything must work one-handed on a phone at 6 a.m. in the rain.
