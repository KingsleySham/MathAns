import type { Severity, WeatherRuleKey } from "@/lib/types";

/**
 * One entry from the HKO `warnsum` payload. Treat every field as optional —
 * the spec says: expected, not guaranteed. Fail soft when a key is missing.
 */
export interface WarnsumEntry {
  name?: string;
  code?: string; // e.g. 'TC8NE', 'WRAINR', 'WTSGNL'
  type?: string; // some payload variants carry the subtype here
  actionCode?: string; // ISSUE | REISSUE | CANCEL | EXTEND | UPDATE
  issueTime?: string; // ISO 8601, +08:00
  updateTime?: string;
}

export type WarnSum = Record<string, WarnsumEntry | undefined>;

export interface WeatherOverrideState {
  preNo8: boolean;
  manualActive: boolean;
  manualRuleKey: WeatherRuleKey | null;
  reason?: string;
  /** Epoch ms. Manual overrides must auto-expire. */
  expiresAt?: number | null;
}

export const NO_OVERRIDE: WeatherOverrideState = {
  preNo8: false,
  manualActive: false,
  manualRuleKey: null,
};

export type ArrangementSource = "api" | "override" | "normal";

export interface Arrangement {
  ruleKey: WeatherRuleKey | "NORMAL";
  severity: Severity;
  condition: string;
  dutyArrangement: string; // markdown
  hkoMeasure: string; // markdown
  source: ArrangementSource;
  /** Free-text reason when a Head Prefect set a manual override. */
  reason?: string;
  /** True when the engine had to interpret beyond the school's table. */
  interpreted?: boolean;
  interpretedNote?: string;
  /** Issue time (ISO) of the signal that drove this arrangement, if any. */
  issueTime?: string;
}

/** A live signal shown as "current conditions" under a sticky suspension. */
export interface LiveSignal {
  key: string; // warnsum key, e.g. 'WTCSGNL'
  code: string;
  name: string;
  issueTime?: string;
  actionCode?: string;
}

/** Persisted per-day so suspensions never silently revert (dailyArrangement/{yyyy-mm-dd}). */
export interface StoredDailyArrangement {
  date: string; // yyyy-mm-dd in Asia/Hong_Kong
  arrangement: Arrangement;
  writtenAt: number; // epoch ms
}
