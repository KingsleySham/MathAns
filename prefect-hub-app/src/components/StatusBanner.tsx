"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonX,
  RefreshCw,
} from "lucide-react";
import { SEVERITY_META } from "@/lib/severity";
import type { Severity } from "@/lib/types";
import { WEATHER_URL, weatherFetcher } from "@/lib/weather/client";
import type { WeatherResponse } from "@/lib/weather/types";

const POLL_MS = 10 * 60 * 1000;
const LS_KEY = "prefect-hub:last-weather";

const ICONS: Record<Severity, typeof Info> = {
  normal: CheckCircle2,
  caution: AlertTriangle,
  suspended: OctagonX,
  special: Info,
};

function hhmm(at: number | null | undefined): string {
  if (!at) return "—";
  return new Date(at).toLocaleTimeString("en-HK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

/** Minimal renderer for the **bold** runs used in duty arrangement text. */
function Boldable({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}

export function StatusBanner() {
  const { data, error, isValidating, mutate } = useSWR<WeatherResponse>(
    WEATHER_URL,
    weatherFetcher,
    {
      refreshInterval: POLL_MS,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  // Fail soft across page loads too: remember the last good answer locally
  // so even a cold API failure never shows an empty state.
  const [fallback, setFallback] = useState<WeatherResponse | null>(null);
  useEffect(() => {
    if (data) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch {
        /* storage full/blocked — polling still works */
      }
    } else {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) setFallback(JSON.parse(raw) as WeatherResponse);
      } catch {
        /* ignore */
      }
    }
  }, [data]);

  const shown = data ?? fallback;

  if (!shown) {
    return (
      <section
        aria-label="Weather status"
        className="sticky top-0 z-30 -mx-4 bg-canvas px-4 pb-2 pt-2"
      >
        <div className="rounded-card border border-line bg-surface p-5">
          <p className="text-sm text-muted" aria-live="polite">
            {error
              ? "Could not reach the weather service yet — retrying. If you are on duty soon, check the HKO app and the WhatsApp group."
              : "Checking today's arrangement…"}
          </p>
        </div>
      </section>
    );
  }

  const { arrangement: a, suspendedForToday, liveSignals, hko } = shown;
  const meta = SEVERITY_META[a.severity];
  const Icon = ICONS[a.severity];
  const problem = !!error || hko.stale;

  return (
    <section
      aria-label="Weather status"
      className="sticky top-0 z-30 -mx-4 bg-canvas px-4 pb-2 pt-2"
    >
      {/* The one place a drop shadow is allowed: the sticky status bar. */}
      <div
        key={a.ruleKey + a.source}
        className="banner-crossfade relative overflow-hidden rounded-card border border-line bg-surface shadow-[0_2px_10px_rgba(11,51,116,0.10)]"
      >
        <span
          aria-hidden
          className={clsx("absolute inset-y-0 left-0 w-[6px]", meta.stripeClass)}
        />
        <div className="p-5 pl-6">
          {/* 1. Severity label */}
          <p
            className={clsx(
              "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
              a.severity === "caution" ? "text-navy-900" : meta.textClass
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {a.severity === "suspended" && suspendedForToday
              ? "Suspended for today"
              : meta.label}
          </p>

          {/* 2. Condition name */}
          <p className="mt-2 text-sm font-medium text-muted">{a.condition}</p>

          {/* 3. Duty arrangement — largest text on the page */}
          <p className="mt-1 font-display text-xl font-bold text-navy md:text-2xl">
            <Boldable text={a.dutyArrangement} />
          </p>

          {/* 4. HKO measure, smaller */}
          <p className="mt-2 text-sm text-ink">
            <Boldable text={a.hkoMeasure} />
          </p>

          {a.interpreted && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-navy-900">
              <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
              {a.interpretedNote ?? "Interpreted rule — confirm with teacher-in-charge"}
            </p>
          )}

          {/* 5. Issue time + 6. source tag */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted">
            {a.issueTime && <span>Issued {hhmm(Date.parse(a.issueTime))}</span>}
            <span>
              {a.source === "override"
                ? "Set by Head Prefect"
                : a.source === "api"
                  ? "Live from HKO"
                  : "No warnings — HKO"}
            </span>
            {a.reason && <span>Reason: {a.reason}</span>}
            <span aria-live="polite">Updated {hhmm(shown.hko.fetchedAt ?? shown.serverNow)}</span>
            <button
              onClick={() => void mutate()}
              disabled={isValidating}
              className="ml-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg px-2 font-body text-xs font-medium text-navy hover:bg-navy-100 disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden
                className={clsx("h-4 w-4", isValidating && "animate-spin")}
              />
              Refresh
            </button>
          </div>

          {/* Current conditions under a held suspension. */}
          {suspendedForToday && liveSignals.length === 0 && (
            <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
              Current conditions: no warning signals in force. Today&rsquo;s
              suspension still stands — arrangements do not revert once
              announced.
            </p>
          )}
          {suspendedForToday && liveSignals.length > 0 && (
            <p className="mt-2 border-t border-line pt-2 font-mono text-xs text-muted">
              Current conditions:{" "}
              {liveSignals.map((s) => s.code || s.name).join(" · ")}
            </p>
          )}
        </div>

        {problem && (
          <p className="flex items-center gap-2 border-t border-line bg-yellow-100 px-5 py-2 text-xs font-medium text-navy-900">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
            Last checked {hhmm(hko.lastCheckedAt || Date.now())} — could not
            reach HKO. Showing the last known arrangement.
          </p>
        )}
      </div>
    </section>
  );
}
