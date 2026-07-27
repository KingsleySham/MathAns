"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/Card";

/**
 * UI-level gates only. Firestore security rules are the real access
 * control — these components just avoid rendering screens a user cannot use.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, configured } = useAuth();

  if (!configured) {
    return (
      <Card className="p-6 text-sm text-muted">
        Firebase is not configured. Set the NEXT_PUBLIC_FIREBASE_* environment
        variables (see .env.example).
      </Card>
    );
  }
  if (user === undefined) {
    return <p className="p-6 text-sm text-muted">Checking your sign-in…</p>;
  }
  if (user === null) {
    return (
      <Card className="p-6">
        <p className="mb-2 font-display font-semibold text-navy">Sign in required</p>
        <p className="mb-4 text-sm text-muted">
          You need a prefect account to view this page.
        </p>
        <Link href="/login" className="text-sm font-medium text-navy underline">
          Go to sign in
        </Link>
      </Card>
    );
  }
  return <>{children}</>;
}

export function RequireStaff({ children }: { children: ReactNode }) {
  const { isStaff, user } = useAuth();
  return (
    <RequireAuth>
      {user && !isStaff ? (
        <Card className="p-6">
          <p className="mb-2 font-display font-semibold text-navy">
            Head Prefect area
          </p>
          <p className="text-sm text-muted">
            This area is restricted to Head Prefects, Vice-Head Prefects and
            teachers. If you believe you should have access, contact the
            teacher-in-charge.
          </p>
        </Card>
      ) : (
        children
      )}
    </RequireAuth>
  );
}
