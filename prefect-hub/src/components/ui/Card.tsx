import { clsx } from "clsx";
import type { HTMLAttributes } from "react";
import type { Severity } from "@/lib/types";
import { SEVERITY_META } from "@/lib/severity";

export function Card({
  className,
  lift = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { lift?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-card border border-line bg-surface",
        lift && "card-lift",
        className
      )}
      {...props}
    />
  );
}

/**
 * Status card with the signature 6px left-edge colour stripe. The same
 * stripe language repeats on notices, callouts and simulation outcomes.
 */
export function StripeCard({
  severity,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { severity: Severity }) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-card border border-line bg-surface pl-[6px]",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={clsx(
          "absolute inset-y-0 left-0 w-[6px]",
          SEVERITY_META[severity].stripeClass
        )}
      />
      {children}
    </div>
  );
}
