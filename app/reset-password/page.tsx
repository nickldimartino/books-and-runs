"use client";

// The landing page for a Supabase password-reset email link. Supabase puts
// the user in a recovery session on arrival; this page just collects a new
// password and calls updatePassword, then sends them on.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { loadSupabase } from "../lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { configured, updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The reset-link email lands here with a recovery token in the URL,
    // which Supabase parses when the client initialises and turns into a
    // PASSWORD_RECOVERY event. Because the client now loads lazily, that
    // event may fire before this listener attaches — so also check for an
    // already-established session (the recovery token creates one).
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadSupabase().then((client) => {
      if (cancelled || !client) return;
      client.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
      });
      const { data: subscription } = client.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

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
    const result = await updatePassword(password);
    setPending(false);
    if (result.error) {
      setError(result.error);
    } else {
      setDone(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-10">
      <BackLink href="/" />
      <h1 className="-mt-4 text-center text-2xl font-bold text-[var(--heading)]">Set a new password</h1>

      {done ? (
        <>
          <p className="text-center text-sm text-[var(--muted)]">Your password has been updated.</p>
          <Link
            href="/sign-in"
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-center text-sm font-semibold text-[var(--on-accent)] shadow"
          >
            Sign in
          </Link>
        </>
      ) : ready ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            required
            minLength={6}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
          >
            Update password
          </button>
        </form>
      ) : (
        <p className="text-center text-sm text-[var(--muted)]">
          This link is invalid or has expired.{" "}
          <Link href="/sign-in" className="underline hover:text-[var(--heading)]">
            Request a new one
          </Link>
          .
        </p>
      )}
    </main>
  );
}
