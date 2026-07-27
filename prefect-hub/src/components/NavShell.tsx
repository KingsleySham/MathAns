"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  BookOpen,
  CloudSun,
  Home,
  LogOut,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { ReactNode } from "react";

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/handbook", label: "Handbook", Icon: BookOpen },
  { href: "/simulations", label: "Simulate", Icon: PlayCircle },
  { href: "/portal", label: "Portal", Icon: CloudSun },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, isStaff, profile, signOutUser } = useAuth();

  const tabs = isStaff
    ? [...TABS, { href: "/head", label: "Head", Icon: ShieldCheck }]
    : TABS;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-navy text-white">
        <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"
          >
            <ShieldCheck aria-hidden className="h-5 w-5 text-yellow" />
            Prefect Hub
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {tabs.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={clsx(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  isActive(pathname, href)
                    ? "bg-white/15 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {profile && (
              <span className="hidden text-xs text-white/80 sm:inline">
                {profile.name} · {profile.classCode}
              </span>
            )}
            {user ? (
              <button
                onClick={() => void signOutUser()}
                className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm text-white/80 hover:text-white"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </button>
            ) : (
              <Link
                href="/login"
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-yellow"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="page-enter mx-auto w-full max-w-content flex-1 px-4 pb-24 pt-6 md:pb-10">
        {children}
      </main>

      {/* Mobile bottom tab bar — 44px+ touch targets, one-handed reach. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex">
          {tabs.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium",
                    active ? "text-navy" : "text-muted"
                  )}
                >
                  <Icon aria-hidden className="h-5 w-5" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
