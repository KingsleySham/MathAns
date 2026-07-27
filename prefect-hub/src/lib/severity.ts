import type { Severity } from "@/lib/types";

/**
 * Single source of the stripe language: green normal, yellow caution,
 * red suspended, navy special. Colour is never the only signal — every
 * severity also carries a text label and an icon name.
 */
export const SEVERITY_META: Record<
  Severity,
  { label: string; stripeClass: string; bgClass: string; textClass: string; icon: string }
> = {
  normal: {
    label: "Duty as normal",
    stripeClass: "bg-green",
    bgClass: "bg-green-100",
    textClass: "text-green",
    icon: "check-circle",
  },
  caution: {
    label: "Caution — duty is on",
    stripeClass: "bg-yellow",
    bgClass: "bg-yellow-100",
    textClass: "text-yellow",
    icon: "alert-triangle",
  },
  suspended: {
    label: "Duties suspended",
    stripeClass: "bg-red",
    bgClass: "bg-red-100",
    textClass: "text-red",
    icon: "octagon-x",
  },
  special: {
    label: "Special arrangement",
    stripeClass: "bg-navy",
    bgClass: "bg-navy-100",
    textClass: "text-navy",
    icon: "info",
  },
};
