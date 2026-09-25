"use client";

// Sign in / sign up / forgot-password, all as one form that swaps its mode
// rather than three separate pages — plus the two-factor code prompt
// AuthContext's mfaPending state kicks into when an account has 2FA turned
// on (see /account). `?next=` sends a signed-out visitor back to whatever
// in-app page asked them to sign in (e.g. a shared friend link).
//
// Beyond email + password there is a passwordless path (emailed one-time link,
// or the 6-digit code from the same email) and — behind the
// NEXT_PUBLIC_AUTH_PROVIDERS config flag, off by default — Google/Apple
// buttons. Both come back to this page (a link / OAuth redirect lands here
// with tokens in the URL hash, which Supabase's client consumes on load), so
// the redirect effect below also handles new accounts created implicitly.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { useT } from "../lib/i18n/LocaleProvider";
import {
  enabledOAuthProviders,
  isFreshAccount,
  OAUTH_PROVIDER_LABEL,
  parseAuthRedirectError,
  safeNextPath,
  stashNextPath,
  takeStashedNext,
} from "../lib/authRedirect";
import { markJustSignedUp } from "../lib/onboardingStore";
import { translateError } from "../lib/i18n/serverErrors";

const OAUTH_PROVIDERS = enabledOAuthProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS);

export default function SignInPage() {
  const router = useRouter();
  const { t } = useT();
  const {
    configured,
    user,
    mfaPending,
    signInWithPassword,
    signUpWithPassword,
    signInWithEmailLink,
    verifyEmailCode,
    signInWithOAuth,
    resetPasswordForEmail,
    verifyMfaCode,
  } = useAuth();
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
  // Passwordless: the address a sign-in link was sent to (null = not sent).
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const destRef = useRef<string | null>(null);

  // A used/expired emailed link (or a denied OAuth consent) comes back as
  // `#error=…&error_description=…` — surface it once, translated.
  useEffect(() => {
    const err = parseAuthRedirectError(window.location.hash || window.location.search);
    if (err) setError(translateError(err, t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  useEffect(() => {
    if (!user) return;
    // A magic link / OAuth login creates accounts implicitly (password
    // sign-up flags itself below), so a brand-new account is inferred from
    // its own timestamps — Home then shows the welcome onboarding.
    if (isFreshAccount(user)) markJustSignedUp();
    // Return to an in-app page if one was requested (e.g. a shared friend
    // link routes signed-out visitors through here) — from this page's own
    // `?next=`, or the copy stashed before an emailed link/OAuth redirect
    // (which reopens this page without it, maybe in another tab). Computed
    // once: Supabase can fire SIGNED_IN more than once, and the stash is
    // consumed on read. safeNextPath only allows same-origin relative paths
    // (guards `//evil.com` and `/\evil.com`).
    if (destRef.current === null) {
      const fromUrl = new URLSearchParams(window.location.search).get("next");
      destRef.current = safeNextPath(fromUrl ?? takeStashedNext(), window.location.origin);
    }
    router.replace(destRef.current);
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
        setError(translateError(result.error, t));
      } else {
        setResetEmailSent(true);
      }
      return;
    }
    if (mode === "sign-up") {
      const result = await signUpWithPassword(email, password);
      setPending(false);
      if (result.error) {
        setError(translateError(result.error, t));
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
    if (result.error) setError(translateError(result.error, t));
  }

  // Remember where to go before leaving for an emailed link / OAuth redirect.
  function stashDestination() {
    stashNextPath(new URLSearchParams(window.location.search).get("next"));
  }

  async function handleEmailLink() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t("signIn.magic.needEmail"));
      return;
    }
    setPending(true);
    stashDestination();
    const result = await signInWithEmailLink(email.trim());
    setPending(false);
    if (result.error) setError(translateError(result.error, t));
    else setLinkSentTo(email.trim());
  }

  async function handleEmailCode(e: FormEvent) {
    e.preventDefault();
    if (!linkSentTo) return;
    setError(null);
    setPending(true);
    const result = await verifyEmailCode(linkSentTo, emailCode.trim());
    setPending(false);
    if (result.error) setError(translateError(result.error, t));
    // On success the session appears via AuthContext's auth-state listener
    // and the redirect effect above takes over.
  }

  async function handleOAuth(provider: (typeof OAUTH_PROVIDERS)[number]) {
    setError(null);
    stashDestination();
    const result = await signInWithOAuth(provider);
    if (result.error) setError(translateError(result.error, t));
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaSubmitting(true);
    const result = await verifyMfaCode(mfaCode.trim());
    setMfaSubmitting(false);
    if (result.error) setMfaError(translateError(result.error, t));
    // On success the session is upgraded to aal2 in place — AuthContext's
    // own auth-state listener resolves `user`, and the effect above redirects.
  }

  function switchMode(next: "sign-in" | "sign-up" | "forgot-password") {
    setMode(next);
    setError(null);
    setResetEmailSent(false);
    setCheckEmail(false);
    setLinkSentTo(null);
    setEmailCode("");
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
      ) : linkSentTo ? (
        <>
          <p className="text-center text-sm text-[var(--muted)]">{t("signIn.magic.sent", { email: linkSentTo })}</p>
          <form onSubmit={handleEmailCode} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={t("signIn.magic.codeLabel")}
              placeholder={t("signIn.magic.codePlaceholder")}
              maxLength={8}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/[^0-9]/g, ""))}
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-center text-lg tracking-[0.3em] text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            />
            {error && <p className="text-center text-sm text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={pending || emailCode.length < 6}
              className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
            >
              {pending ? t("signIn.verifying") : t("signIn.verify")}
            </button>
          </form>
          <button
            onClick={() => switchMode("sign-in")}
            className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
          >
            {t("signIn.backToSignIn")}
          </button>
        </>
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

          {mode !== "forgot-password" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-xs text-[var(--faint)]" aria-hidden="true">
                <span className="h-px flex-1 bg-[var(--border)]" />
                {t("signIn.or")}
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <button
                type="button"
                onClick={handleEmailLink}
                disabled={pending}
                className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--heading)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
              >
                {t("signIn.magic.button")}
              </button>
              {OAUTH_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleOAuth(p)}
                  className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--heading)] hover:bg-[var(--panel-soft)]"
                >
                  {t("signIn.oauth.continueWith", { provider: OAUTH_PROVIDER_LABEL[p] })}
                </button>
              ))}
            </div>
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
