"use client";

// Unlock checking for table themes (themeStore.ts) — reuses
// cosmeticUnlocks.ts's CosmeticUnlockRule/isCosmeticUnlocked directly, the
// same way cardCosmeticUnlocks.ts does for card face/back. Kept as its own
// tiny file rather than folded into cardCosmeticUnlocks.ts: the "why
// client-side-only" reasoning there is about card faces/backs
// specifically, and a theme's own gate is genuinely simpler still — every
// theme's `unlock` (when present at all) is always `{ kind: "boutique" }`,
// never `{ kind: "level" }` or anything progression-based (see
// themeStore.ts's own doc), so this never needs a `level` field at all,
// unlike CardUnlockContext.
//
// Why client-side-only: same proportionality argument as card face/back
// (cardCosmeticUnlocks.ts's own doc) — a table theme is pure personal-taste
// rendering nobody else ever sees or competes on, so it doesn't warrant a
// server-side cosmetic_unlocks row/trigger the way badge/frame/title/
// banner do.

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CosmeticUnlockRule, isCosmeticUnlocked, makeUnlockContext } from "./cosmeticUnlocks";
import { useEntitlements } from "./entitlementsStore";
import { EMPTY_PROGRESS_STATE } from "@/achievements";

export function isThemeUnlocked(
  unlock: CosmeticUnlockRule | undefined,
  isCreator = false,
  ownedSkus: ReadonlySet<string> = new Set()
): boolean {
  if (!unlock) return true;
  // level is irrelevant to every rule a theme actually uses (always
  // "boutique", which only ever checks isCreator/ownedSkus) — 0 here is
  // never read.
  return isCosmeticUnlocked(unlock, makeUnlockContext({ level: 0, isCreator, ownedSkus, progress: EMPTY_PROGRESS_STATE }));
}

interface ThemeUnlockContext {
  isCreator: boolean;
  /** This account's owned Boutique skus — see entitlementsStore.ts. */
  ownedSkus: ReadonlySet<string>;
}

/**
 * The live account data a theme gate needs — just this account's own
 * `leaderboard_entries.is_creator` (readable by any signed-in user for
 * their own row) plus its owned skus. Signed-out or still-loading both read
 * as not-creator/no owned skus, which correctly locks every gated theme
 * rather than guessing.
 */
export function useThemeUnlockContext(
  supabase: SupabaseClient | null,
  userId: string | null | undefined
): ThemeUnlockContext {
  const [isCreator, setIsCreator] = useState(false);
  const { ownedSkus } = useEntitlements(supabase, userId);
  useEffect(() => {
    if (!supabase || !userId) {
      setIsCreator(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("leaderboard_entries")
      .select("is_creator")
      .eq("user_id", userId)
      .maybeSingle()
      .then((res) => {
        if (cancelled) return;
        setIsCreator((res.data as { is_creator?: boolean } | null)?.is_creator ?? false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);
  return { isCreator, ownedSkus };
}
