"use client";

// Sign in / sign up / forgot-password, all as one form that swaps its mode
// rather than three separate pages — plus the two-factor code prompt
// AuthContext's mfaPending state kicks into when an account has 2FA turned
// on (see /account). `?next=` sends a signed-out visitor back to whatever
// in-app page asked them to sign in (e.g. a shared friend link).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { useT } from "../lib/i18n/LocaleProvider";
import { markJustSignedUp } from "../lib/onboardingStore";

export default function SignInPage() {
  const router = useRouter();
  const { t } = useT();
  const { configured, user, mfaPending, signInWithPassword, signUpWithPassword, resetPasswordForEmail, verifyMfaCode } =
    useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot-password">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Return to an in-app page if one was requested (e.g. a shared friend
    // link routes signed-out visitors through here). Only same-origin
    // relative paths — resolve against our origin and confirm it didn't
    // escape. Guards against `//evil.com` and `/\evil.com` (browsers
    // normalise the backslash), which a plain startsWith("/") check misses.
    const next = new URLSearchParams(window.location.search).get("next");
    let dest = "/";
    if (next) {
      try {
        const u = new URL(next, window.location.origin);
        if (u.origin === window.location.origin && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
          dest = u.pathname + u.search + u.hash;
        }
      } catch {
        /* malformed — fall through to "/" */
      }
    }
    router.replace(dest);
  }, [user, router]);

  if (!configured) {
    return (
      <CenteredMessage
        title={t("signIn.notSetUp.title")}
        body={t("signIn.notSetUp.body")}
        backOnClick={() => router.replace("/")}
      />
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
        setError(t("signIn.alreadyRegistered"));
      } else {
        // A genuinely new account either way — flag it now so Home shows
        // the welcome prompt once this device is actually signed in,
        // whether that's immediately (below) or after clicking the
        // confirmation email's link (possibly in a new tab, later).
        markJustSignedUp();
        if (result.confirmationRequired) setCheckEmail(true);
      }
      // Otherwise email confirmation is off in Supabase and the account is
      // already signed in — the effect above will redirect to Home.
      return;
    }
    const result = await signInWithPassword(email, password);
    setPending(false);
    if (result.error) setError(result.error);
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaSubmitting(true);
    const result = await verifyMfaCode(mfaCode.trim());
    setMfaSubmitting(false);
    if (result.error) setMfaError(result.error);
    // On success the session is upgraded to aal2 in place — AuthContext's
    // own auth-state listener resolves `user`, and the effect above redirects.
  }

  function switchMode(next: "sign-in" | "sign-up" | "forgot-password") {
    setMode(next);
    setError(null);
    setResetEmailSent(false);
    setCheckEmail(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-10">
      <BackLink href="/" />
      <h1 className="-mt-4 text-center text-2xl font-bold text-[var(--heading)]">{t("signIn.title")}</h1>

      {mfaPending ? (
        <form onSubmit={handleMfaSubmit} className="flex flex-col gap-3">
          <p className="text-center text-sm text-[var(--muted)]">{t("signIn.mfaPrompt")}</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            placeholder="123456"
            maxLength={6}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ""))}
            className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-center text-lg tracking-[0.3em] text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
          {mfaError && <p className="text-center text-sm text-[var(--danger)]">{mfaError}</p>}
          <button
            type="submit"
            disabled={mfaSubmitting || mfaCode.length !== 6}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
          >
            {mfaSubmitting ? t("signIn.verifying") : t("signIn.verify")}
          </button>
        </form>
      ) : checkEmail ? (
        <>
          <p className="text-center text-sm text-[var(--muted)]">{t("signIn.checkEmail")}</p>
          <button
            onClick={() => switchMode("sign-in")}
            className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
          >
            {t("signIn.backToSignIn")}
          </button>
        </>
      ) : resetEmailSent ? (
        <>
          <p className="text-center text-sm text-[var(--muted)]">
            {t("signIn.resetEmailSent", { email })}
          </p>
          <button
            onClick={() => switchMode("sign-in")}
            className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
          >
            {t("signIn.backToSignIn")}
          </button>
        </>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder={t("signIn.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            />
            {mode !== "forgot-password" && (
              <input
                type="password"
                required
                minLength={6}
                placeholder={t("signIn.password")}
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
              {mode === "sign-in"
                ? t("signIn.title")
                : mode === "sign-up"
                  ? t("signIn.createAccount")
                  : t("signIn.sendResetLink")}
            </button>
          </form>

          {mode !== "forgot-password" && (
            <button
              onClick={() => switchMode("forgot-password")}
              className="-mt-4 text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
            >
              {t("signIn.forgotPassword")}
            </button>
          )}

          <button
            onClick={() => switchMode(mode === "sign-up" ? "sign-in" : mode === "forgot-password" ? "sign-in" : "sign-up")}
            className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
          >
            {mode === "sign-in"
              ? t("signIn.needAccount")
              : mode === "sign-up"
                ? t("signIn.alreadyHaveAccount")
                : t("signIn.backToSignIn")}
          </button>

          <p className="text-center text-xs text-[var(--faint)]">
            {t("signIn.agreePrefix")}{" "}
            <Link href="/terms" className="underline hover:text-[var(--muted)]">
              {t("common.terms")}
            </Link>{" "}
            {t("signIn.agreeAnd")}{" "}
            <Link href="/privacy" className="underline hover:text-[var(--muted)]">
              {t("signIn.privacyPolicy")}
            </Link>
            .
          </p>

          <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
            {t("common.backToHome")}
          </Link>
        </>
      )}
    </main>
  );
}
