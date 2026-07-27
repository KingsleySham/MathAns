// Prefect Hub weather engine — the single source of truth for how Hong Kong
// Observatory warnings map to St. Margaret's prefect duty arrangements.
//
// Dependency-free ESM so it can be used unchanged by:
//   - api/weather.js          (the serverless HKO proxy)
//   - prefect-hub-app         (build-time rule table generation)
//   - prefect-hub-app/tests   (unit tests)
//
// Types live alongside in prefect-weather.d.ts.

const SUSPENDED_DUTY =
  '**All duties suspended and cancelled.** WhatsApp message will be sent regarding the suspension. Rescheduling will not be made.';

const SUSPENDED_MEASURE =
  'All classes suspended for the day. Students who have not left for school should stay home. Students already at school remain until it is safe to return home.';

const USUAL_MEASURE = 'School operates as usual unless advised otherwise.';

// The school's arrangement table. Wording becomes Firestore-editable in a
// later phase; the keys never change, because resolution depends on them.
export const WEATHER_RULES_SEED = {
  VHOT: {
    order: 1,
    key: 'VHOT',
    condition: 'Very Hot Weather Warning',
    dutyArrangement: 'Morning Assembly held inside Homerooms or Assembly Hall.',
    hkoMeasure: USUAL_MEASURE,
    severity: 'caution',
  },
  COLD: {
    order: 2,
    key: 'COLD',
    condition: 'Cold Weather Warning',
    dutyArrangement:
      'Morning Assembly held inside Homerooms or Assembly Hall. Students may wear additional non-school jackets, including down jackets, if notified via eClass or during cold weather conditions.',
    hkoMeasure: USUAL_MEASURE,
    severity: 'caution',
  },
  TS: {
    order: 3,
    key: 'TS',
    condition: 'Thunderstorm Warning',
    dutyArrangement:
      'Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers.',
    hkoMeasure: USUAL_MEASURE,
    severity: 'caution',
  },
  TC13: {
    order: 4,
    key: 'TC13',
    condition: 'Tropical Cyclone Warning Signal No. 1 or No. 3',
    dutyArrangement:
      'If there is adverse weather (e.g. raining), Morning Assembly held inside Homerooms or Assembly Hall.',
    hkoMeasure: USUAL_MEASURE,
    severity: 'caution',
  },
  RAIN_A: {
    order: 5,
    key: 'RAIN_A',
    condition: 'Amber Rainstorm Warning Signal',
    dutyArrangement:
      'Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers.',
    hkoMeasure: USUAL_MEASURE,
    severity: 'caution',
  },
  SUSPEND_TC8: {
    order: 6,
    key: 'SUSPEND_TC8',
    condition: 'Pre-No.8 / Tropical Cyclone Signal No. 8 or above',
    dutyArrangement: SUSPENDED_DUTY,
    hkoMeasure: SUSPENDED_MEASURE,
    severity: 'suspended',
  },
  RAIN_R_0530: {
    order: 7,
    key: 'RAIN_R_0530',
    condition: 'Red Rainstorm Signal or above issued 5:30–6:00 a.m.',
    dutyArrangement: SUSPENDED_DUTY,
    hkoMeasure: SUSPENDED_MEASURE,
    severity: 'suspended',
  },
  RAIN_R_0600: {
    order: 8,
    key: 'RAIN_R_0600',
    condition: 'Red Rainstorm Signal or above issued 6:00–8:00 a.m.',
    dutyArrangement: SUSPENDED_DUTY,
    hkoMeasure: SUSPENDED_MEASURE,
    severity: 'suspended',
  },
  RAIN_R_0800: {
    order: 9,
    key: 'RAIN_R_0800',
    condition: 'Red Rainstorm Signal or above issued 8:00 a.m. onwards',
    dutyArrangement:
      'Duty remains as usual. If there is adverse weather (e.g. raining), Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers.',
    hkoMeasure:
      'The School will continue lessons until the end of normal school hours and will ensure conditions are safe before allowing students to return home.',
    severity: 'special',
  },
};

export const WEATHER_RULES_ORDERED = Object.values(WEATHER_RULES_SEED).sort(
  (a, b) => a.order - b.order
);

// All time comparisons in Asia/Hong_Kong. Never the server's local timezone.
const HK_TZ = 'Asia/Hong_Kong';

export const INTERPRETED_NOTE = 'Interpreted rule — confirm with teacher-in-charge';

const TC8_PLUS = ['TC8NE', 'TC8SE', 'TC8NW', 'TC8SW', 'TC9', 'TC10'];

export const NORMAL_ARRANGEMENT = {
  ruleKey: 'NORMAL',
  severity: 'normal',
  condition: 'No weather warnings in force',
  dutyArrangement: 'Morning duty runs as usual.',
  hkoMeasure: 'School operates as usual.',
  source: 'normal',
};

export const NO_OVERRIDE = {
  preNo8: false,
  manualActive: false,
  manualRuleKey: null,
};

/** A warning entry counts as active unless missing or cancelled. */
export function active(entry) {
  if (!entry) return false;
  if ((entry.actionCode ?? '').toUpperCase() === 'CANCEL') return false;
  return !!(entry.code ?? entry.type ?? entry.name);
}

/** Subtype code of an active warning ('' when inactive/missing). */
export function activeType(entry) {
  if (!active(entry)) return '';
  return (entry?.code ?? entry?.type ?? '').toUpperCase();
}

/** Minutes since midnight in Hong Kong for an ISO time; null if unparseable. */
export function hkMinutes(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h % 24) * 60 + m;
}

/** yyyy-mm-dd in Hong Kong — the key for per-day suspension stickiness. */
export function hkDateKey(at = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

function isOverrideExpired(o, now) {
  return o.expiresAt != null && now >= o.expiresAt;
}

function fromRule(rule, source, extra) {
  return {
    ruleKey: rule.key,
    severity: rule.severity,
    condition: rule.condition,
    dutyArrangement: rule.dutyArrangement,
    hkoMeasure: rule.hkoMeasure,
    source,
    ...extra,
  };
}

export function resolveArrangement(
  warnings,
  overrides = NO_OVERRIDE,
  rules = WEATHER_RULES_SEED,
  now = Date.now()
) {
  // 1. Manual override always wins.
  if (
    overrides.manualActive &&
    !isOverrideExpired(overrides, now) &&
    overrides.manualRuleKey &&
    rules[overrides.manualRuleKey]
  ) {
    return fromRule(rules[overrides.manualRuleKey], 'override', {
      reason: overrides.reason,
    });
  }

  // 2. Pre-No.8 is announcement-only; it cannot come from the API.
  if (overrides.preNo8) {
    return fromRule(rules.SUSPEND_TC8, 'override');
  }

  // 3. Severity first — suspension conditions before caution conditions.
  const tc = activeType(warnings.WTCSGNL);
  if (TC8_PLUS.includes(tc)) {
    return fromRule(rules.SUSPEND_TC8, 'api', {
      issueTime: warnings.WTCSGNL?.issueTime,
    });
  }

  const rain = activeType(warnings.WRAIN);
  if (rain === 'WRAINR' || rain === 'WRAINB') {
    const issueTime = warnings.WRAIN?.issueTime;
    const t = hkMinutes(issueTime);
    if (t === null) {
      // issueTime missing or unparseable: fail soft to the conservative
      // suspension band and flag it for human confirmation.
      return fromRule(rules.RAIN_R_0600, 'api', {
        interpreted: true,
        interpretedNote: INTERPRETED_NOTE,
        issueTime,
      });
    }
    if (t < 6 * 60) {
      // Includes signals issued before 5:30 still in force — not literally in
      // the school's table; defaulted to suspension and flagged.
      const before530 = t < 5 * 60 + 30;
      return fromRule(rules.RAIN_R_0530, 'api', {
        issueTime,
        ...(before530 ? { interpreted: true, interpretedNote: INTERPRETED_NOTE } : {}),
      });
    }
    if (t < 8 * 60) {
      return fromRule(rules.RAIN_R_0600, 'api', { issueTime });
    }
    return fromRule(rules.RAIN_R_0800, 'api', { issueTime });
  }

  // 4. Caution conditions, most severe first.
  if (tc === 'TC1' || tc === 'TC3') {
    return fromRule(rules.TC13, 'api', { issueTime: warnings.WTCSGNL?.issueTime });
  }
  if (rain === 'WRAINA') {
    return fromRule(rules.RAIN_A, 'api', { issueTime: warnings.WRAIN?.issueTime });
  }
  if (active(warnings.WTS)) {
    return fromRule(rules.TS, 'api', { issueTime: warnings.WTS?.issueTime });
  }
  if (active(warnings.WCOLD)) {
    return fromRule(rules.COLD, 'api', { issueTime: warnings.WCOLD?.issueTime });
  }
  if (active(warnings.WHOT)) {
    return fromRule(rules.VHOT, 'api', { issueTime: warnings.WHOT?.issueTime });
  }

  return NORMAL_ARRANGEMENT;
}

/**
 * Suspension stickiness: once a suspension has been shown for the day it
 * stands, even if HKO cancels the signal mid-morning. Hong Kong practice is
 * that arrangements do not revert once announced.
 */
export function applyStickiness(today, stored, date, now = Date.now()) {
  if (stored && stored.date === date && stored.arrangement.severity === 'suspended') {
    // A manual override can still supersede the sticky suspension (a Head
    // Prefect deliberately changing the answer); anything else cannot.
    if (today.source === 'override' && today.severity !== 'suspended') {
      return { serve: today, suspendedForToday: false, persist: null };
    }
    return { serve: stored.arrangement, suspendedForToday: true, persist: null };
  }
  if (today.severity === 'suspended') {
    return {
      serve: today,
      suspendedForToday: true,
      persist: { date, arrangement: today, writtenAt: now },
    };
  }
  return { serve: today, suspendedForToday: false, persist: null };
}

/** All active signals, for the "current conditions" list under the banner. */
export function listLiveSignals(warnings) {
  return Object.entries(warnings)
    .filter(([, entry]) => active(entry))
    .map(([key, entry]) => ({
      key,
      code: (entry?.code ?? entry?.type ?? '').toUpperCase(),
      name: entry?.name ?? key,
      issueTime: entry?.issueTime,
      actionCode: entry?.actionCode,
    }));
}

// ---------------------------------------------------------------------------
// HKO fetch with a 5-minute cache, so 30 prefects refreshing at 7 a.m. produce
// a handful of upstream requests rather than hundreds.
// ---------------------------------------------------------------------------

const WARNSUM_URL =
  'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';

const CACHE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let fresh = null;
let lastGood = null;
let lastCheckedAt = 0;
let inflight = null;

async function refresh() {
  lastCheckedAt = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(WARNSUM_URL, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HKO warnsum HTTP ${res.status}`);
    const json = await res.json();
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('HKO warnsum: unexpected payload shape');
    }
    fresh = { at: Date.now(), data: json };
    lastGood = fresh;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Warning summary through the cache. Fails soft: on error returns the last
 * known good payload marked stale. A stale answer beats no answer.
 */
export async function fetchWarnsum() {
  const now = Date.now();
  if (!fresh || now - fresh.at >= CACHE_MS) {
    try {
      // Collapse concurrent misses into a single upstream request.
      inflight = inflight ?? refresh();
      await inflight;
    } catch {
      fresh = null; // latest check failed; keep lastGood
    } finally {
      inflight = null;
    }
  }
  if (fresh) {
    return { data: fresh.data, fetchedAt: fresh.at, stale: false, lastCheckedAt };
  }
  return {
    data: lastGood?.data ?? null,
    fetchedAt: lastGood?.at ?? null,
    stale: true,
    lastCheckedAt,
  };
}

/** Test hook. */
export function _resetWarnsumCache() {
  fresh = null;
  lastGood = null;
  lastCheckedAt = 0;
  inflight = null;
}
