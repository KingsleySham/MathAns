"use client";

/**
 * Placeholder slot for the live weather status banner.
 * Replaced by the real banner in Phase 2 (weather engine).
 */
import { StripeCard } from "@/components/ui/Card";

export function StatusBannerSlot() {
  return (
    <StripeCard severity="normal" className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-green">
        Duty as normal
      </p>
      <p className="mt-1 font-display text-lg font-semibold text-navy">
        Weather status will appear here once the weather engine is connected.
      </p>
    </StripeCard>
  );
}
