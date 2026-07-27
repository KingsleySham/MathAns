import { clsx } from "clsx";
import { Info, AlertTriangle, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";

type Kind = "note" | "important" | "warning";

const META: Record<
  Kind,
  { label: string; stripe: string; bg: string; Icon: typeof Info }
> = {
  note: { label: "Note", stripe: "bg-navy", bg: "bg-navy-100", Icon: Info },
  important: {
    label: "Important",
    stripe: "bg-yellow",
    bg: "bg-yellow-100",
    Icon: AlertTriangle,
  },
  warning: {
    label: "Warning",
    stripe: "bg-red",
    bg: "bg-red-100",
    Icon: OctagonAlert,
  },
};

export function Callout({ kind, children }: { kind: Kind; children: ReactNode }) {
  const { label, stripe, bg, Icon } = META[kind];
  return (
    <div
      role={kind === "warning" ? "alert" : "note"}
      className={clsx("relative my-4 overflow-hidden rounded-card pl-[6px]", bg)}
    >
      <span aria-hidden className={clsx("absolute inset-y-0 left-0 w-[6px]", stripe)} />
      <div className="flex gap-3 p-4">
        <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-navy-900" />
        <div className="text-sm text-ink">
          <p className="mb-1 font-display font-semibold text-navy-900">{label}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
