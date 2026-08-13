"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { configured, updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    // The reset-link email lands here with a recovery token in the URL,
    // which Supabase parses on load and turns into this event — there's no
    // separate "verify this token" step for us to drive.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.subscription.unsubscribe();
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
      <h1 className="text-center text-2xl font-bold text-[var(--heading)]">Set a new password</h1>

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
