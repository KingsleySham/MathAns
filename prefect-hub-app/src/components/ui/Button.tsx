import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "cta" | "destructive" | "ghost";

/**
 * Colour discipline: destructive (red) is reserved for suspension/override/
 * delete actions only. CTAs are yellow, structure is navy.
 */
export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        {
          primary: "bg-navy text-white hover:bg-navy-900",
          cta: "bg-yellow text-navy-900 hover:brightness-95 font-semibold",
          destructive: "bg-red text-white hover:brightness-90",
          ghost: "bg-transparent text-navy hover:bg-navy-100",
        }[variant],
        className
      )}
      {...props}
    />
  );
}
