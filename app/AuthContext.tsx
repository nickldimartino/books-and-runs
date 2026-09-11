"use client";

// The app's single source of truth for "who is signed in". Wraps Supabase
// Auth (email + password only) and exposes it as a context. Everything
// account-related is optional: when no Supabase project is configured
// (`isSupabaseConfigured` false) this provider still mounts, `user` stays
// null forever, and the game plays fine — only stats, the leaderboard, and
// multiplayer are unavailable. Consumers that need an account gate on
// `configured` and `user`.

import type { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { installErrorReporter, setErrorUser } from "./lib/errorReporter";
import { isSupabaseConfigured, loadSupabase } from "./lib/supabaseClient";

interface AuthResult {
  error: string | null;
}

interface SignUpResult extends AuthResult {
  // Supabase's anti-enumeration behavior: signing up with an email that's
  // already registered returns success with no error, but `identities` is
  // empty and no email goes out. Without checking this, the UI would tell
  // an existing user to "check your email" for a message that never sends.
  alreadyRegistered?: boolean;
  // False when "Confirm email" is off in Supabase and the new account is
  // signed in immediately — no confirmation email is sent in that case.
  confirmationRequired?: boolean;
}

export interface MfaFactor {
  id: string;
  friendlyName: string | null;
}

interface MfaEnrollResult extends AuthResult {
  factorId?: string;
  /** A data: URI, usable directly as an <img src> — not raw SVG markup. */
  qrCodeSvg?: string;
  /** Manual-entry fallback for an authenticator app that can't scan. */
  secret?: string;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  /** True once signed in at aal1 but the account has a verified TOTP
   * factor requiring aal2 this session — `user` stays null and the
   * sign-in page shows a code-entry step instead of finishing until
   * verifyMfaCode succeeds. Never true for an account with no factor
   * enrolled — password alone is already its full sign-in. */
  mfaPending: boolean;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
  resetPasswordForEmail: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Completes the pending MFA challenge from sign-in. */
  verifyMfaCode: (code: string) => Promise<AuthResult>;
  /** Verified TOTP factors on this account (Account settings). */
  listMfaFactors: () => Promise<MfaFactor[]>;
  /** Starts enrolling a new TOTP factor — present the QR/secret and collect
   * a code, then call verifyMfaEnrollment with the returned factorId. */
  enrollMfaFactor: () => Promise<MfaEnrollResult>;
  /** Confirms a freshly-enrolled factor with a code from the authenticator
   * app — this is what actually turns 2FA on for the account. */
  verifyMfaEnrollment: (factorId: string, code: string) => Promise<AuthResult>;
  /** Removes a factor — abandoning an in-progress (unverified) enrollment,
   * or turning 2FA off entirely. */
  unenrollMfaFactor: (factorId: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// A session at aal1 with a verified TOTP factor still needs aal2 before
// it's "signed in" as far as this app is concerned — resolves what to
// actually expose as `user`/`mfaPending` for both the initial getSession()
// read and every onAuthStateChange event, so the two can't drift apart.
export async function resolveAuthState(
  client: NonNullable<Awaited<ReturnType<typeof loadSupabase>>>,
  session: Session | null
): Promise<{ user: User | null; mfaPending: boolean }> {
  if (!session) return { user: null, mfaPending: false };
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal1" && data?.nextLevel === "aal2") {
    return { user: null, mfaPending: true };
  }
  return { user: session.user, mfaPending: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  // Wire global error capture once, and keep the reporter's user id current.
  useEffect(() => {
    installErrorReporter();
  }, []);
  useEffect(() => {
    setErrorUser(user?.id ?? null);
  }, [user]);

  useEffect(() => {
    // Kicks off the SDK's dynamic import (see loadSupabase). `user` is only
    // set once this resolves, so every consumer effect gated on `user` is
    // guaranteed a ready client.
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    loadSupabase().then((client) => {
      if (cancelled) return;
      if (!client) {
        setLoading(false);
        return;
      }
      client.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
        const resolved = await resolveAuthState(client, data.session);
        if (cancelled) return;
        setUser(resolved.user);
        setMfaPending(resolved.mfaPending);
        setLoading(false);
      });
      const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
        resolveAuthState(client, session).then((resolved) => {
          if (cancelled) return;
          setUser(resolved.user);
          setMfaPending(resolved.mfaPending);
        });
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user?.identities?.length === 0) return { error: null, alreadyRegistered: true };
    return { error: null, confirmationRequired: !data.session };
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { error } = await client.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const verifyMfaCode = useCallback(async (code: string) => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { data, error: listError } = await client.auth.mfa.listFactors();
    if (listError) return { error: listError.message };
    const factor = data?.totp?.[0];
    if (!factor) return { error: "No authenticator app is set up on this account." };
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    // Success updates the session in place — the onAuthStateChange listener
    // above re-resolves user/mfaPending from it, nothing to set here.
    return { error: error?.message ?? null };
  }, []);

  const listMfaFactors = useCallback(async (): Promise<MfaFactor[]> => {
    const client = await loadSupabase();
    if (!client) return [];
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.totp ?? []).map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null }));
  }, []);

  const enrollMfaFactor = useCallback(async (): Promise<MfaEnrollResult> => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
    if (error) return { error: error.message };
    return { error: null, factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret };
  }, []);

  const verifyMfaEnrollment = useCallback(async (factorId: string, code: string) => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    return { error: error?.message ?? null };
  }, []);

  const unenrollMfaFactor = useCallback(async (factorId: string) => {
    const client = await loadSupabase();
    if (!client) return { error: "Sign-in isn't configured yet." };
    const { error } = await client.auth.mfa.unenroll({ factorId });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    const client = await loadSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut();
    // No user-facing surface for this (the button has no error state) — but
    // every other auth method here at least surfaces its error, so silently
    // discarding this one would be the odd one out.
    if (error) console.error("Sign out failed:", error.message);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      user,
      mfaPending,
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      updatePassword,
      signOut,
      verifyMfaCode,
      listMfaFactors,
      enrollMfaFactor,
      verifyMfaEnrollment,
      unenrollMfaFactor,
    }),
    [
      loading,
      user,
      mfaPending,
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      updatePassword,
      signOut,
      verifyMfaCode,
      listMfaFactors,
      enrollMfaFactor,
      verifyMfaEnrollment,
      unenrollMfaFactor,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
