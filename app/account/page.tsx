"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { displayNameFor, syncLeaderboardStats, updateLeaderboardDisplayName } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

type SaveState = "idle" | "saving" | "saved" | "error";

const MAX_NAME_LENGTH = 24;

/**
 * Re-establishes the current session with the account's own email + the
 * password just typed in — Supabase's password auth has no dedicated
 * "confirm you still know your password" challenge, so signing in again
 * (which succeeds or fails exactly like the original sign-in) doubles as
 * one. Required before either email or password can be changed here — see
 * the user's own call on this: an already-unlocked, signed-in device is
 * exactly the scenario this exists to guard against.
 */
async function reauthenticate(email: string, currentPassword: string): Promise<string | null> {
  if (!supabase) return "Not configured.";
  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  return error ? "Current password is incorrect." : null;
}

export default function AccountPage() {
  const { configured, loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [nameSaveState, setNameSaveState] = useState<SaveState>("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaveState, setEmailSaveState] = useState<SaveState>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaveState, setPasswordSaveState] = useState<SaveState>("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    // Doubles as a self-heal for anyone whose stats never made it to the
    // leaderboard (a past sync failure, or an account that predates this
    // feature entirely) — cheap, and this page is a natural place someone
    // lands specifically because they care what the leaderboard shows them.
    syncLeaderboardStats(supabase, user.id).catch((err) => {
      console.error("Failed to sync leaderboard entry:", err);
    });
    supabase
      .from("leaderboard_entries")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle<{ display_name: string | null }>()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? "");
        setLoading(false);
      });
  }, [user]);

  if (!authLoading && !configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Accounts aren&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">This app doesn&apos;t have a Supabase project connected yet.</p>
        <Link
          href="/"
          className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Back to Home
        </Link>
      </main>
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in to manage your account</h1>
        <Link
          href="/sign-in"
          className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
        >
          Sign in
        </Link>
      </main>
    );
  }

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setNameError(null);
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      setNameError("Enter a name — leave it blank and pick one later if you're not sure yet.");
      return;
    }
    setNameSaveState("saving");
    try {
      await updateLeaderboardDisplayName(supabase, user.id, trimmed);
      setDisplayName(trimmed);
      setNameSaveState("saved");
    } catch (err) {
      console.error("Failed to save display name:", err);
      setNameSaveState("error");
    }
  }

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user?.email) return;
    setEmailError(null);
    setEmailSaveState("saving");
    const reauthError = await reauthenticate(user.email, emailPassword);
    if (reauthError) {
      setEmailError(reauthError);
      setEmailSaveState("error");
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      setEmailError(error.message);
      setEmailSaveState("error");
      return;
    }
    setEmailPassword("");
    setEmailSaveState("saved");
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user?.email) return;
    setPasswordError(null);
    setPasswordSaveState("saving");
    const reauthError = await reauthenticate(user.email, currentPassword);
    if (reauthError) {
      setPasswordError(reauthError);
      setPasswordSaveState("error");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(error.message);
      setPasswordSaveState("error");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setPasswordSaveState("saved");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <Link href="/" className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
        ← Home
      </Link>
      <h1 className="-mt-4 text-2xl font-bold text-[var(--heading)]">Account</h1>

      {authLoading || loading ? (
        <p className="text-sm text-[var(--faint)]">Loading…</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Display name</h2>
            <p className="text-xs text-[var(--faint)]">
              Shown on the Leaderboard — not your email, and not tied to your pass-and-play name on
              any one device.{" "}
              {user && !displayName && (
                <>Until you set one, you show up as “{displayNameFor({ user_id: user.id, display_name: null })}”.</>
              )}
            </p>
            <form onSubmit={handleSaveName} className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name on the Leaderboard"
                maxLength={MAX_NAME_LENGTH}
                className="flex-1 rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={nameSaveState === "saving"}
                className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
              >
                Save
              </button>
            </form>
            {nameError && <p className="text-xs text-[var(--danger)]">{nameError}</p>}
            {nameSaveState === "saved" && !nameError && (
              <p className="text-xs text-[var(--muted)]">Saved.</p>
            )}
            {nameSaveState === "error" && !nameError && (
              <p className="text-xs text-[var(--danger)]">Couldn&apos;t save — check your connection.</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Email</h2>
            <p className="text-xs text-[var(--muted)]">Signed in as {user?.email}.</p>
            <form onSubmit={handleChangeEmail} className="flex flex-col gap-2">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="New email address"
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              <input
                type="password"
                required
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Current password, to confirm it's you"
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              {emailError && <p className="text-xs text-[var(--danger)]">{emailError}</p>}
              {emailSaveState === "saved" && (
                <p className="text-xs text-[var(--muted)]">
                  Check {newEmail || "your new email address"} to confirm the change — it won&apos;t take
                  effect until then.
                </p>
              )}
              <button
                type="submit"
                disabled={emailSaveState === "saving"}
                className="rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {emailSaveState === "saving" ? "Saving…" : "Change email"}
              </button>
            </form>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Password</h2>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-2">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              {passwordError && <p className="text-xs text-[var(--danger)]">{passwordError}</p>}
              {passwordSaveState === "saved" && (
                <p className="text-xs text-[var(--muted)]">Password updated.</p>
              )}
              <button
                type="submit"
                disabled={passwordSaveState === "saving"}
                className="rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {passwordSaveState === "saving" ? "Saving…" : "Change password"}
              </button>
            </form>
          </section>
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
