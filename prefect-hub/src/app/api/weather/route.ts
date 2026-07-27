import { NextResponse } from "next/server";
import { fetchWarnsum } from "@/lib/weather/hko";
import {
  applyStickiness,
  hkDateKey,
  listLiveSignals,
  resolveArrangement,
} from "@/lib/weather/resolve";
import {
  loadDailyArrangement,
  loadWeatherState,
  saveDailyArrangement,
} from "@/lib/weather/store";
import type { Arrangement, LiveSignal } from "@/lib/weather/types";

export const dynamic = "force-dynamic";

export interface WeatherResponse {
  arrangement: Arrangement;
  /** True when a suspension is being held for the rest of the HK day. */
  suspendedForToday: boolean;
  liveSignals: LiveSignal[];
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

export async function GET(): Promise<NextResponse<WeatherResponse>> {
  const now = Date.now();
  const date = hkDateKey(now);

  const [warnsum, state, stored] = await Promise.all([
    fetchWarnsum(),
    loadWeatherState(),
    loadDailyArrangement(date),
  ]);

  // Overrides work even with no HKO data at all — a Head Prefect's
  // Pre-No.8 toggle must never depend on the API being reachable.
  const resolved = resolveArrangement(
    warnsum.data ?? {},
    state.overrides,
    state.rules,
    now
  );

  const sticky = applyStickiness(resolved, stored, date, now);
  if (sticky.persist) {
    await saveDailyArrangement(sticky.persist);
  }

  return NextResponse.json(
    {
      arrangement: sticky.serve,
      suspendedForToday: sticky.suspendedForToday,
      liveSignals: listLiveSignals(warnsum.data ?? {}),
      hko: {
        fetchedAt: warnsum.fetchedAt,
        lastCheckedAt: warnsum.lastCheckedAt,
        stale: warnsum.stale,
        unavailable: warnsum.data === null,
      },
      serverNow: now,
      hkDate: date,
    },
    {
      headers: {
        // Browser/CDN edge: brief shared cache; the in-memory HKO cache is
        // what protects the upstream.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
