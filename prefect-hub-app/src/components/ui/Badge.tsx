import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

type Tone = "navy" | "yellow" | "red" | "green" | "muted";

export function Badge({
  tone = "navy",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        {
          navy: "bg-navy-100 text-navy",
          yellow: "bg-yellow-100 text-navy-900",
          red: "bg-red-100 text-red",
          green: "bg-green-100 text-green",
          muted: "bg-canvas text-muted",
        }[tone],
        className
      )}
      {...props}
    />
  );
}
