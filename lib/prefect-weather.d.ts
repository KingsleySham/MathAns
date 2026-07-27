// Types for lib/prefect-weather.mjs, consumed by prefect-hub-app and its tests.

export type Severity = "normal" | "caution" | "suspended" | "special";

export type WeatherRuleKey =
  | "VHOT"
  | "COLD"
  | "TS"
  | "TC13"
  | "RAIN_A"
  | "SUSPEND_TC8"
  | "RAIN_R_0530"
  | "RAIN_R_0600"
  | "RAIN_R_0800";

export interface WeatherRule {
  order: number;
  key: WeatherRuleKey;
  condition: string;
  dutyArrangement: string;
  hkoMeasure: string;
  severity: Severity;
}

/** One entry from the HKO warnsum payload — every field optional by design. */
export interface WarnsumEntry {
  name?: string;
  code?: string;
  type?: string;
  actionCode?: string;
  issueTime?: string;
  updateTime?: string;
}

export type WarnSum = Record<string, WarnsumEntry | undefined>;

export interface WeatherOverrideState {
  preNo8: boolean;
  manualActive: boolean;
  manualRuleKey: WeatherRuleKey | null;
  reason?: string;
  expiresAt?: number | null;
}

export type ArrangementSource = "api" | "override" | "normal";

export interface Arrangement {
  ruleKey: WeatherRuleKey | "NORMAL";
  severity: Severity;
  condition: string;
  dutyArrangement: string;
  hkoMeasure: string;
  source: ArrangementSource;
  reason?: string;
  interpreted?: boolean;
  interpretedNote?: string;
  issueTime?: string;
}

export interface LiveSignal {
  key: string;
  code: string;
  name: string;
  issueTime?: string;
  actionCode?: string;
}

export interface StoredDailyArrangement {
  date: string;
  arrangement: Arrangement;
  writtenAt: number;
}

export interface WarnsumResult {
  data: WarnSum | null;
  fetchedAt: number | null;
  stale: boolean;
  lastCheckedAt: number;
}

export const WEATHER_RULES_SEED: Record<WeatherRuleKey, WeatherRule>;
export const WEATHER_RULES_ORDERED: WeatherRule[];
export const NORMAL_ARRANGEMENT: Arrangement;
export const NO_OVERRIDE: WeatherOverrideState;
export const INTERPRETED_NOTE: string;

export function active(entry: WarnsumEntry | undefined): boolean;
export function activeType(entry: WarnsumEntry | undefined): string;
export function hkMinutes(iso: string | undefined): number | null;
export function hkDateKey(at?: number): string;

export function resolveArrangement(
  warnings: WarnSum,
  overrides?: WeatherOverrideState,
  rules?: Record<WeatherRuleKey, WeatherRule>,
  now?: number
): Arrangement;

export function applyStickiness(
  today: Arrangement,
  stored: StoredDailyArrangement | null,
  date: string,
  now?: number
): {
  serve: Arrangement;
  suspendedForToday: boolean;
  persist: StoredDailyArrangement | null;
};

export function listLiveSignals(warnings: WarnSum): LiveSignal[];
export function fetchWarnsum(): Promise<WarnsumResult>;
export function _resetWarnsumCache(): void;
