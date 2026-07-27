import type { WarnSum } from "@/lib/weather/types";

const WARNSUM_URL =
  "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en";

const CACHE_MS = 5 * 60 * 1000; // 30 prefects at 7 a.m. => a handful of upstream calls
const FETCH_TIMEOUT_MS = 8000;

export interface WarnsumResult {
  /** Parsed payload, or null only when HKO is down AND nothing was ever cached. */
  data: WarnSum | null;
  /** When `data` was actually fetched from HKO (epoch ms). */
  fetchedAt: number | null;
  /** True when serving last-known-good because the latest check failed. */
  stale: boolean;
  /** When we last attempted a fetch (epoch ms). */
  lastCheckedAt: number;
}

let fresh: { at: number; data: WarnSum } | null = null;
let lastGood: { at: number; data: WarnSum } | null = null;
let lastCheckedAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  lastCheckedAt = Date.now();
  const res = await fetch(WARNSUM_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HKO warnsum HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("HKO warnsum: unexpected payload shape");
  }
  const data = json as WarnSum;
  fresh = { at: Date.now(), data };
  lastGood = fresh;
}

/**
 * Fetch the HKO warning summary through a 5-minute in-memory cache.
 * Fails soft: on error, returns the last known good payload marked stale.
 */
export async function fetchWarnsum(): Promise<WarnsumResult> {
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
export function _resetWarnsumCache(): void {
  fresh = null;
  lastGood = null;
  lastCheckedAt = 0;
  inflight = null;
}
