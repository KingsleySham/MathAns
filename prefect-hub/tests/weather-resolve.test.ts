import { describe, expect, it } from "vitest";
import { WEATHER_RULES_SEED } from "@/lib/weather/rules-seed";
import {
  active,
  applyStickiness,
  hkMinutes,
  INTERPRETED_NOTE,
  listLiveSignals,
  NORMAL_ARRANGEMENT,
  resolveArrangement,
} from "@/lib/weather/resolve";
import {
  NO_OVERRIDE,
  type StoredDailyArrangement,
  type WarnSum,
} from "@/lib/weather/types";

const rules = WEATHER_RULES_SEED;

// 2026-07-27, Hong Kong time (+08:00).
const hk = (time: string) => `2026-07-27T${time}:00+08:00`;

const resolve = (warnings: WarnSum, overrides = NO_OVERRIDE) =>
  resolveArrangement(warnings, overrides, rules, Date.parse(hk("07:00")));

describe("hkMinutes", () => {
  it("converts to minutes since midnight in Asia/Hong_Kong regardless of server TZ", () => {
    expect(hkMinutes(hk("05:45"))).toBe(345);
    expect(hkMinutes(hk("00:00"))).toBe(0);
    // Same instant expressed in UTC — 21:45Z previous day is 05:45 HKT.
    expect(hkMinutes("2026-07-26T21:45:00Z")).toBe(345);
  });

  it("returns null for missing or garbage input", () => {
    expect(hkMinutes(undefined)).toBeNull();
    expect(hkMinutes("not a time")).toBeNull();
  });
});

describe("resolveArrangement — the nine rules", () => {
  it("rule 1: VHOT", () => {
    const a = resolve({ WHOT: { code: "WHOT", actionCode: "ISSUE", issueTime: hk("06:45") } });
    expect(a.ruleKey).toBe("VHOT");
    expect(a.severity).toBe("caution");
    expect(a.source).toBe("api");
  });

  it("rule 2: COLD", () => {
    const a = resolve({ WCOLD: { code: "WCOLD", actionCode: "ISSUE" } });
    expect(a.ruleKey).toBe("COLD");
    expect(a.severity).toBe("caution");
  });

  it("rule 3: TS", () => {
    const a = resolve({ WTS: { code: "WTS", actionCode: "ISSUE" } });
    expect(a.ruleKey).toBe("TS");
    expect(a.severity).toBe("caution");
  });

  it("rule 4: TC1 and TC3", () => {
    for (const code of ["TC1", "TC3"]) {
      const a = resolve({ WTCSGNL: { code, actionCode: "ISSUE" } });
      expect(a.ruleKey).toBe("TC13");
      expect(a.severity).toBe("caution");
    }
  });

  it("rule 5: Amber rain", () => {
    const a = resolve({ WRAIN: { code: "WRAINA", actionCode: "ISSUE", issueTime: hk("06:20") } });
    expect(a.ruleKey).toBe("RAIN_A");
    expect(a.severity).toBe("caution");
  });

  it("rule 6: TC8 (all quadrants), TC9, TC10 suspend", () => {
    for (const code of ["TC8NE", "TC8SE", "TC8NW", "TC8SW", "TC9", "TC10"]) {
      const a = resolve({ WTCSGNL: { code, actionCode: "ISSUE" } });
      expect(a.ruleKey).toBe("SUSPEND_TC8");
      expect(a.severity).toBe("suspended");
    }
  });

  it("rule 7: Red rain issued 5:30–6:00 suspends (no interpreted flag)", () => {
    const a = resolve({ WRAIN: { code: "WRAINR", actionCode: "ISSUE", issueTime: hk("05:45") } });
    expect(a.ruleKey).toBe("RAIN_R_0530");
    expect(a.severity).toBe("suspended");
    expect(a.interpreted).toBeUndefined();
  });

  it("rule 8: Red rain issued 6:00–8:00 suspends (band boundaries)", () => {
    for (const time of ["06:00", "07:59"]) {
      const a = resolve({ WRAIN: { code: "WRAINR", actionCode: "ISSUE", issueTime: hk(time) } });
      expect(a.ruleKey).toBe("RAIN_R_0600");
      expect(a.severity).toBe("suspended");
    }
  });

  it("rule 9: Red/Black rain issued 8:00 onwards — duty stands (special)", () => {
    for (const code of ["WRAINR", "WRAINB"]) {
      const a = resolve({ WRAIN: { code, actionCode: "ISSUE", issueTime: hk("08:00") } });
      expect(a.ruleKey).toBe("RAIN_R_0800");
      expect(a.severity).toBe("special");
    }
  });

  it("no warnings — normal", () => {
    expect(resolve({})).toEqual(NORMAL_ARRANGEMENT);
  });
});

describe("edge case 1: signal in force before 5:30 a.m.", () => {
  it("Red at 4:10 a.m. suspends via rule 7 and is flagged as interpreted", () => {
    const a = resolve({ WRAIN: { code: "WRAINR", actionCode: "ISSUE", issueTime: hk("04:10") } });
    expect(a.ruleKey).toBe("RAIN_R_0530");
    expect(a.severity).toBe("suspended");
    expect(a.interpreted).toBe(true);
    expect(a.interpretedNote).toBe(INTERPRETED_NOTE);
  });

  it("Black rain with a missing issueTime fails soft to suspension, flagged", () => {
    const a = resolve({ WRAIN: { code: "WRAINB", actionCode: "ISSUE" } });
    expect(a.severity).toBe("suspended");
    expect(a.interpreted).toBe(true);
  });
});

describe("edge case 2: suspension stickiness", () => {
  const date = "2026-07-27";
  const suspended = resolve({
    WRAIN: { code: "WRAINR", actionCode: "ISSUE", issueTime: hk("06:30") },
  });

  it("first suspension of the day is served and persisted", () => {
    const r = applyStickiness(suspended, null, date);
    expect(r.serve.ruleKey).toBe("RAIN_R_0600");
    expect(r.suspendedForToday).toBe(true);
    expect(r.persist?.date).toBe(date);
    expect(r.persist?.arrangement.severity).toBe("suspended");
  });

  it("does not silently revert when HKO cancels the signal mid-morning", () => {
    const stored: StoredDailyArrangement = {
      date,
      arrangement: suspended,
      writtenAt: Date.parse(hk("06:31")),
    };
    // Signal cancelled: live resolution says normal again.
    const live = resolve({ WRAIN: { code: "WRAINR", actionCode: "CANCEL" } });
    expect(live.severity).toBe("normal");

    const r = applyStickiness(live, stored, date);
    expect(r.serve.severity).toBe("suspended");
    expect(r.suspendedForToday).toBe(true);
    expect(r.persist).toBeNull();
  });

  it("yesterday's suspension does not leak into today", () => {
    const stored: StoredDailyArrangement = {
      date: "2026-07-26",
      arrangement: suspended,
      writtenAt: 0,
    };
    const r = applyStickiness(NORMAL_ARRANGEMENT, stored, date);
    expect(r.serve.severity).toBe("normal");
    expect(r.suspendedForToday).toBe(false);
  });

  it("a deliberate non-suspended manual override supersedes the sticky suspension", () => {
    const stored: StoredDailyArrangement = { date, arrangement: suspended, writtenAt: 0 };
    const override = resolveArrangement(
      {},
      { preNo8: false, manualActive: true, manualRuleKey: "TC13", reason: "HP decision" },
      rules,
      Date.parse(hk("09:00"))
    );
    const r = applyStickiness(override, stored, date);
    expect(r.serve.ruleKey).toBe("TC13");
    expect(r.suspendedForToday).toBe(false);
  });
});

describe("overrides", () => {
  it("Pre-No.8 forces suspension even with no HKO data at all", () => {
    const a = resolve({}, { ...NO_OVERRIDE, preNo8: true });
    expect(a.ruleKey).toBe("SUSPEND_TC8");
    expect(a.source).toBe("override");
  });

  it("manual override always wins, even over TC10", () => {
    const a = resolve(
      { WTCSGNL: { code: "TC10", actionCode: "ISSUE" } },
      { preNo8: false, manualActive: true, manualRuleKey: "VHOT", reason: "drill" }
    );
    expect(a.ruleKey).toBe("VHOT");
    expect(a.source).toBe("override");
    expect(a.reason).toBe("drill");
  });

  it("an expired manual override is ignored", () => {
    const a = resolve(
      {},
      {
        preNo8: false,
        manualActive: true,
        manualRuleKey: "VHOT",
        expiresAt: Date.parse(hk("06:00")), // resolver runs at 07:00
      }
    );
    expect(a).toEqual(NORMAL_ARRANGEMENT);
  });
});

describe("severity ordering and CANCEL handling", () => {
  it("TC8 beats a Red rain time band", () => {
    const a = resolve({
      WTCSGNL: { code: "TC8NW", actionCode: "ISSUE" },
      WRAIN: { code: "WRAINR", actionCode: "ISSUE", issueTime: hk("08:30") },
    });
    expect(a.ruleKey).toBe("SUSPEND_TC8");
  });

  it("TC1/TC3 beats Amber, Amber beats TS, TS beats COLD/HOT", () => {
    expect(
      resolve({
        WTCSGNL: { code: "TC3", actionCode: "ISSUE" },
        WRAIN: { code: "WRAINA", actionCode: "ISSUE" },
      }).ruleKey
    ).toBe("TC13");
    expect(
      resolve({
        WRAIN: { code: "WRAINA", actionCode: "ISSUE" },
        WTS: { code: "WTS", actionCode: "ISSUE" },
      }).ruleKey
    ).toBe("RAIN_A");
    expect(
      resolve({
        WTS: { code: "WTS", actionCode: "ISSUE" },
        WCOLD: { code: "WCOLD", actionCode: "ISSUE" },
        WHOT: { code: "WHOT", actionCode: "ISSUE" },
      }).ruleKey
    ).toBe("TS");
  });

  it("CANCEL means inactive", () => {
    expect(active({ code: "WRAINR", actionCode: "CANCEL" })).toBe(false);
    const a = resolve({
      WRAIN: { code: "WRAINR", actionCode: "CANCEL", issueTime: hk("06:30") },
    });
    expect(a).toEqual(NORMAL_ARRANGEMENT);
  });

  it("a cancelled TC8 falls through to the remaining live warnings", () => {
    const a = resolve({
      WTCSGNL: { code: "TC8NE", actionCode: "CANCEL" },
      WHOT: { code: "WHOT", actionCode: "ISSUE" },
    });
    expect(a.ruleKey).toBe("VHOT");
  });
});

describe("listLiveSignals", () => {
  it("lists active signals and drops cancelled ones", () => {
    const signals = listLiveSignals({
      WRAIN: { code: "WRAINR", name: "Red Rainstorm", actionCode: "ISSUE", issueTime: hk("06:30") },
      WTS: { code: "WTS", actionCode: "CANCEL" },
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ key: "WRAIN", code: "WRAINR" });
  });
});
