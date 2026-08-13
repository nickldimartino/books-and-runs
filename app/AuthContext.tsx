"use client";

import { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";

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

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
  resetPasswordForEmail: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "Sign-in isn't configured yet." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    if (!supabase) return { error: "Sign-in isn't configured yet." };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user?.identities?.length === 0) return { error: null, alreadyRegistered: true };
    return { error: null, confirmationRequired: !data.session };
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    if (!supabase) return { error: "Sign-in isn't configured yet." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return { error: "Sign-in isn't configured yet." };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
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
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      updatePassword,
      signOut,
    }),
    [loading, user, signInWithPassword, signUpWithPassword, resetPasswordForEmail, updatePassword, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
