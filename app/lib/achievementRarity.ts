// "Only 4% of players have this" — reads migration 0029's
// achievement_unlock_counts, a daily-refreshed summary table (client can't
// compute this itself: the underlying player_stats/achievement_counters
// rows are owner-only, by design — see that migration's own doc).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RarityMap {
  /** Keyed by "familyId:tier" — the same key shape the Trophy Case already
   * uses (see player/page.tsx's showcaseKeyFor). */
  [key: string]: number; // 0-100, percent of active accounts with this tier unlocked
}

interface RarityRow {
  family_id: string;
  tier: string;
  unlocked_count: number;
  total_accounts: number;
}

export async function fetchAchievementRarity(supabase: SupabaseClient): Promise<RarityMap> {
  const { data, error } = await supabase
    .from("achievement_unlock_counts")
    .select("family_id, tier, unlocked_count, total_accounts");
  if (error) throw error;
  const map: RarityMap = {};
  for (const row of (data ?? []) as RarityRow[]) {
    map[`${row.family_id}:${row.tier}`] = row.total_accounts > 0 ? (100 * row.unlocked_count) / row.total_accounts : 0;
  }
  return map;
}

/** A short, sensibly-rounded rarity label — "< 1%" instead of "0%" for a
 * true rarity, since a family with a handful of unlocks out of thousands
 * of accounts rounds to 0 and would otherwise read as "nobody has this"
 * rather than "almost nobody." */
export function formatRarity(percent: number | undefined): string | null {
  if (percent == null) return null;
  if (percent <= 0) return null;
  if (percent < 1) return "< 1% of players";
  return `${Math.round(percent)}% of players`;
}
