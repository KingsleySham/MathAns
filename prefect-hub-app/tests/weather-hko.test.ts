import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetWarnsumCache, fetchWarnsum } from "../../lib/prefect-weather.mjs";

const PAYLOAD = { WHOT: { code: "WHOT", actionCode: "ISSUE" } };

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchWarnsum caching and fail-soft", () => {
  beforeEach(() => {
    _resetWarnsumCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("serves from cache within 5 minutes — one upstream call for many readers", async () => {
    const spy = vi.fn().mockResolvedValue(okResponse(PAYLOAD));
    vi.stubGlobal("fetch", spy);

    const first = await fetchWarnsum();
    expect(first.data).toEqual(PAYLOAD);
    expect(first.stale).toBe(false);

    for (let i = 0; i < 30; i++) await fetchWarnsum();
    expect(spy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetchWarnsum();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("API failure serves the last known good result, marked stale", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(okResponse(PAYLOAD))
      .mockRejectedValue(new Error("HKO down"));
    vi.stubGlobal("fetch", spy);

    const good = await fetchWarnsum();
    expect(good.stale).toBe(false);

    vi.advanceTimersByTime(6 * 60 * 1000);
    const afterFailure = await fetchWarnsum();
    expect(afterFailure.data).toEqual(PAYLOAD); // last known good, not empty
    expect(afterFailure.stale).toBe(true);
    expect(afterFailure.fetchedAt).toBe(good.fetchedAt);
  });

  it("a proxy/CDN error page that is not JSON counts as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Host not in allowlist", { status: 200 }))
    );
    const r = await fetchWarnsum();
    expect(r.data).toBeNull();
    expect(r.stale).toBe(true);
  });

  it("cold start with HKO down returns null data (route then resolves from overrides only)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const r = await fetchWarnsum();
    expect(r.data).toBeNull();
    expect(r.stale).toBe(true);
    expect(r.lastCheckedAt).toBeGreaterThan(0);
  });
});
