"use client";

// The Account page: shown only when signed in. Edit the public display name
// (written to leaderboard_entries), sign out, and the danger-zone actions.
// Redirects to /sign-in when there's no session.

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { MfaFactor, useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { BlockedPlayersSection } from "../components/BlockedPlayersSection";
import { CenteredMessage } from "../components/CenteredMessage";
import { DeleteAccountSection } from "../components/DeleteAccountSection";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { buildUserDataExport, downloadUserDataExport } from "../lib/exportUserData";
import type { TranslationKey } from "../lib/i18n/keys";
import { useT, Vars } from "../lib/i18n/LocaleProvider";
import { syncLeaderboardStats } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";
import { toast } from "../lib/toastBus";
import { translateError } from "../lib/i18n/serverErrors";

type SaveState = "idle" | "saving" | "saved" | "error";

type T = (key: TranslationKey, vars?: Vars) => string;

/**
 * Re-establishes the current session with the account's own email + the
 * password just typed in — Supabase's password auth has no dedicated
 * "confirm you still know your password" challenge, so signing in again
 * (which succeeds or fails exactly like the original sign-in) doubles as
 * one. Required before either email or password can be changed here — see
 * the user's own call on this: an already-unlocked, signed-in device is
 * exactly the scenario this exists to guard against.
 */
async function reauthenticate(email: string, currentPassword: string, t: T): Promise<string | null> {
  if (!supabase) return t("account.error.notConfigured");
  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (error) return t("account.error.wrongPassword");
  // On an account with two-factor enabled, re-authenticating with just a
  // password only re-proves aal1 — if that left the session needing aal2
  // again (rather than Supabase preserving the grant it already had),
  // catch it here instead of silently dropping out of this page mid-action:
  // AuthContext's own auth-state listener would otherwise flip `user` to
  // null the moment this resolves, since it treats aal1-when-aal2-is-
  // required as not really signed in (see its own mfaPending doc).
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal1" && data?.nextLevel === "aal2") {
    return t("account.error.needsFreshSignIn");
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
  const { t } = useT();

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
      .catch((err) => {
        console.error("Failed to sync leaderboard entry:", err);
        toast({ id: "sync-failed", key: "toast.syncFailed", kind: "error" });
      })
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
      <CenteredMessage title={t("account.notConfigured.title")} body={t("account.notConfigured.body")} />
    );
  }

  if (!authLoading && configured && !user) {
    return <CenteredMessage title={t("account.signInGate.title")} signIn />;
  }

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user?.email) return;
    setEmailError(null);
    setEmailSaveState("saving");
    const reauthError = await reauthenticate(user.email, emailPassword, t);
    if (reauthError) {
      setEmailError(reauthError);
      setEmailSaveState("error");
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      setEmailError(translateError(error.message, t));
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
    const reauthError = await reauthenticate(user.email, currentPassword, t);
    if (reauthError) {
      setPasswordError(reauthError);
      setPasswordSaveState("error");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(translateError(error.message, t));
      setPasswordSaveState("error");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setPasswordSaveState("saved");
    toast({ key: "account.password.updated", kind: "success" });
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
      setEnrollError(translateError(result.error, t) || t("account.mfa.startError"));
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
      setEnrollError(translateError(result.error, t));
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
    const reauthError = await reauthenticate(user.email, removePassword, t);
    if (reauthError) {
      setRemoveError(reauthError);
      setRemoveSubmitting(false);
      return;
    }
    const result = await unenrollMfaFactor(removingFactorId);
    setRemoveSubmitting(false);
    if (result.error) {
      setRemoveError(translateError(result.error, t));
      return;
    }
    setRemovingFactorId(null);
    setRemovePassword("");
    setMfaFactors(await listMfaFactors().catch(() => mfaFactors));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <BackLink href="/" />
      <h1 className="-mt-4 text-2xl font-bold text-[var(--heading)]">{t("account.title")}</h1>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <PageTip id="account" title={t("account.tip.title")}>
            {t("account.tip.bodyPrefix")}{" "}
            <Link href="/player" className="underline hover:text-[var(--heading)]">
              {t("account.tip.profileLink")}
            </Link>{" "}
            {t("account.tip.bodySuffix")}
          </PageTip>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("account.email.heading")}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {t("account.email.signedInAs", { email: user?.email ?? "" })}
            </p>
            <form onSubmit={handleChangeEmail} className="flex flex-col gap-2">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t("account.email.newEmailPlaceholder")}
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              <input
                type="password"
                required
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder={t("account.email.confirmPasswordPlaceholder")}
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              {emailError && <p className="text-xs text-[var(--danger)]">{emailError}</p>}
              {emailSaveState === "saved" && (
                <p className="text-xs text-[var(--muted)]">
                  {t("account.email.checkToConfirm", {
                    email: newEmail || t("account.email.yourNewEmailAddress"),
                  })}
                </p>
              )}
              <button
                type="submit"
                disabled={emailSaveState === "saving"}
                className="rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {emailSaveState === "saving" ? t("common.saving") : t("account.email.submit")}
              </button>
            </form>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("account.password.heading")}
            </h2>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-2">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("account.currentPasswordPlaceholder")}
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("account.password.newPasswordPlaceholder")}
                className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              {passwordError && <p className="text-xs text-[var(--danger)]">{passwordError}</p>}
              {passwordSaveState === "saved" && (
                <p className="text-xs text-[var(--muted)]">{t("account.password.updated")}</p>
              )}
              <button
                type="submit"
                disabled={passwordSaveState === "saving"}
                className="rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {passwordSaveState === "saving" ? t("common.saving") : t("account.password.submit")}
              </button>
            </form>
          </section>

          <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("account.mfa.heading")}
            </h2>
            {mfaLoading ? (
              <p className="text-xs text-[var(--faint)]">{t("account.mfa.checking")}</p>
            ) : enrolling ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-[var(--muted)]">{t("account.mfa.scanInstructions")}</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    one-off data: URI from Supabase at request time, not a
                    static asset next/image's optimizer has anything to do
                    with */}
                <img
                  src={enrolling.qrCodeSvg}
                  alt={t("account.mfa.qrAlt")}
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
                    placeholder={t("account.mfa.codePlaceholder")}
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
                      {t("common.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={enrollSubmitting || enrollCode.length !== 6}
                      className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {enrollSubmitting ? t("signIn.verifying") : t("account.mfa.turnOn")}
                    </button>
                  </div>
                </form>
              </div>
            ) : mfaFactors.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--muted)]">{t("account.mfa.onDescription")}</p>
                {removingFactorId ? (
                  <form
                    onSubmit={handleRemoveFactor}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/40 p-3"
                  >
                    <p className="text-xs text-[var(--muted)]">{t("account.mfa.removePrompt")}</p>
                    <input
                      type="password"
                      required
                      value={removePassword}
                      onChange={(e) => setRemovePassword(e.target.value)}
                      placeholder={t("account.currentPasswordPlaceholder")}
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
                        {t("common.cancel")}
                      </button>
                      <button
                        type="submit"
                        disabled={removeSubmitting}
                        className="flex-1 rounded-lg border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {removeSubmitting ? t("account.mfa.turningOff") : t("account.mfa.turnOff")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setRemovingFactorId(mfaFactors[0].id)}
                    className="self-start rounded-lg border border-[var(--danger)]/50 px-4 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--panel-soft)]"
                  >
                    {t("account.mfa.turnOffButton")}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--muted)]">{t("account.mfa.offDescription")}</p>
                {enrollError && <p className="text-xs text-[var(--danger)]">{enrollError}</p>}
                <button
                  onClick={handleStartEnroll}
                  className="self-start rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)]"
                >
                  {t("account.mfa.setUpButton")}
                </button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("account.data.heading")}
            </h2>
            <p className="text-xs text-[var(--muted)]">{t("account.data.description")}</p>
            <button
              onClick={handleExportData}
              disabled={exportState === "working"}
              className="self-start rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exportState === "working" ? t("account.data.preparing") : t("account.data.downloadButton")}
            </button>
            {exportState === "error" && (
              <p className="text-xs text-[var(--danger)]">{t("account.data.exportError")}</p>
            )}
          </section>

          <BlockedPlayersSection />

          <DeleteAccountSection />
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        {t("common.backToHome")}
      </Link>
    </main>
  );
}
