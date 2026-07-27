import type { WeatherRule, WeatherRuleKey } from "@/lib/types";
import type {
  Arrangement,
  LiveSignal,
  StoredDailyArrangement,
  WarnSum,
  WarnsumEntry,
  WeatherOverrideState,
} from "@/lib/weather/types";

// All time comparisons in Asia/Hong_Kong. Never the server's local timezone.
const HK_TZ = "Asia/Hong_Kong";

export const INTERPRETED_NOTE =
  "Interpreted rule — confirm with teacher-in-charge";

const TC8_PLUS = ["TC8NE", "TC8SE", "TC8NW", "TC8SW", "TC9", "TC10"];

export const NORMAL_ARRANGEMENT: Arrangement = {
  ruleKey: "NORMAL",
  severity: "normal",
  condition: "No weather warnings in force",
  dutyArrangement: "Morning duty runs as usual.",
  hkoMeasure: "School operates as usual.",
  source: "normal",
};

/** A warning entry counts as active unless missing or cancelled. */
export function active(entry: WarnsumEntry | undefined): boolean {
  if (!entry) return false;
  if ((entry.actionCode ?? "").toUpperCase() === "CANCEL") return false;
  return !!(entry.code ?? entry.type ?? entry.name);
}

/** Subtype code of an active warning ('' when inactive/missing). */
export function activeType(entry: WarnsumEntry | undefined): string {
  if (!active(entry)) return "";
  return (entry?.code ?? entry?.type ?? "").toUpperCase();
}

/** Minutes since midnight in Hong Kong for an ISO time; null if unparseable. */
export function hkMinutes(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HK_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h % 24) * 60 + m;
}

/** yyyy-mm-dd in Hong Kong, keys dailyArrangement/{date}. */
export function hkDateKey(at: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

function isOverrideExpired(o: WeatherOverrideState, now: number): boolean {
  return o.expiresAt != null && now >= o.expiresAt;
}

function fromRule(
  rule: WeatherRule,
  source: Arrangement["source"],
  extra?: Partial<Arrangement>
): Arrangement {
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
  warnings: WarnSum,
  overrides: WeatherOverrideState,
  rules: Record<WeatherRuleKey, WeatherRule>,
  now: number = Date.now()
): Arrangement {
  // 1. Manual override always wins.
  if (
    overrides.manualActive &&
    !isOverrideExpired(overrides, now) &&
    overrides.manualRuleKey &&
    rules[overrides.manualRuleKey]
  ) {
    return fromRule(rules[overrides.manualRuleKey], "override", {
      reason: overrides.reason,
    });
  }

  // 2. Pre-No.8 is announcement-only; it cannot come from the API.
  if (overrides.preNo8) {
    return fromRule(rules.SUSPEND_TC8, "override");
  }

  // 3. Severity first — suspension conditions before caution conditions.
  const tc = activeType(warnings.WTCSGNL);
  if (TC8_PLUS.includes(tc)) {
    return fromRule(rules.SUSPEND_TC8, "api", {
      issueTime: warnings.WTCSGNL?.issueTime,
    });
  }

  const rain = activeType(warnings.WRAIN);
  if (rain === "WRAINR" || rain === "WRAINB") {
    const issueTime = warnings.WRAIN?.issueTime;
    const t = hkMinutes(issueTime);
    if (t === null) {
      // issueTime missing or unparseable: fail soft to the conservative
      // suspension band and flag it for human confirmation.
      return fromRule(rules.RAIN_R_0600, "api", {
        interpreted: true,
        interpretedNote: INTERPRETED_NOTE,
        issueTime,
      });
    }
    if (t < 6 * 60) {
      // Includes signals issued before 5:30 still in force — not literally in
      // the school's table; defaulted to suspension and flagged (SPEC §5).
      const before530 = t < 5 * 60 + 30;
      return fromRule(rules.RAIN_R_0530, "api", {
        issueTime,
        ...(before530
          ? { interpreted: true, interpretedNote: INTERPRETED_NOTE }
          : {}),
      });
    }
    if (t < 8 * 60) {
      return fromRule(rules.RAIN_R_0600, "api", { issueTime });
    }
    return fromRule(rules.RAIN_R_0800, "api", { issueTime });
  }

  // 4. Caution conditions, most severe first.
  if (tc === "TC1" || tc === "TC3") {
    return fromRule(rules.TC13, "api", { issueTime: warnings.WTCSGNL?.issueTime });
  }
  if (rain === "WRAINA") {
    return fromRule(rules.RAIN_A, "api", { issueTime: warnings.WRAIN?.issueTime });
  }
  if (active(warnings.WTS)) {
    return fromRule(rules.TS, "api", { issueTime: warnings.WTS?.issueTime });
  }
  if (active(warnings.WCOLD)) {
    return fromRule(rules.COLD, "api", { issueTime: warnings.WCOLD?.issueTime });
  }
  if (active(warnings.WHOT)) {
    return fromRule(rules.VHOT, "api", { issueTime: warnings.WHOT?.issueTime });
  }

  return NORMAL_ARRANGEMENT;
}

/**
 * Suspension stickiness (SPEC §5): once a suspension has been shown for the
 * day it stands, even if HKO cancels the signal mid-morning.
 */
export function applyStickiness(
  today: Arrangement,
  stored: StoredDailyArrangement | null,
  date: string,
  now: number = Date.now()
): {
  serve: Arrangement;
  suspendedForToday: boolean;
  /** Doc to persist, or null if nothing needs writing. */
  persist: StoredDailyArrangement | null;
} {
  if (stored && stored.date === date && stored.arrangement.severity === "suspended") {
    // A manual override can still supersede the sticky suspension (a Head
    // Prefect deliberately changing the answer); anything else cannot.
    if (today.source === "override" && today.severity !== "suspended") {
      return { serve: today, suspendedForToday: false, persist: null };
    }
    return { serve: stored.arrangement, suspendedForToday: true, persist: null };
  }
  if (today.severity === "suspended") {
    return {
      serve: today,
      suspendedForToday: true,
      persist: { date, arrangement: today, writtenAt: now },
    };
  }
  return { serve: today, suspendedForToday: false, persist: null };
}

/** All active signals, for the "current conditions" list under the banner. */
export function listLiveSignals(warnings: WarnSum): LiveSignal[] {
  return Object.entries(warnings)
    .filter(([, entry]) => active(entry))
    .map(([key, entry]) => ({
      key,
      code: (entry?.code ?? entry?.type ?? "").toUpperCase(),
      name: entry?.name ?? key,
      issueTime: entry?.issueTime,
      actionCode: entry?.actionCode,
    }));
}
