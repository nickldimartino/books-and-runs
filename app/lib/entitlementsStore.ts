"use client";

// Fetches and caches this account's owned Boutique skus — the client's one
// way to know "did I buy this" (or, once the launch-grandfather migration
// runs, "did I get this for free as a pre-launch account"), via
// public.my_entitlements() (security definer, returns just this account's
// own skus — see /tmp/wave/store.md's Data model). Never reads the
// `entitlements` table directly; that RPC is the stable, minimal-surface
// contract this file (and everything downstream of it) codes against.
//
// A small module-level cache (keyed by user id) rather than a React
// Context, matching cardCosmeticUnlocks.ts's useCardUnlockContext /
// cardFaceStore.ts's useCardFace pattern already used for this kind of
// "small bit of account-derived state" elsewhere in app/lib — no provider
// to mount, any component just calls useEntitlements() directly.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Long enough that flipping between Boutique/pickers/Profile doesn't
 * refetch on every mount, short enough that a purchase made in another tab
 * shows up reasonably soon without an explicit refresh. Purchase flows in
 * this tab always force a fresh fetch instead of trusting this window (see
 * pollForEntitlements). */
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  skus: string[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Plain imperative fetch, for callers that aren't a React component (or
 * that need to force past the cache — see pollForEntitlements). Returns []
 * for a signed-out visitor or an unconfigured Supabase project, same as
 * every other account-gated store in this app.
 */
export async function fetchMyEntitlements(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
  opts?: { force?: boolean }
): Promise<string[]> {
  if (!supabase || !userId) return [];
  const cached = cache.get(userId);
  if (!opts?.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.skus;

  const { data, error } = await supabase.rpc("my_entitlements");
  if (error) throw error;
  const skus = Array.isArray(data) ? (data as string[]) : [];
  cache.set(userId, { skus, fetchedAt: Date.now() });
  return skus;
}

/** Drops the cached list for an account — called after a purchase resolves
 * so the very next read (anywhere in the app) goes to the network instead
 * of serving a stale "not owned" for up to CACHE_TTL_MS. */
export function invalidateEntitlementsCache(userId: string | null | undefined): void {
  if (userId) cache.delete(userId);
}

export interface UseEntitlementsResult {
  ownedSkus: ReadonlySet<string>;
  loading: boolean;
  /** Re-fetches (bypassing the cache by default) and updates `ownedSkus`. */
  refresh: (opts?: { force?: boolean }) => Promise<string[]>;
}

/** Live-reads the signed-in account's owned skus, refetching whenever
 * `userId` changes. Signed-out (`userId` null/undefined) reads as an empty
 * set — every "is this owned" check just reads false, same as a
 * still-loading account. */
export function useEntitlements(
  supabase: SupabaseClient | null,
  userId: string | null | undefined
): UseEntitlementsResult {
  const [ownedSkus, setOwnedSkus] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (opts?: { force?: boolean }): Promise<string[]> => {
      if (!supabase || !userId) {
        if (mountedRef.current) {
          setOwnedSkus(new Set());
          setLoading(false);
        }
        return [];
      }
      if (mountedRef.current) setLoading(true);
      try {
        const skus = await fetchMyEntitlements(supabase, userId, opts);
        if (mountedRef.current) setOwnedSkus(new Set(skus));
        return skus;
      } finally {
        if (mountedRef.current) setLoading(false);
      }
      // A failed fetch intentionally leaves `ownedSkus` untouched (no
      // catch/blank-out here) rather than treating a transient network
      // error as "you own nothing."
    },
    [supabase, userId]
  );

  useEffect(() => {
    // Swallowed here (an explicit refresh() call from a caller that wants
    // to react to a failure can still catch it itself) — this mount-time
    // fetch has no one to report an error to, and refresh() already
    // leaves the previous ownedSkus/loading state sane on failure.
    refresh().catch(() => {});
  }, [refresh]);

  return { ownedSkus, loading, refresh };
}

export interface PollForEntitlementsResult {
  skus: string[];
  /** True if `shouldStop` (when given) returned true before attempts ran
   * out — otherwise every attempt was used and the caller should show a
   * "still processing" state rather than assume failure (the webhook may
   * simply be slower than usual, not broken). */
  resolvedEarly: boolean;
}

/**
 * Polls my_entitlements() a few times with backoff — used right after
 * returning from Stripe Checkout, since stripe-webhook writes the new
 * entitlement rows asynchronously and may not have run yet the instant the
 * browser redirects back. Always forces a fresh fetch (never serves the
 * pre-purchase cached list). Stops as soon as `shouldStop` says the
 * expected item(s) showed up, or after ~10s of total waiting either way —
 * this never hangs indefinitely.
 */
export async function pollForEntitlements(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
  opts: { shouldStop?: (skus: string[]) => boolean; onUpdate?: (skus: string[]) => void } = {}
): Promise<PollForEntitlementsResult> {
  const delaysMs = [1000, 1500, 2000, 2500, 3000]; // ~10s total after the first immediate check
  const check = async (): Promise<string[]> => {
    const skus = await fetchMyEntitlements(supabase, userId, { force: true });
    opts.onUpdate?.(skus);
    return skus;
  };

  let skus = await check();
  if (opts.shouldStop?.(skus)) return { skus, resolvedEarly: true };

  for (const delay of delaysMs) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    skus = await check();
    if (opts.shouldStop?.(skus)) return { skus, resolvedEarly: true };
  }
  return { skus, resolvedEarly: false };
}
