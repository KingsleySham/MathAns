// Pure decision logic for the prefect duty status widget (api/prefects/status.js
// and prefects/status.html). Shared with prefects/status/test.html, which imports
// this file directly in the browser so the simulator exercises the exact same
// duty-mapping code as production instead of a hand-copied reimplementation
// that could drift out of sync.
//
// Nothing here calls fetch(), touches KV, or reads the clock — every function
// takes its inputs as plain arguments, so it runs identically under Node and
// under a browser <script type="module">.

// Stations serving the school get an ETA threshold, since a slow train there
// actually changes when a prefect needs to leave (off-peak headways differ
// per line, hence per-line thresholds). The remaining lines have no
// threshold — they're checked at one representative station each purely for
// network-wide status (json.status === 0 / isdelay), so prefects get a
// heads-up on a citywide MTR problem even on a line they don't ride.
export const LINES = [
  { line: 'TWL', sta: 'SSP', label: 'Tsuen Wan Line', threshold: 8 },
  { line: 'TML', sta: 'NAC', label: 'Tuen Ma Line', threshold: 10 },
  { line: 'TCL', sta: 'NAC', label: 'Tung Chung Line', threshold: 12 },
  { line: 'AEL', sta: 'HOK', label: 'Airport Express' },
  { line: 'TKL', sta: 'TKO', label: 'Tseung Kwan O Line' },
  { line: 'EAL', sta: 'ADM', label: 'East Rail Line' },
  { line: 'SIL', sta: 'SOH', label: 'South Island Line' },
  { line: 'ISL', sta: 'CEN', label: 'Island Line' },
  { line: 'KTL', sta: 'KOT', label: 'Kwun Tong Line' },
  { line: 'DRL', sta: 'SUN', label: 'Disneyland Resort Line' },
];

export const DUTY_WINDOW = [6 * 60 + 30, 8 * 60 + 30];   // only run the ETA check 06:30–08:30
export const CUTOFF = 5 * 60 + 30;                        // 05:30 — suspension rule starts here

export const SUSPEND = new Set(['WRAINR', 'WRAINB', 'TC8NE', 'TC8SE', 'TC8NW', 'TC8SW', 'TC9', 'TC10']);

export const ADVISORY = {
  WHOT:   { text: 'Morning Assembly moves to homerooms or the Assembly Hall.', umbrella: false },
  WCOLD:  { text: 'Assembly moves indoors. Non-school jackets are allowed if a notice has been issued via eClass.', umbrella: false },
  WTS:    { text: 'Assembly moves indoors. Bring an umbrella in case of sudden showers.', umbrella: true },
  WRAINA: { text: 'Assembly moves indoors. Bring an umbrella in case of sudden showers.', umbrella: true },
  TC1:    { text: 'No change to duty — heads up only. If the weather is adverse, Assembly moves indoors.', umbrella: false },
  TC3:    { text: 'No change to duty — heads up only. If the weather is adverse, Assembly moves indoors.', umbrella: false },
};

export const SUSPEND_DETAIL =
  'All duties cancelled, no rescheduling. Classes suspended for the whole day. ' +
  'If you have not left for school, stay home. If you are already at school, remain there until it is safe to leave.';

export const NORMAL_DETAIL = 'Morning Duty at 7:45am. Morning Assembly outdoors as normal.';

// active: warnsum entries already filtered to actionCode !== 'CANCEL', each { code, name }
// minutes: minutes since HK midnight (0–1439)
// latch: { available, suspended, names } — the whole-day latch read from storage
export function classifyWeather(active, minutes, latch) {
  const afterCutoff = minutes >= CUTOFF;
  const suspendingNow = active.filter(w => SUSPEND.has(w.code)).map(w => w.name);
  const names = suspendingNow.length ? suspendingNow : latch.names;

  if ((suspendingNow.length && afterCutoff) || latch.suspended) {
    return {
      level: 'red',
      headline: 'Duty suspended — whole day',
      warnings: names,
      detail: SUSPEND_DETAIL + (suspendingNow.length ? '' : ' The signal has since been lowered, but the suspension stands for the whole day.'),
      latchAvailable: latch.available,
    };
  }

  const advisories = active.filter(w => ADVISORY[w.code]);
  if (advisories.length) {
    const umbrella = advisories.some(w => ADVISORY[w.code].umbrella);
    return {
      level: 'amber',
      headline: umbrella ? 'Duty as usual — bring an umbrella' : 'Duty as usual',
      warnings: advisories.map(w => w.name),
      detail: [...new Set(advisories.map(w => ADVISORY[w.code].text))].join(' '),
      latchAvailable: latch.available,
    };
  }

  return {
    level: 'green',
    headline: 'Duty as usual',
    warnings: [],
    detail: NORMAL_DETAIL,
    latchAvailable: latch.available,
  };
}

// cfg: one entry from LINES ({ line, sta, label, threshold })
// mtrResult: parsed JSON from getSchedule.php for that line+station, or null on fetch failure
// minutes: minutes since HK midnight
export function evaluateLine(cfg, mtrResult, minutes) {
  if (!mtrResult) return null;

  if (mtrResult.status === 0) {
    return { label: cfg.label, severity: 'red', reason: mtrResult.message || 'Special service arrangements in place.' };
  }

  const block = mtrResult.data && mtrResult.data[`${cfg.line}-${cfg.sta}`];
  if (!block) return null;

  if (block.isdelay === 'Y') {
    return { label: cfg.label, severity: 'amber', reason: 'MTR has flagged a delay on this line.' };
  }

  if (minutes < DUTY_WINDOW[0] || minutes > DUTY_WINDOW[1]) return null;

  // Only the lines serving the school carry a threshold, and only those get
  // their ETAs read at all: the rest are sampled at one representative station
  // purely for network-wide status, so an out-of-service platform on the
  // Disneyland Resort Line is not news to a prefect. (This was implicit before —
  // `worst >= undefined` is always false — and is now said out loud, because the
  // out-of-service check below would otherwise fire on all ten lines.)
  if (!cfg.threshold) return null;

  const waits = ['UP', 'DOWN']
    .flatMap(dir => (block[dir] || []).filter(t => String(t.seq) === '1'))
    .map(t => parseInt(t.ttnt, 10))
    .filter(Number.isFinite);

  // No seq=1 entries at all is a gap in the feed, not a statement about the
  // service — say nothing rather than guess.
  if (!waits.length) return null;

  // A reported ETA of zero means no train is timetabled, not one arriving this
  // instant: inside the 06:30–08:30 window the line is running, so a zero is the
  // feed saying this platform has nothing scheduled. It used to fall under the
  // threshold and read as "all fine", which is the opposite of the truth.
  const running = waits.filter(w => w > 0);
  if (!running.length) {
    return {
      label: cfg.label,
      severity: 'amber',
      reason: 'Out of service — no train times are being reported for this station.',
    };
  }

  const worst = Math.max(...running);
  if (worst >= cfg.threshold) {
    return { label: cfg.label, severity: 'amber', reason: `Next train ${worst} minutes away — longer than usual for this time.` };
  }
  return null;
}

export function summarizeTransport(alerts) {
  return {
    ok: alerts.length === 0,
    severity: alerts.some(a => a.severity === 'red') ? 'red' : alerts.length ? 'amber' : 'green',
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Reminders and this-week's-duty-roster: plain admin-edited content (see
// prefects/status/update.html), not derived from HKO/MTR. These sanitizers
// are the only thing standing between an admin-authenticated POST and what
// gets persisted, so they live here to be testable independent of KV/fetch.
// ---------------------------------------------------------------------------

export const MAX_REMINDERS = 8;
export const MAX_REMINDER_LEN = 240;
// A month calendar routinely holds more than a fortnight of duty days, and
// pruneRoster() keeps the stored array from growing without bound, so the cap
// is the sanity limit on one POST rather than "how far ahead you may plan".
export const MAX_ROSTER_DAYS = 70;
export const MAX_FIELD_LEN = 120;
export const MAX_NAMES = 10;

export function sanitizeReminders(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(r => String(r || '').trim())
    .filter(Boolean)
    .slice(0, MAX_REMINDERS)
    .map(r => r.slice(0, MAX_REMINDER_LEN));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEAM_RE = /^[ABC]$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

// `names` is kept even though the public status page no longer displays it —
// lib/prefect-messenger.js reads this same prefect:roster entry and matches
// entry.names against prefect:contacts to send the WhatsApp duty reminders,
// so dropping or renaming the field here would silently break that flow.
export function sanitizeRoster(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(entry => ({
      date: String(entry?.date || '').trim().slice(0, 10),
      location: String(entry?.location || '').trim().slice(0, MAX_FIELD_LEN),
      time: String(entry?.time || '').trim().slice(0, MAX_FIELD_LEN),
      team: TEAM_RE.test(String(entry?.team || '').trim().toUpperCase())
        ? String(entry.team).trim().toUpperCase()
        : '',
      names: Array.isArray(entry?.names)
        ? entry.names.map(n => String(n || '').trim()).filter(Boolean).slice(0, MAX_NAMES)
        : [],
      // Free text rather than an enum: the values are whatever the Notion Status
      // column offers ("On time", "Cancelled", …), and that list is the VHP's to
      // change without a deploy. Only CANCELLED_STATUS is given meaning here.
      status: String(entry?.status || '').trim().slice(0, 60),
      // Notion sync bookkeeping. Optional, so a roster saved before the sync
      // existed still validates — but they must survive this sanitizer, which
      // rebuilds every entry from scratch: losing notionPageId would unlink the
      // day from its Notion row and the next sync would duplicate it.
      ...(entry?.notionPageId ? { notionPageId: String(entry.notionPageId).trim().slice(0, 64) } : {}),
      ...(DATE_ISO_RE.test(String(entry?.updatedAt || '')) ? { updatedAt: String(entry.updatedAt) } : {}),
    }))
    .filter(entry => DATE_RE.test(entry.date))
    // Sort before truncating: the cap used to bite by array position, so a
    // roster carrying old rows could silently drop the day just added. Dates
    // are zero-padded ISO, so a plain string compare is a date compare.
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, MAX_ROSTER_DAYS);
}

// ---------------------------------------------------------------------------
// Admin settings — duty defaults and the retention window, stored under
// `prefect:settings`. `defaults` pre-fill new days on the calendar editor and
// stand in for blank fields in the WhatsApp templates; `retention` drives
// pruneRoster below.
// ---------------------------------------------------------------------------

export const MAX_RETENTION_DAYS = 90;

// ── Notion sync config ──────────────────────────────────────────────────────
// Lives here rather than in lib/prefect-notion-sync.js so that this module has
// no imports of its own: the sync module already depends on this one, and the
// reverse direction would make a cycle whose temporal dead zone would bite
// DEFAULT_SETTINGS below, which reads DEFAULT_NOTION_CONFIG at module load.

// Only three fields cross to Notion (VHP's spec, Aug 2026): the Date property
// carries the duty's date and time together, Status round-trips, and the page
// title is generated from the date. location/team/names stay hub-only — the
// database has no columns for them.
export const NOTION_PROP_KEYS = ['date', 'status', 'title'];

// props start empty rather than pre-filled with the current column names. The
// sanitizer treats blank as "not mapped", so seeding defaults here would mean an
// admin who deliberately clears a mapping gets it silently restored on the next
// save. Detect properties auto-picks by type instead, which is the same
// convenience without fighting the user.
export const DEFAULT_NOTION_CONFIG = {
  enabled: false,
  databaseId: '',
  props: { date: '', status: '', title: '' },
  statusOptions: [], // learned from the database, to offer in the day editor
  lastSync: null, // { at, pulled, pushed, archived, removed, error }
};

export function sanitizeNotionConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const props = raw.props && typeof raw.props === 'object' ? raw.props : {};
  const last = raw.lastSync && typeof raw.lastSync === 'object' ? raw.lastSync : null;
  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  const count = (v) => Math.max(0, Math.trunc(Number(v)) || 0);

  return {
    enabled: raw.enabled === true,
    databaseId: text(raw.databaseId, 200),
    props: Object.fromEntries(NOTION_PROP_KEYS.map((k) => [k, text(props[k], 200)])),
    statusOptions: Array.isArray(raw.statusOptions)
      ? [...new Set(raw.statusOptions.map((o) => text(o, 60)).filter(Boolean))].slice(0, 20)
      : [],
    lastSync: last && text(last.at, 40)
      ? {
        at: text(last.at, 40),
        pulled: count(last.pulled),
        pushed: count(last.pushed),
        archived: count(last.archived),
        removed: count(last.removed),
        error: text(last.error, 300),
      }
      : null,
  };
}

// A mapping is only usable once the date property is known — everything else can
// be blank, and a day with just a date still syncs (the duty defaults fill the rest).
export const isNotionConfigured = (cfg) =>
  Boolean(cfg?.enabled && cfg.databaseId && cfg.props?.date);

// The one status the rest of the system acts on: a cancelled duty is still a row
// on the roster and still shows on the calendar, but nobody is told to turn up
// for it. Everything else ("Tentative", "Special", …) behaves as a normal duty.
export const CANCELLED_STATUS = 'cancelled';
export const isCancelled = (entry) =>
  String(entry?.status || '').trim().toLowerCase() === CANCELLED_STATUS;

export const DEFAULT_SETTINGS = {
  defaults: { location: '', time: '', team: '' },
  retention: { enabled: true, days: 7 },
  lastPurge: null, // { at: ISO string, removed: number } once a purge has run
  // Notion sync config. The property mapping and database id live here; the
  // NOTION_TOKEN credential deliberately does not — it stays an env var.
  notion: DEFAULT_NOTION_CONFIG,
};

// Same contract as sanitizeRoster: the only guard between an admin-authenticated
// POST and Redis. Unknown keys are dropped rather than merged through.
export function sanitizeSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const defaults = raw.defaults && typeof raw.defaults === 'object' ? raw.defaults : {};
  const retention = raw.retention && typeof raw.retention === 'object' ? raw.retention : {};
  const lastPurge = raw.lastPurge && typeof raw.lastPurge === 'object' ? raw.lastPurge : null;

  const days = Math.trunc(Number(retention.days));

  return {
    defaults: {
      location: String(defaults.location || '').trim().slice(0, MAX_FIELD_LEN),
      time: String(defaults.time || '').trim().slice(0, MAX_FIELD_LEN),
      team: TEAM_RE.test(String(defaults.team || '').trim().toUpperCase())
        ? String(defaults.team).trim().toUpperCase()
        : '',
    },
    retention: {
      enabled: retention.enabled !== false,
      days: Number.isFinite(days)
        ? Math.min(Math.max(days, 0), MAX_RETENTION_DAYS)
        : DEFAULT_SETTINGS.retention.days,
    },
    lastPurge: lastPurge && DATE_ISO_RE.test(String(lastPurge.at || ''))
      ? { at: String(lastPurge.at), removed: Math.max(0, Math.trunc(Number(lastPurge.removed)) || 0) }
      : null,
    notion: sanitizeNotionConfig(raw.notion),
  };
}

// Splits a roster into what is still to come and what has already happened.
// `past` is the archive the update page shows collapsed — those entries are
// still stored, and still readable, until pruneRoster removes them.
export function splitRoster(roster, todayDateStr) {
  const list = Array.isArray(roster) ? roster : [];
  return {
    upcoming: list.filter(r => r.date >= todayDateStr),
    past: list.filter(r => r.date < todayDateStr),
  };
}

// Drops duty days that ended more than `retention.days` ago.
//
// The cutoff is today minus the retention window, and entries are removed only
// when strictly before it — so with any days >= 0 the cutoff never reaches
// today, and the purge can never delete the entry the 06:00 HK morning check
// is about to read. days: 0 means "gone the moment the day is over".
export function pruneRoster(roster, todayDateStr, retention) {
  const list = Array.isArray(roster) ? roster : [];
  const { enabled, days } = { ...DEFAULT_SETTINGS.retention, ...(retention || {}) };
  if (enabled === false || !DATE_RE.test(String(todayDateStr || ''))) {
    return { kept: list, removed: [] };
  }

  const cutoff = addDaysToDateStr(todayDateStr, -Math.min(Math.max(Math.trunc(days) || 0, 0), MAX_RETENTION_DAYS));
  return {
    kept: list.filter(r => r.date >= cutoff),
    removed: list.filter(r => r.date < cutoff),
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// dateStr: "YYYY-MM-DD" -> "Mon 22 June". Parsed as UTC so the label can't
// shift a day depending on the reader's local timezone.
export function formatDayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function addDaysToDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// roster: sanitized roster array. todayDateStr: "YYYY-MM-DD" (HK calendar date).
// Returns null if nothing is scheduled today or later, else the nearest
// upcoming entry plus display fields: `label` ("Mon 22 June"), `relative`
// ("Today" | "Tomorrow" | null), and `soon` (true for Today/Tomorrow — the
// cue for the blue "coming up" styling vs. the neutral default).
export function nextDuty(roster, todayDateStr) {
  const upcoming = roster
    .filter(r => r.date >= todayDateStr)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!upcoming.length) return null;

  const entry = upcoming[0];
  const tomorrowDateStr = addDaysToDateStr(todayDateStr, 1);
  const relative = entry.date === todayDateStr ? 'Today' : entry.date === tomorrowDateStr ? 'Tomorrow' : null;

  return { ...entry, label: formatDayLabel(entry.date), relative, soon: relative !== null };
}
