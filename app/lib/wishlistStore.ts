"use client";

// Boutique wishlist (migration 0093) — bookmark an item you're not ready to
// buy yet. A plain `boutique_wishlist(user_id, sku)` table, RLS-scoped to
// its own owner, read/written directly (no RPC needed — unlike blocks
// (safetyStore.ts), nobody else's visibility depends on this data, so
// there's nothing a security-definer function needs to protect).
//
// Mirrors entitlementsStore.ts's shape (a Set of skus, a hook that fetches
// on mount) since Boutique already reads that the same way, but skips its
// module-level cache — a wishlist has no external writer (no webhook) to
// go stale against, so there's nothing a TTL would protect here.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchMyWishlist(
  supabase: SupabaseClient | null,
  userId: string | null | undefined
): Promise<string[]> {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("boutique_wishlist").select("sku").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.sku as string);
}

export async function addToWishlist(supabase: SupabaseClient, userId: string, sku: string): Promise<void> {
  const { error } = await supabase.from("boutique_wishlist").upsert({ user_id: userId, sku });
  if (error) throw error;
}

export async function removeFromWishlist(supabase: SupabaseClient, userId: string, sku: string): Promise<void> {
  const { error } = await supabase.from("boutique_wishlist").delete().eq("user_id", userId).eq("sku", sku);
  if (error) throw error;
}

export interface UseWishlistResult {
  wishlistSkus: ReadonlySet<string>;
  loading: boolean;
  /** Optimistic — flips the local set immediately, then writes through;
   * reverts on failure so a flaky connection never leaves the star lying
   * about what's actually saved. */
  toggle: (sku: string) => Promise<void>;
}

export function useWishlist(supabase: SupabaseClient | null, userId: string | null | undefined): UseWishlistResult {
  const [wishlistSkus, setWishlistSkus] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) {
      setWishlistSkus(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMyWishlist(supabase, userId)
      .then((skus) => {
        if (mountedRef.current) setWishlistSkus(new Set(skus));
      })
      .catch((err) => console.error("Failed to load Boutique wishlist:", err))
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [supabase, userId]);

  const toggle = useCallback(
    async (sku: string) => {
      if (!supabase || !userId) return;
      const wasWishlisted = wishlistSkus.has(sku);
      setWishlistSkus((prev) => {
        const next = new Set(prev);
        if (wasWishlisted) next.delete(sku);
        else next.add(sku);
        return next;
      });
      try {
        if (wasWishlisted) await removeFromWishlist(supabase, userId, sku);
        else await addToWishlist(supabase, userId, sku);
      } catch (err) {
        console.error("Failed to update Boutique wishlist:", err);
        setWishlistSkus((prev) => {
          const reverted = new Set(prev);
          if (wasWishlisted) reverted.add(sku);
          else reverted.delete(sku);
          return reverted;
        });
      }
    },
    [supabase, userId, wishlistSkus]
  );

  return { wishlistSkus, loading, toggle };
}
