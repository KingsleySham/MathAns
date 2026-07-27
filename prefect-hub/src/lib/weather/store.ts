import { adminDb } from "@/lib/firebase/admin";
import type { WeatherRule, WeatherRuleKey } from "@/lib/types";
import { WEATHER_RULES_SEED } from "@/lib/weather/rules-seed";
import {
  NO_OVERRIDE,
  type StoredDailyArrangement,
  type WeatherOverrideState,
} from "@/lib/weather/types";

const STATE_CACHE_MS = 60 * 1000;

interface State {
  overrides: WeatherOverrideState;
  rules: Record<WeatherRuleKey, WeatherRule>;
}

let stateCache: { at: number; state: State } | null = null;

// Fallback stickiness when Firestore is not configured. Instance-local, so
// it is best-effort only; production must set FIREBASE_SERVICE_ACCOUNT.
let memoryDaily: StoredDailyArrangement | null = null;

function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: unknown }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

/**
 * Overrides + rules from Firestore (60s cache), falling back to seed rules
 * and no override when unavailable. Every failure path returns something
 * usable — the weather answer must never depend on Firestore being up.
 */
export async function loadWeatherState(): Promise<State> {
  const now = Date.now();
  if (stateCache && now - stateCache.at < STATE_CACHE_MS) return stateCache.state;

  const fallback: State = { overrides: NO_OVERRIDE, rules: WEATHER_RULES_SEED };
  const db = adminDb();
  if (!db) return fallback;

  try {
    const [overrideSnap, rulesSnap] = await Promise.all([
      db.doc("weatherOverride/current").get(),
      db.collection("weatherRules").get(),
    ]);

    let overrides: WeatherOverrideState = NO_OVERRIDE;
    if (overrideSnap.exists) {
      const d = overrideSnap.data() ?? {};
      overrides = {
        preNo8: d.preNo8 === true,
        manualActive: d.manualActive === true,
        manualRuleKey:
          typeof d.manualRuleKey === "string" &&
          d.manualRuleKey in WEATHER_RULES_SEED
            ? (d.manualRuleKey as WeatherRuleKey)
            : null,
        reason: typeof d.reason === "string" ? d.reason : undefined,
        expiresAt: toMillis(d.expiresAt),
      };
    }

    // Firestore wording overlays the seed; unknown keys are ignored so a
    // bad edit in /head can never break resolution.
    const rules: Record<WeatherRuleKey, WeatherRule> = { ...WEATHER_RULES_SEED };
    for (const doc of rulesSnap.docs) {
      const key = doc.id as WeatherRuleKey;
      if (!(key in WEATHER_RULES_SEED)) continue;
      const d = doc.data();
      rules[key] = {
        ...WEATHER_RULES_SEED[key],
        condition:
          typeof d.condition === "string" ? d.condition : rules[key].condition,
        dutyArrangement:
          typeof d.dutyArrangement === "string"
            ? d.dutyArrangement
            : rules[key].dutyArrangement,
        hkoMeasure:
          typeof d.hkoMeasure === "string" ? d.hkoMeasure : rules[key].hkoMeasure,
        severity: WEATHER_RULES_SEED[key].severity, // severity follows the key
      };
    }

    const state: State = { overrides, rules };
    stateCache = { at: now, state };
    return state;
  } catch {
    return fallback;
  }
}

export async function loadDailyArrangement(
  date: string
): Promise<StoredDailyArrangement | null> {
  const db = adminDb();
  if (!db) {
    return memoryDaily?.date === date ? memoryDaily : null;
  }
  try {
    const snap = await db.doc(`dailyArrangement/${date}`).get();
    if (!snap.exists) return null;
    const d = snap.data() as StoredDailyArrangement;
    return d?.arrangement ? d : null;
  } catch {
    return memoryDaily?.date === date ? memoryDaily : null;
  }
}

export async function saveDailyArrangement(
  doc: StoredDailyArrangement
): Promise<void> {
  memoryDaily = doc;
  const db = adminDb();
  if (!db) return;
  try {
    await db.doc(`dailyArrangement/${doc.date}`).set(doc);
  } catch {
    // memoryDaily already holds it; nothing else to do (fail soft).
  }
}

/** Test hook. */
export function _resetWeatherStore(): void {
  stateCache = null;
  memoryDaily = null;
}
