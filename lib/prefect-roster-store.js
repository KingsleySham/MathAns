// Redis I/O for the duty roster and the admin settings that govern it.
//
//   prefect:roster    [{ date, location, time, team, names }]  — no TTL
//   prefect:settings  { defaults, retention, lastPurge }       — no TTL
//
// Both are plain admin-edited content written by prefects/status/update.html,
// not derived from HKO/MTR. They live here rather than inside api/prefects/
// status.js because the daily purge also has to run from the WhatsApp cron
// (api/whatsapp/tasks.js), and two copies of these key names is one too many.
//
// Every read fails soft — a Redis outage degrades the page to "no roster"
// rather than failing the whole status response. The decisions themselves are
// pure functions in lib/prefect-duty-status-logic.js, unit-tested without Redis.

import { getRedisClient } from './prefect-redis-client.js';
import {
  DEFAULT_SETTINGS, MAX_ROSTER_DAYS, addDaysToDateStr, isNotionConfigured,
  pruneRoster, sanitizeRoster, sanitizeSettings,
} from './prefect-duty-status-logic.js';
import { archiveDuty, createDuty, describeDatabase, queryDuties, updateDuty } from './prefect-notion.js';
import { entryToNotionProps, notionPageToEntry, reconcile, sanitizeSeen } from './prefect-notion-sync.js';

const ROSTER_KEY = 'prefect:roster';
const SETTINGS_KEY = 'prefect:settings';
// Notion page ids linked at the end of the last sync. Its own key rather than a
// field on settings, because settings are served on the public status endpoint.
const SEEN_KEY = 'prefect:notion-seen';

export async function readRoster() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(ROSTER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function writeRoster(list) {
  try {
    const redis = await getRedisClient();
    await redis.set(ROSTER_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export async function readSettings() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    // Falls back to retention ON but nothing gets purged — purging needs the
    // same Redis that just failed, so this can only ever under-delete.
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(settings) {
  try {
    const redis = await getRedisClient();
    await redis.set(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Automatic clean-up of ended duties.
//
// prefect:roster is one array rather than a key per day, so it cannot carry a
// TTL the way prefect:duty:{date} does — expiry has to be explicit. This runs
// on every uncached GET of the status endpoint and on every admin save, plus
// once per cron so a quiet week still gets cleaned. Idempotent, and it writes
// only when something actually goes.
//
// `settings` is returned stamped with the purge so the update page can show
// "Last purge: …". If the roster write fails the stamp is not saved, so the
// page never claims a clean-up that did not land.
// ---------------------------------------------------------------------------

export async function purgeEndedDuties(roster, settings, todayDateStr) {
  const { kept, removed } = pruneRoster(roster, todayDateStr, settings.retention);
  if (!removed.length) return { roster, settings, removed: 0 };

  if (!(await writeRoster(kept))) return { roster, settings, removed: 0 };

  const stamped = { ...settings, lastPurge: { at: new Date().toISOString(), removed: removed.length } };
  await writeSettings(stamped);
  return { roster: kept, settings: stamped, removed: removed.length };
}

// ---------------------------------------------------------------------------
// Two-way sync with a Notion database.
//
// Orchestration only: the mapping and the who-wins rules are pure functions in
// lib/prefect-notion-sync.js, and the HTTP is lib/prefect-notion.js.
//
// The window is [today, today + MAX_ROSTER_DAYS] and everything outside it is
// untouched on both sides. That is what keeps purgeEndedDuties above — which
// deletes ended duty days — from ever reaching the VHP's Notion history.
//
// Notion writes are attempted one page at a time and a failure on any single
// page is collected rather than thrown: a permission problem on one row should
// not cost the whole sync. The hub side is written once, at the end.
// ---------------------------------------------------------------------------

export async function readSeen() {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(SEEN_KEY);
    return sanitizeSeen(raw ? JSON.parse(raw) : null);
  } catch {
    return [];
  }
}

async function writeSeen(ids) {
  try {
    const redis = await getRedisClient();
    await redis.set(SEEN_KEY, JSON.stringify(sanitizeSeen(ids)));
    return true;
  } catch {
    return false;
  }
}

export async function syncWithNotion(todayDateStr) {
  const [storedRoster, settings, seen] = await Promise.all([readRoster(), readSettings(), readSeen()]);
  const cfg = settings.notion;
  if (!isNotionConfigured(cfg)) {
    return { ok: false, error: 'Notion sync is not configured — set the database and date property first.' };
  }

  const horizon = addDaysToDateStr(todayDateStr, MAX_ROSTER_DAYS);
  const { properties } = await describeDatabase(cfg.databaseId);
  const types = Object.fromEntries(properties.map((p) => [p.name, p.type]));

  const pages = await queryDuties(cfg.databaseId, cfg.props.date, todayDateStr, horizon);
  const notionEntries = pages.map((p) => notionPageToEntry(p, cfg.props)).filter(Boolean);

  const { hubNext, toCreate, toUpdate, toArchive, removed, seenNext } =
    reconcile(storedRoster, notionEntries, todayDateStr, horizon, seen);

  const failures = [];
  const created = [];
  let pushed = 0;
  let archived = 0;

  for (const entry of toCreate) {
    try {
      const page = await createDuty(cfg.databaseId, entryToNotionProps(entry, cfg.props, types));
      // Link the new page back so the next run pairs on id rather than date,
      // and remember it, or the run after would read the row as a fresh
      // Notion-side addition.
      const target = hubNext.find((e) => e === entry) || hubNext.find((e) => e.date === entry.date);
      if (target) target.notionPageId = page.id;
      created.push(page.id);
      pushed += 1;
    } catch (e) {
      failures.push(`create ${entry.date}: ${e.message}`);
    }
  }

  for (const entry of toUpdate) {
    try {
      await updateDuty(entry.notionPageId, entryToNotionProps(entry, cfg.props, types));
      pushed += 1;
    } catch (e) {
      failures.push(`update ${entry.date}: ${e.message}`);
    }
  }

  const archivedOk = [];
  for (const pageId of toArchive) {
    try {
      await archiveDuty(pageId);
      archivedOk.push(pageId);
      archived += 1;
    } catch (e) {
      // Leave a failed archive in `seen` so the next run tries again, rather
      // than forgetting the page and re-importing the row as a new duty day.
      failures.push(`archive ${pageId}: ${e.message}`);
    }
  }

  // sanitizeRoster re-applies the field caps and the 70-day truncation to
  // whatever Notion supplied — it is untrusted input like any admin POST.
  const roster = sanitizeRoster(hubNext);
  const rosterOk = await writeRoster(roster);

  if (rosterOk) {
    const stillPending = toArchive.filter((id) => !archivedOk.includes(id));
    await writeSeen([...seenNext, ...created, ...stillPending]);
  }

  const lastSync = {
    at: new Date().toISOString(),
    pulled: notionEntries.length,
    pushed,
    archived,
    removed,
    error: failures.length ? failures.slice(0, 3).join('; ') : (rosterOk ? '' : 'Could not write the roster to Redis'),
  };
  const nextSettings = { ...settings, notion: { ...cfg, lastSync } };
  await writeSettings(nextSettings);

  return { ok: rosterOk, roster, settings: nextSettings, ...lastSync };
}
