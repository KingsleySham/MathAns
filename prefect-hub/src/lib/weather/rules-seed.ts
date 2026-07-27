import type { WeatherRule, WeatherRuleKey } from "@/lib/types";

const SUSPENDED_DUTY =
  "**All duties suspended and cancelled.** WhatsApp message will be sent regarding the suspension. Rescheduling will not be made.";

const SUSPENDED_MEASURE =
  "All classes suspended for the day. Students who have not left for school should stay home. Students already at school remain until it is safe to return home.";

const USUAL_MEASURE = "School operates as usual unless advised otherwise.";

/**
 * Seed data for weatherRules/{key}, from the school's arrangement table
 * (SPEC §5). Wording is editable in /head later; keys are not.
 */
export const WEATHER_RULES_SEED: Record<WeatherRuleKey, WeatherRule> = {
  VHOT: {
    order: 1,
    key: "VHOT",
    condition: "Very Hot Weather Warning",
    dutyArrangement: "Morning Assembly held inside Homerooms or Assembly Hall.",
    hkoMeasure: USUAL_MEASURE,
    severity: "caution",
  },
  COLD: {
    order: 2,
    key: "COLD",
    condition: "Cold Weather Warning",
    dutyArrangement:
      "Morning Assembly held inside Homerooms or Assembly Hall. Students may wear additional non-school jackets, including down jackets, if notified via eClass or during cold weather conditions.",
    hkoMeasure: USUAL_MEASURE,
    severity: "caution",
  },
  TS: {
    order: 3,
    key: "TS",
    condition: "Thunderstorm Warning",
    dutyArrangement:
      "Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers.",
    hkoMeasure: USUAL_MEASURE,
    severity: "caution",
  },
  TC13: {
    order: 4,
    key: "TC13",
    condition: "Tropical Cyclone Warning Signal No. 1 or No. 3",
    dutyArrangement:
      "If there is adverse weather (e.g. raining), Morning Assembly held inside Homerooms or Assembly Hall.",
    hkoMeasure: USUAL_MEASURE,
    severity: "caution",
  },
  RAIN_A: {
    order: 5,
    key: "RAIN_A",
    condition: "Amber Rainstorm Warning Signal",
    dutyArrangement:
      "Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers.",
    hkoMeasure: USUAL_MEASURE,
    severity: "caution",
  },
  SUSPEND_TC8: {
    order: 6,
    key: "SUSPEND_TC8",
    condition: "Pre-No.8 / Tropical Cyclone Signal No. 8 or above",
    dutyArrangement: SUSPENDED_DUTY,
    hkoMeasure: SUSPENDED_MEASURE,
    severity: "suspended",
  },
  RAIN_R_0530: {
    order: 7,
    key: "RAIN_R_0530",
    condition: "Red Rainstorm Signal or above issued 5:30–6:00 a.m.",
    dutyArrangement: SUSPENDED_DUTY,
    hkoMeasure: SUSPENDED_MEASURE,
    severity: "suspended",
  },
  RAIN_R_0600: {
    order: 8,
    key: "RAIN_R_0600",
    condition: "Red Rainstorm Signal or above issued 6:00–8:00 a.m.",
    dutyArrangement: SUSPENDED_DUTY,
    hkoMeasure: SUSPENDED_MEASURE,
    severity: "suspended",
  },
  RAIN_R_0800: {
    order: 9,
    key: "RAIN_R_0800",
    condition: "Red Rainstorm Signal or above issued 8:00 a.m. onwards",
    dutyArrangement:
      "Duty remains as usual. If there is adverse weather (e.g. raining), Morning Assembly held inside Homerooms or Assembly Hall. Prefects advised to bring an umbrella in case of sudden showers.",
    hkoMeasure:
      "The School will continue lessons until the end of normal school hours and will ensure conditions are safe before allowing students to return home.",
    severity: "special",
  },
};

export const WEATHER_RULES_ORDERED: WeatherRule[] = Object.values(
  WEATHER_RULES_SEED
).sort((a, b) => a.order - b.order);
