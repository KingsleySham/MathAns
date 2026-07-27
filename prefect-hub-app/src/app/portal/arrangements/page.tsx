"use client";

import useSWR from "swr";
import { clsx } from "clsx";
import { StripeCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SEVERITY_META } from "@/lib/severity";
import type { Severity } from "@/lib/types";
import { WEATHER_URL, weatherFetcher } from "@/lib/weather/client";
import type { WeatherResponse } from "@/lib/weather/types";

const BADGE_TONE: Record<Severity, "green" | "yellow" | "red" | "navy"> = {
  normal: "green",
  caution: "yellow",
  suspended: "red",
  special: "navy",
};

function strip(md: string): string {
  return md.replace(/\*\*(.+?)\*\*/g, "$1");
}

/**
 * Reference table of all nine duty rules, stacked as stripe cards so it reads
 * on a phone. The rules come from the same endpoint that drives the banner,
 * so this table can never disagree with the arrangement a prefect is shown.
 */
export default function ArrangementsPage() {
  const { data, error } = useSWR<WeatherResponse>(WEATHER_URL, weatherFetcher, {
    revalidateOnFocus: false,
  });
  const rules = data?.rules ?? [];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl">Weather duty arrangements</h1>
        <p className="mt-1 text-sm text-muted">
          The full reference table behind the live status banner. When a
          warning is in force, the banner on the Portal always shows the rule
          that applies right now.
        </p>
      </header>

      {rules.length === 0 && (
        <p className="text-sm text-muted" aria-live="polite">
          {error
            ? "Could not load the arrangement table. Check your connection, or ask a Head Prefect for the printed table."
            : "Loading the arrangement table…"}
        </p>
      )}

      <ol className="flex list-none flex-col gap-3 p-0">
        {rules.map((rule) => (
          <li key={rule.key}>
            <StripeCard severity={rule.severity} className="p-4 pl-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">
                  {String(rule.order).padStart(2, "0")}
                </span>
                <Badge tone={BADGE_TONE[rule.severity]}>
                  {SEVERITY_META[rule.severity].label}
                </Badge>
              </div>
              <h2 className="mt-2 text-lg">{rule.condition}</h2>
              <dl className="mt-2 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="font-semibold text-navy">Prefect duty</dt>
                  <dd
                    className={clsx(
                      "mt-0.5 text-ink",
                      rule.severity === "suspended" && "font-semibold"
                    )}
                  >
                    {strip(rule.dutyArrangement)}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-navy">School measure (HKO)</dt>
                  <dd className="mt-0.5 text-ink">{strip(rule.hkoMeasure)}</dd>
                </div>
              </dl>
            </StripeCard>
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted">
        A Red or Black signal already in force before 5:30 a.m. is treated as a
        suspension and flagged &ldquo;Interpreted rule — confirm with
        teacher-in-charge&rdquo;. Once a suspension has been shown for the day
        it stands, even if the signal is cancelled later that morning.
      </p>
    </div>
  );
}
