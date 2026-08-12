// Mapping and reconciliation for the two-way duty-roster ↔ Notion sync.
//
// Pure functions only — no Redis, no fetch — so the rules that decide what gets
// written and what gets deleted are unit-testable on their own. The I/O lives in
// lib/prefect-notion.js (Notion) and lib/prefect-roster-store.js (Redis), the
// same split as lib/prefect-duty-status-logic.js versus the store.
//
// THE ONE INVARIANT WORTH PROTECTING
//
// Every operation is confined to the window [today, horizon]. The roster carries
// an automatic clean-up that deletes ended duty days; without the window those
// deletions would propagate into Notion and destroy the VHP's history, and the
// past rows that survived in Notion would be re-imported on the next sync only to
// be purged again — churn on every run, in both directions. Anything outside the
// window is left alone on both sides. The tests assert this explicitly.

// WHAT THE SYNC CARRIES, AND WHAT IT MUST NOT TOUCH
//
// Three fields cross the boundary (VHP's spec, Aug 2026):
//
//   Notion title  ←  "9/9 Prefect Duty", generated from the date (write-only)
//   Notion Date   ↔  the duty's date AND time, as one datetime
//   Notion Status ↔  the duty's status, e.g. "On time" / "Cancelled"
//
// `location`, `team` and `names` are deliberately NOT synced — the Notion
// database has no columns for them. That makes them hub-only, and it is why the
// merge below writes Notion's fields INTO the existing entry rather than
// replacing it: a sync that swapped the whole row would silently wipe the very
// names the WhatsApp reminders match against.
//
// The config sanitizer and DEFAULT_NOTION_CONFIG live in prefect-duty-status-logic.js
// with the other sanitizers — importing them back from here would make a cycle.
import { MAX_FIELD_LEN } from './prefect-duty-status-logic.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max = MAX_FIELD_LEN) => String(v ?? '').trim().slice(0, max);

// Hong Kong is UTC+8 all year — no DST — so a fixed offset is correct here and
// avoids dragging in a timezone library for one field.
const HK_OFFSET = '+08:00';

// ---------------------------------------------------------------------------
// Duty time ↔ Notion datetime.
//
// The roster stores time as the free text the VHP types ("7:45am"), because that
// string goes straight into the WhatsApp templates. Notion wants it as part of
// the Date value. These two convert between them, and both fail soft: an
// unparseable time means a date-only Notion value rather than a rejected write.
// ---------------------------------------------------------------------------

export function parseDutyTime(text) {
  const m = String(text || '').trim().toLowerCase().match(/^(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?$/);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const suffix = m[3];

  if (minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'pm') hour = hour === 12 ? 12 : hour + 12;
    else hour = hour === 12 ? 0 : hour; // 12am is midnight
  } else if (hour > 23) return null;

  return { hour, minute };
}

// Back to the roster's own wording, so a time that arrived from Notion reads the
// same as one the VHP typed.
export function formatDutyTime({ hour, minute }) {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, '0')}${suffix}`;
}

// "2026-09-02" + "7:45am" → "2026-09-02T07:45:00.000+08:00" (or date-only).
export function toNotionDate(date, time) {
  const parsed = parseDutyTime(time);
  if (!parsed) return { start: date };
  const hh = String(parsed.hour).padStart(2, '0');
  const mm = String(parsed.minute).padStart(2, '0');
  return { start: `${date}T${hh}:${mm}:00.000${HK_OFFSET}` };
}

// The inverse. Anything with a time is converted to Hong Kong first, so a value
// entered in another timezone still lands on the right duty day.
export function fromNotionDate(start) {
  const raw = String(start || '');
  if (!raw) return { date: '', time: '' };
  if (!raw.includes('T')) {
    const date = raw.slice(0, 10);
    return { date: DATE_RE.test(date) ? date : '', time: '' };
  }

  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return { date: raw.slice(0, 10), time: '' };

  const hk = new Date(ms + 8 * 3600 * 1000);
  return {
    date: hk.toISOString().slice(0, 10),
    time: formatDutyTime({ hour: hk.getUTCHours(), minute: hk.getUTCMinutes() }),
  };
}

// The house convention for the page title, matching the rows already in the
// database ("2/9 Prefect Duty"): day and month, no leading zeros.
export function dutyPageTitle(date) {
  if (!DATE_RE.test(String(date || ''))) return 'Prefect Duty';
  const [, month, day] = date.split('-');
  return `${Number(day)}/${Number(month)} Prefect Duty`;
}

// ---------------------------------------------------------------------------
// Reading a Notion page into a roster entry.
//
// Property types are whatever the admin picked in Notion, so every reader is
// permissive: the wrong type yields '' rather than throwing, and the day still
// syncs on its date alone.
// ---------------------------------------------------------------------------

const richText = (rich) => (Array.isArray(rich) ? rich.map((t) => t?.plain_text || '').join('') : '');

function readText(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title': return richText(prop.title);
    case 'rich_text': return richText(prop.rich_text);
    case 'select': return prop.select?.name || '';
    case 'status': return prop.status?.name || '';
    case 'number': return prop.number == null ? '' : String(prop.number);
    case 'formula': return prop.formula?.string || (prop.formula?.number ?? '') + '';
    case 'multi_select': return (prop.multi_select || []).map((o) => o?.name || '').filter(Boolean).join(', ');
    default: return '';
  }
}

export function notionPageToEntry(page, props) {
  const p = page?.properties || {};
  const pick = (key) => (props?.[key] ? p[props[key]] : undefined);

  const dateProp = pick('date');
  const { date, time } = dateProp?.type === 'date'
    ? fromNotionDate(dateProp.date?.start)
    : fromNotionDate(readText(dateProp));

  if (!DATE_RE.test(date)) return null; // undated rows are not duty days

  return {
    date,
    time,
    status: str(readText(pick('status')), 60),
    notionPageId: String(page?.id || ''),
    notionEditedAt: String(page?.last_edited_time || ''),
  };
}

// ---------------------------------------------------------------------------
// Writing a roster entry back to Notion properties.
//
// Only mapped properties are sent, and the shape has to match the property's own
// type or Notion rejects the whole page write — hence the type lookup rather
// than assuming rich_text everywhere.
// ---------------------------------------------------------------------------

const textValue = (type, value) => {
  const content = [{ type: 'text', text: { content: String(value ?? '').slice(0, 2000) } }];
  switch (type) {
    case 'title': return { title: content };
    case 'rich_text': return { rich_text: content };
    case 'select': return { select: value ? { name: String(value) } : null };
    case 'status': return { status: value ? { name: String(value) } : null };
    case 'number': return { number: Number(value) || null };
    default: return null; // unwritable type (formula, rollup) — skip it
  }
};

export function entryToNotionProps(entry, props, types = {}) {
  const out = {};
  const typeOf = (name) => types[name] || 'rich_text';

  // Date carries the time too, so a duty at 7:45am reads as one value in Notion.
  if (props?.date) out[props.date] = { date: toNotionDate(entry.date, entry.time) };

  // Title is generated, never read back — Notion is not where the wording is
  // decided, and a row renamed by hand keeps its name until its date changes.
  if (props?.title) {
    const value = textValue(typeOf(props.title), dutyPageTitle(entry.date));
    if (value) out[props.title] = value;
  }

  // Status only when the duty has one: sending an empty status would clear a
  // value the VHP set in Notion on a day the hub knows nothing about.
  if (props?.status && entry.status) {
    const value = textValue(typeOf(props.status), entry.status);
    if (value) out[props.status] = value;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Reconciliation.
//
// `seen` is the set of Notion page ids that were linked at the END of the last
// sync, persisted separately (prefect:notion-seen). Without it a deletion cannot
// be told apart from an addition: when the admin deletes a duty day in the
// editor it is already gone from the stored roster by the time this runs, so the
// row still sitting in Notion looks exactly like a brand-new one and would be
// added straight back. `seen` is what makes a hub-side deletion stick.
//
//   in Notion only, id NOT in seen .......... new there → add to the hub
//   in Notion only, id IN seen .............. deleted here → archive in Notion
//   in hub only, no page id ................. never synced → create in Notion
//   in hub only, id IN seen ................. deleted there → drop from the hub
//   in hub only, id not in seen ............. sync state lost → leave alone
//   in both ................................. newer timestamp wins
//   outside [today, horizon] ................ untouched, both sides
//
// Equal or unreadable timestamps write nothing. A sync that cannot tell which
// side is newer should do nothing rather than guess — guessing here means an
// edit ping-ponging between the two systems forever.
// ---------------------------------------------------------------------------

// Only the fields that actually cross the boundary. Comparing location, team or
// names here would make every hub-side edit to them look like a change Notion
// needs to hear about, and every sync would push a pointless update.
export const SYNCED_FIELDS = ['date', 'time', 'status'];

export function entryDiffers(a, b) {
  return SYNCED_FIELDS.some((f) => (a?.[f] || '') !== (b?.[f] || ''));
}

// Notion winning a conflict means it wins the THREE fields it carries — never
// the whole row. location, team and names exist only in the hub, and replacing
// the entry wholesale would wipe the names the WhatsApp reminders match on.
const mergeFromNotion = (hubEntry, notionEntry) => ({
  ...hubEntry,
  date: notionEntry.date,
  time: notionEntry.time,
  status: notionEntry.status,
  notionPageId: notionEntry.notionPageId,
  updatedAt: notionEntry.notionEditedAt,
});

const time = (v) => {
  const t = Date.parse(v || '');
  return Number.isNaN(t) ? null : t;
};

export function reconcile(hubRoster, notionEntries, today, horizon, seenIds = []) {
  const hub = (Array.isArray(hubRoster) ? hubRoster : []).filter((e) => e?.date);
  const notion = (Array.isArray(notionEntries) ? notionEntries : []).filter(Boolean);
  const seen = new Set(seenIds || []);

  const inWindow = (d) => d >= today && d <= horizon;

  // Everything outside the window passes through untouched — this is the rule
  // that keeps the roster purge away from Notion history.
  const untouched = hub.filter((e) => !inWindow(e.date));
  const hubIn = hub.filter((e) => inWindow(e.date));
  const notionIn = notion.filter((e) => inWindow(e.date));

  const byPageId = new Map(notionIn.filter((e) => e.notionPageId).map((e) => [e.notionPageId, e]));
  const byDate = new Map();
  for (const e of notionIn) if (!byDate.has(e.date)) byDate.set(e.date, e);

  const kept = [];
  const toCreate = [];
  const toUpdate = [];
  const toArchive = [];
  const claimed = new Set();
  let removed = 0;

  for (const entry of hubIn) {
    const match = (entry.notionPageId && byPageId.get(entry.notionPageId))
      || (!entry.notionPageId && byDate.get(entry.date));

    if (!match) {
      if (!entry.notionPageId) {
        toCreate.push(entry);
        kept.push(entry);
      } else if (seen.has(entry.notionPageId)) {
        // Was linked at the last sync and Notion no longer returns it: the row
        // was deleted there. Deletions propagate, so drop it here too.
        removed += 1;
      } else {
        // Linked, but we have no record of ever syncing it — most likely the
        // sync state was lost. Keep it and touch nothing; re-linking on a later
        // run is recoverable, deleting on a guess is not.
        kept.push(entry);
      }
      continue;
    }

    claimed.add(match.notionPageId);

    const hubAt = time(entry.updatedAt);
    const notionAt = time(match.notionEditedAt);
    const differs = entryDiffers(entry, match);

    if (!differs) {
      kept.push({ ...entry, notionPageId: match.notionPageId });
    } else if (hubAt != null && notionAt != null && hubAt > notionAt) {
      toUpdate.push({ ...entry, notionPageId: match.notionPageId });
      kept.push({ ...entry, notionPageId: match.notionPageId });
    } else if (notionAt != null && (hubAt == null || notionAt > hubAt)) {
      kept.push(mergeFromNotion(entry, match));
    } else {
      // Same instant, or neither side readable — leave both as they are.
      kept.push({ ...entry, notionPageId: match.notionPageId });
    }
  }

  for (const entry of notionIn) {
    if (claimed.has(entry.notionPageId)) continue;
    if (seen.has(entry.notionPageId)) {
      // Synced before, and the hub no longer has it: the admin deleted this day
      // in the editor. Archive it in Notion rather than resurrecting it here.
      toArchive.push(entry.notionPageId);
    } else {
      // Brand new in Notion. location/team/names start empty and are filled in
      // the editor (or by the duty defaults when the reminders go out).
      kept.push(mergeFromNotion({ location: '', team: '', names: [] }, entry));
    }
  }

  const hubNext = [...untouched, ...kept]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    hubNext,
    toCreate,
    toUpdate,
    toArchive,
    removed,
    // The page ids linked after this run, persisted as the next run's `seen`.
    // Pages created during this run are appended by the caller, once Notion has
    // returned their ids.
    seenNext: hubNext.map((e) => e.notionPageId).filter(Boolean),
  };
}

// Stamps `updatedAt` on the days that genuinely changed in an admin save, by
// diffing against what was stored. The hub's half of last-write-wins.
//
// Two things it also protects: an unchanged day keeps its ORIGINAL stamp, so
// merely opening the editor and pressing Save cannot make the hub win every
// conflict; and a day's notionPageId is restored from the stored copy if the
// client did not send it back, so a page link can't be dropped by the round trip.
export function stampUpdatedAt(next, previous, nowIso) {
  const before = new Map();
  for (const e of previous || []) {
    if (e?.date) before.set(e.notionPageId || e.date, e);
  }

  return (next || []).map((entry) => {
    const prior = before.get(entry.notionPageId || entry.date);
    if (!prior) return { ...entry, updatedAt: nowIso };

    const linked = prior.notionPageId ? { notionPageId: prior.notionPageId, ...entry } : entry;
    return entryDiffers(entry, prior)
      ? { ...linked, updatedAt: nowIso }
      : { ...linked, ...(prior.updatedAt ? { updatedAt: prior.updatedAt } : {}) };
  });
}

// Sync state: the Notion page ids linked at the end of a run, stored under
// prefect:notion-seen and fed back into the next reconcile() as `seen`. Kept out
// of prefect:settings deliberately — settings are served on the public status
// endpoint, and page ids are internal.
export function sanitizeSeen(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => String(v || '').trim()).filter(Boolean))].slice(0, 500);
}
