"use client";

// Unlock checking for card faces (cardFaceStore.ts) and card backs
// (cardBackStore.ts) — reuses cosmeticUnlocks.ts's CosmeticUnlockRule/
// isCosmeticUnlocked/cosmeticRequirementLabel directly (they're pure
// functions with zero server dependency already), but is kept as its own
// small file rather than folded into cosmeticUnlocks.ts, because that
// file's own header comment ("mirrors, but isn't the source of truth for...
// the server trigger") would be actively misleading here: there IS no
// server trigger for card face/back. This is genuinely client-side-only
// enforcement, a deliberate choice, not an oversight — see the design
// note below.
//
// Why client-side-only, unlike badge/frame/title/banner: a card face/back
// is pure personal-taste rendering with zero competitive stakes. Nobody
// else's trust in a leaderboard number, a rank, or a "did this really
// happen" claim depends on which pip layout your own cards draw with — the
// server-side investment behind leaderboard_entries (migrations 0035/0048/
// 0050) was specifically about numbers other players compare against, and
// that proportionality argument doesn't apply here. A sophisticated user
// could force a locked style open via devtools; the blast radius is
// entirely their own local rendering, never visible to or trusted by an
// opponent. Folding this into the real cosmetic_unlocks/leaderboard_entries
// machinery would mean moving these preferences off the `settings` table
// (a completely different, currently zero-enforcement sync path — see
// accountSettingsSync.ts) and reconciling migration 0028's separate
// showcase_card_back/showcase_card_face public-mirror columns — real
// migration risk for a tier that was never asking for it.
//
// The unlock context here is deliberately much smaller than
// cosmeticUnlocks.ts's full UnlockContext (level + achievement progress +
// four different streak/stat fields) — every rule actually used by a card
// face/back today only needs `level`, so that's the only thing fetched.
// Extend `CardUnlockContext`/useCardUnlockLevel below if a future style
// ever needs more.

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CosmeticUnlockRule, cosmeticRequirementLabel, isCosmeticUnlocked, makeUnlockContext } from "./cosmeticUnlocks";
import { EMPTY_PROGRESS_STATE } from "@/achievements";

export function isCardCosmeticUnlocked(unlock: CosmeticUnlockRule | undefined, level: number): boolean {
  if (!unlock) return true;
  return isCosmeticUnlocked(unlock, makeUnlockContext({ level, progress: EMPTY_PROGRESS_STATE }));
}

export function cardCosmeticRequirementLabel(unlock: CosmeticUnlockRule): string {
  return cosmeticRequirementLabel(unlock);
}

/**
 * The one piece of live account data a card face/back gate needs — a
 * single `compute_level` RPC call (already self-scope-checked server-side,
 * see migration 0049) rather than the fuller fetch player/page.tsx's own
 * unlockCtx does, since level is the only rule kind any card face/back
 * currently uses. Signed-out or still-loading both read as level 0, which
 * correctly locks every gated style rather than guessing.
 */
export function useCardUnlockLevel(supabase: SupabaseClient | null, userId: string | null | undefined): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!supabase || !userId) {
      setLevel(0);
      return;
    }
    let cancelled = false;
    supabase
      .rpc("compute_level", { p_user_id: userId })
      .then(({ data }: { data: number | null }) => {
        if (!cancelled) setLevel(typeof data === "number" ? data : 0);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);
  return level;
}
