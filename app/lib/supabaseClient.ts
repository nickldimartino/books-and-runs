import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// The shared client — a *live binding*, null until loadSupabase() has run
// once. @supabase/supabase-js is ~60 KB gzipped and was previously pulled
// into the initial bundle of every page (via AuthContext in the root
// layout), including static pages that never touch an account. Loading it
// with a dynamic import() splits it into its own chunk that's fetched after
// first paint.
//
// Callers still just read `supabase` and no-op when it's null — the same
// path they already take when Supabase isn't configured at all. AuthContext
// calls loadSupabase() on mount and only sets `user` once it has resolved,
// so every effect gated on `user` is guaranteed a ready client by the time
// it runs. The rare consumer that needs the client *without* a signed-in
// user (the password-reset page) awaits loadSupabase() itself.
export let supabase: SupabaseClient | null = null;

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Ensures the shared Supabase client exists, importing the SDK on first
 * call. Idempotent and safe to call from anywhere that's about to use
 * `supabase`. Resolves to null when Supabase isn't configured.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
      supabase = createClient(url!, anonKey!);
      return supabase;
    });
  }
  return clientPromise;
}
