"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ShieldCheck } from "lucide-react";
import { clientAuth, firebaseConfigured } from "@/lib/firebase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(clientAuth(), email, password);
      router.push("/");
    } catch {
      // Deliberately vague: don't reveal whether the account exists.
      setError("Sign-in failed. Check your email and password, then try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-8 max-w-sm">
      <div className="mb-6 text-center">
        <ShieldCheck aria-hidden className="mx-auto mb-2 h-10 w-10 text-navy" />
        <h1 className="text-xl">Sign in to Prefect Hub</h1>
        <p className="mt-1 text-sm text-muted">
          Use the account issued by the Prefect Board.
        </p>
      </div>

      {!firebaseConfigured() ? (
        <Callout kind="important">
          <p>
            Firebase is not configured in this environment. Set the
            NEXT_PUBLIC_FIREBASE_* variables from .env.example.
          </p>
        </Callout>
      ) : (
        <Card className="p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              School email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[44px] rounded-lg border border-line px-3 text-base"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[44px] rounded-lg border border-line px-3 text-base"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-red">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted">
            Forgot your password? Ask a Head or Vice-Head Prefect to reset it.
          </p>
        </Card>
      )}
    </div>
  );
}
