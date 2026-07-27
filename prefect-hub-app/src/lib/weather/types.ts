/**
 * Shape of the /api/weather response. The engine that produces it is
 * lib/prefect-weather.mjs at the repo root — the single source of truth for
 * rules and resolution, shared by the serverless function and the tests.
 */
import type {
  Arrangement,
  LiveSignal,
  WeatherRule,
} from "../../../../lib/prefect-weather";

export type {
  Arrangement,
  ArrangementSource,
  LiveSignal,
  Severity,
  WarnSum,
  WarnsumEntry,
  WeatherOverrideState,
  WeatherRule,
  WeatherRuleKey,
} from "../../../../lib/prefect-weather";

export interface WeatherResponse {
  arrangement: Arrangement;
  /** True when a suspension is being held for the rest of the HK day. */
  suspendedForToday: boolean;
  liveSignals: LiveSignal[];
  /** The full duty table, so the reference page needs no copy of its own. */
  rules: WeatherRule[];
  hko: {
    fetchedAt: number | null;
    lastCheckedAt: number;
    stale: boolean;
    /** True when HKO is unreachable and nothing was ever cached. */
    unavailable: boolean;
  };
  serverNow: number;
  hkDate: string;
}
