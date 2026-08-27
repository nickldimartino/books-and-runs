"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";

export default function SignInPage() {
  const router = useRouter();
  const { configured, user, signInWithPassword, signUpWithPassword, resetPasswordForEmail } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot-password">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  if (!configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in isn&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">
          This app doesn&apos;t have a Supabase project connected. Local pass-and-play games work
          fine without one — accounts and stats just aren&apos;t available yet.
        </p>
        <button
          onClick={() => router.replace("/")}
          className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Back to Home
        </button>
      </main>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    if (mode === "forgot-password") {
      const result = await resetPasswordForEmail(email);
      setPending(false);
      if (result.error) {
        setError(result.error);
      } else {
        setResetEmailSent(true);
      }
      return;
    }
    if (mode === "sign-up") {
      const result = await signUpWithPassword(email, password);
      setPending(false);
      if (result.error) {
        setError(result.error);
      } else if (result.alreadyRegistered) {
        setError(
          "An account already exists for this email. Try signing in, or use “Forgot password?” if you don't remember your password."
        );
      } else if (result.confirmationRequired) {
        setCheckEmail(true);
      }
      // Otherwise email confirmation is off in Supabase and the account is
      // already signed in — the effect above will redirect to Home.
      return;
    }
    const result = await signInWithPassword(email, password);
    setPending(false);
    if (result.error) setError(result.error);
  }

  function switchMode(next: "sign-in" | "sign-up" | "forgot-password") {
    setMode(next);
    setError(null);
    setResetEmailSent(false);
    setCheckEmail(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>
      <h1 className="-mt-4 text-center text-2xl font-bold text-[var(--heading)]">Sign in</h1>

      {checkEmail ? (
        <>
          <p className="text-center text-sm text-[var(--muted)]">
            Check your email (including spam) to confirm your account, then come back and sign in.
          </p>
          <button
            onClick={() => switchMode("sign-in")}
            className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
          >
            Back to sign in
          </button>
        </>
      ) : resetEmailSent ? (
        <>
          <p className="text-center text-sm text-[var(--muted)]">
            If an account exists for {email}, we&apos;ve sent a link to reset your password.
          </p>
          <button
            onClick={() => switchMode("sign-in")}
            className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            />
            {mode !== "forgot-password" && (
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
            )}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
            >
              {mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}
            </button>
          </form>

          {mode !== "forgot-password" && (
            <button
              onClick={() => switchMode("forgot-password")}
              className="-mt-4 text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
            >
              Forgot password?
            </button>
          )}

          <button
            onClick={() => switchMode(mode === "sign-up" ? "sign-in" : mode === "forgot-password" ? "sign-in" : "sign-up")}
            className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
          >
            {mode === "sign-in"
              ? "Need an account? Sign up"
              : mode === "sign-up"
                ? "Already have an account? Sign in"
                : "Back to sign in"}
          </button>

          <p className="text-center text-xs text-[var(--faint)]">
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline hover:text-[var(--muted)]">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-[var(--muted)]">
              Privacy Policy
            </Link>
            .
          </p>

          <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
            Back to Home
          </Link>
        </>
      )}
    </main>
  );
}
