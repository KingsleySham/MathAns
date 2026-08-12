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

// The config sanitizer and DEFAULT_NOTION_CONFIG live in prefect-duty-status-logic.js
// with the other sanitizers — importing them back from here would make a cycle.
import { MAX_FIELD_LEN, MAX_NAMES } from './prefect-duty-status-logic.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEAM_RE = /^[ABC]$/;

const str = (v, max = MAX_FIELD_LEN) => String(v ?? '').trim().slice(0, max);

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

function readNames(prop) {
  if (!prop) return [];
  switch (prop.type) {
    case 'multi_select': return (prop.multi_select || []).map((o) => o?.name || '');
    // People gives Notion account names, which usually do NOT match the WhatsApp
    // contact list — the sync still reads them, and the settings pane warns.
    case 'people': return (prop.people || []).map((p) => p?.name || '');
    case 'relation': return []; // would need a second fetch per row; not worth it
    default: return readText(prop).split(',');
  }
}

function readDate(prop) {
  if (!prop) return '';
  const raw = prop.type === 'date' ? prop.date?.start : readText(prop);
  const value = String(raw || '').slice(0, 10);
  return DATE_RE.test(value) ? value : '';
}

export function notionPageToEntry(page, props) {
  const p = page?.properties || {};
  const pick = (key) => (props?.[key] ? p[props[key]] : undefined);

  const date = readDate(pick('date'));
  if (!date) return null; // undated rows are not duty days

  const team = readText(pick('team')).trim().toUpperCase().slice(0, 1);

  return {
    date,
    location: str(readText(pick('location'))),
    time: str(readText(pick('time'))),
    team: TEAM_RE.test(team) ? team : '',
    names: readNames(pick('names')).map((n) => str(n, 80)).filter(Boolean).slice(0, MAX_NAMES),
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

  if (props?.date) out[props.date] = { date: { start: entry.date } };

  for (const key of ['location', 'time', 'team']) {
    const name = props?.[key];
    if (!name) continue;
    const value = textValue(typeOf(name), entry[key] || '');
    if (value) out[name] = value;
  }

  if (props?.names) {
    const type = typeOf(props.names);
    const names = entry.names || [];
    if (type === 'multi_select') out[props.names] = { multi_select: names.map((n) => ({ name: n })) };
    else if (type === 'people') { /* cannot resolve contact names to Notion users — leave alone */ }
    else {
      const value = textValue(type, names.join(', '));
      if (value) out[props.names] = value;
    }
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

const FIELDS = ['date', 'location', 'time', 'team'];

export function entryDiffers(a, b) {
  if (FIELDS.some((f) => (a?.[f] || '') !== (b?.[f] || ''))) return true;
  const an = a?.names || [];
  const bn = b?.names || [];
  return an.length !== bn.length || an.some((n, i) => n !== bn[i]);
}

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
      kept.push({ ...match, updatedAt: match.notionEditedAt });
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
      kept.push({ ...entry, updatedAt: entry.notionEditedAt });
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
