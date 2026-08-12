"use client";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";

// Matches the CFBundleURLSchemes entry in ios/App/App/Info.plist. Google
// refuses to complete OAuth inside an embedded webview, so on native the
// flow opens in the system browser (@capacitor/browser) and bounces back to
// the app via this custom scheme instead of a plain window.location redirect.
const NATIVE_REDIRECT_URL = "com.booksandruns.app://auth-callback";

interface AuthResult {
  error: string | null;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signUpWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
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

  // Native only: catch the OAuth provider bouncing back via the custom URL
  // scheme, hand the callback URL to Supabase to complete the session, then
  // close the system browser tab that was opened for sign-in.
  useEffect(() => {
    if (!supabase || !Capacitor.isNativePlatform()) return;
    const client = supabase;

    const listener = App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(NATIVE_REDIRECT_URL)) return;
      await client.auth.exchangeCodeForSession(url);
      await Browser.close().catch(() => {});
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "Sign-in isn't configured yet." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "Sign-in isn't configured yet." };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const oauthSignIn = useCallback(async (provider: "google") => {
    if (!supabase) return { error: "Sign-in isn't configured yet." };

    if (Capacitor.isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
      });
      if (error) return { error: error.message };
      if (data.url) await Browser.open({ url: data.url });
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined },
    });
    return { error: error?.message ?? null };
  }, []);

  const signInWithGoogle = useCallback(() => oauthSignIn("google"), [oauthSignIn]);

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
      signInWithGoogle,
      signOut,
    }),
    [loading, user, signInWithPassword, signUpWithPassword, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
