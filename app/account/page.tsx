"use client";

// The Account page: shown only when signed in. Edit the public display name
// (written to leaderboard_entries), sign out, and the danger-zone actions.
// Redirects to /sign-in when there's no session.

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { MfaFactor, useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { buildUserDataExport, downloadUserDataExport } from "../lib/exportUserData";
import { syncLeaderboardStats } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

type SaveState = "idle" | "saving" | "saved" | "error";

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
  if (error) return "Current password is incorrect.";
  // On an account with two-factor enabled, re-authenticating with just a
  // password only re-proves aal1 — if that left the session needing aal2
  // again (rather than Supabase preserving the grant it already had),
  // catch it here instead of silently dropping out of this page mid-action:
  // AuthContext's own auth-state listener would otherwise flip `user` to
  // null the moment this resolves, since it treats aal1-when-aal2-is-
  // required as not really signed in (see its own mfaPending doc).
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal1" && data?.nextLevel === "aal2") {
    return "Your session needs a fresh sign-in with your authenticator code — sign out and back in, then try again.";
  }
  return null;
}

export default function AccountPage() {
  const {
    configured,
    loading: authLoading,
    user,
    listMfaFactors,
    enrollMfaFactor,
    verifyMfaEnrollment,
    unenrollMfaFactor,
  } = useAuth();

  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaveState, setEmailSaveState] = useState<SaveState>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaveState, setPasswordSaveState] = useState<SaveState>("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [exportState, setExportState] = useState<"idle" | "working" | "error">("idle");

  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaLoading, setMfaLoading] = useState(true);
  // The in-progress enrollment (QR + secret shown, waiting on a code) — not
  // yet a real 2FA factor until verifyMfaEnrollment succeeds.
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCodeSvg: string; secret: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  // Removing an existing factor is gated behind the same re-auth pattern as
  // email/password above — turning 2FA off is exactly the kind of action an
  // already-unlocked, signed-in device shouldn't be able to do unprompted.
  const [removingFactorId, setRemovingFactorId] = useState<string | null>(null);
  const [removePassword, setRemovePassword] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    // Doubles as a self-heal for anyone whose stats never made it to the
    // leaderboard (a past sync failure, or an account that predates this
    // feature entirely) — cheap, and this page is a natural place someone
    // lands specifically because they care what the leaderboard shows them.
    syncLeaderboardStats(supabase, user.id)
      .catch((err) => console.error("Failed to sync leaderboard entry:", err))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!supabase || !user) {
      setMfaLoading(false);
      return;
    }
    listMfaFactors()
      .then(setMfaFactors)
      .catch((err) => console.error("Failed to load two-factor status:", err))
      .finally(() => setMfaLoading(false));
  }, [user, listMfaFactors]);

  if (!authLoading && !configured) {
    return (
      <CenteredMessage title="Accounts aren't set up yet" body="This app doesn't have a Supabase project connected yet." />
    );
  }

  if (!authLoading && configured && !user) {
    return <CenteredMessage title="Sign in to manage your account" signIn />;
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

  async function handleExportData() {
    if (!supabase || !user) return;
    setExportState("working");
    try {
      const data = await buildUserDataExport(supabase, user);
      downloadUserDataExport(data, user.id);
      setExportState("idle");
    } catch (err) {
      console.error("Failed to export account data:", err);
      setExportState("error");
    }
  }

  async function handleStartEnroll() {
    setEnrollError(null);
    const result = await enrollMfaFactor();
    if (result.error || !result.factorId || !result.qrCodeSvg || !result.secret) {
      setEnrollError(result.error ?? "Couldn't start setup — try again.");
      return;
    }
    setEnrolling({ factorId: result.factorId, qrCodeSvg: result.qrCodeSvg, secret: result.secret });
    setEnrollCode("");
  }

  async function handleCancelEnroll() {
    const factorId = enrolling?.factorId;
    setEnrolling(null);
    setEnrollCode("");
    setEnrollError(null);
    // Best-effort — an abandoned unverified factor can't be used to sign in
    // either way, this just keeps the account's factor list tidy.
    if (factorId) unenrollMfaFactor(factorId).catch(() => {});
  }

  async function handleVerifyEnroll(e: FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setEnrollError(null);
    setEnrollSubmitting(true);
    const result = await verifyMfaEnrollment(enrolling.factorId, enrollCode.trim());
    setEnrollSubmitting(false);
    if (result.error) {
      setEnrollError(result.error);
      return;
    }
    setEnrolling(null);
    setEnrollCode("");
    setMfaFactors(await listMfaFactors().catch(() => mfaFactors));
  }

  async function handleRemoveFactor(e: FormEvent) {
    e.preventDefault();
    if (!removingFactorId || !user?.email) return;
    setRemoveError(null);
    setRemoveSubmitting(true);
    const reauthError = await reauthenticate(user.email, removePassword);
    if (reauthError) {
      setRemoveError(reauthError);
      setRemoveSubmitting(false);
      return;
    }
    const result = await unenrollMfaFactor(removingFactorId);
    setRemoveSubmitting(false);
    if (result.error) {
      setRemoveError(result.error);
      return;
    }
    setRemovingFactorId(null);
    setRemovePassword("");
    setMfaFactors(await listMfaFactors().catch(() => mfaFactors));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <BackLink href="/" />
      <h1 className="-mt-4 text-2xl font-bold text-[var(--heading)]">Account</h1>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <PageTip id="account" title="Sign-in and security">
            This is separate from your profile — display name, avatar, and bio live on your{" "}
            <Link href="/player" className="underline hover:text-[var(--heading)]">
              profile
            </Link>{" "}
            page instead. Here it&apos;s just email, password, two-factor authentication, and a way
            to export or delete everything tied to this account.
          </PageTip>

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

          <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              Two-factor authentication
            </h2>
            {mfaLoading ? (
              <p className="text-xs text-[var(--faint)]">Checking…</p>
            ) : enrolling ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-[var(--muted)]">
                  Scan this with an authenticator app (Google Authenticator, 1Password, Authy, …), or
                  enter the code below manually.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    one-off data: URI from Supabase at request time, not a
                    static asset next/image's optimizer has anything to do
                    with */}
                <img
                  src={enrolling.qrCodeSvg}
                  alt="QR code — scan with your authenticator app"
                  className="h-40 w-40 self-center rounded-lg bg-white p-2"
                />
                <p className="break-all rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-center font-mono text-xs text-[var(--muted)]">
                  {enrolling.secret}
                </p>
                <form onSubmit={handleVerifyEnroll} className="flex flex-col gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    autoFocus
                    placeholder="123456"
                    maxLength={6}
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value.replace(/[^0-9]/g, ""))}
                    className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-center text-lg tracking-[0.3em] text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                  />
                  {enrollError && <p className="text-xs text-[var(--danger)]">{enrollError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelEnroll}
                      className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={enrollSubmitting || enrollCode.length !== 6}
                      className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {enrollSubmitting ? "Verifying…" : "Turn on"}
                    </button>
                  </div>
                </form>
              </div>
            ) : mfaFactors.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--muted)]">
                  On — signing in also asks for a code from your authenticator app.
                </p>
                {removingFactorId ? (
                  <form
                    onSubmit={handleRemoveFactor}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/40 p-3"
                  >
                    <p className="text-xs text-[var(--muted)]">Enter your password to turn this off.</p>
                    <input
                      type="password"
                      required
                      value={removePassword}
                      onChange={(e) => setRemovePassword(e.target.value)}
                      placeholder="Current password"
                      className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                    />
                    {removeError && <p className="text-xs text-[var(--danger)]">{removeError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRemovingFactorId(null);
                          setRemovePassword("");
                          setRemoveError(null);
                        }}
                        className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={removeSubmitting}
                        className="flex-1 rounded-lg border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {removeSubmitting ? "Turning off…" : "Turn off"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setRemovingFactorId(mfaFactors[0].id)}
                    className="self-start rounded-lg border border-[var(--danger)]/50 px-4 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--panel-soft)]"
                  >
                    Turn off two-factor authentication
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--muted)]">
                  Off. Add an authenticator app for a second code at sign-in, on top of your password.
                </p>
                {enrollError && <p className="text-xs text-[var(--danger)]">{enrollError}</p>}
                <button
                  onClick={handleStartEnroll}
                  className="self-start rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)]"
                >
                  Set up two-factor authentication
                </button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              Your data
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Download everything tied to this account — stats, game history, achievements,
              friends, and multiplayer record — as one JSON file.
            </p>
            <button
              onClick={handleExportData}
              disabled={exportState === "working"}
              className="self-start rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exportState === "working" ? "Preparing your download…" : "Download my data"}
            </button>
            {exportState === "error" && (
              <p className="text-xs text-[var(--danger)]">Couldn&apos;t prepare the download — try again.</p>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              Delete your account
            </h2>
            <p className="text-xs text-[var(--muted)]">
              There&apos;s no self-serve delete yet. To remove your account and everything tied to
              it — stats, game history, achievements, display name, friends, and multiplayer games
              — email{" "}
              <a
                href="mailto:nick.l.dimartino@icloud.com?subject=Delete%20my%20Books%20%26%20Runs%20account"
                className="text-[var(--heading)] underline hover:text-[var(--accent)]"
              >
                nick.l.dimartino@icloud.com
              </a>{" "}
              from the address on your account.
            </p>
          </section>
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
