// Assembles the one `AchievementProgressState` object that src/achievements.ts
// and src/leveling.ts (both pure) need in order to compute unlocks and XP.
// It stitches together three Supabase reads — player_stats, achievement_counters,
// and the MP stats RPC — into that shape, falling back to empty values for a
// signed-out user or a project missing the MP migration. Used by the
// Achievements page, the Profile page, and PlayerLevelContext.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AchievementProgressState, EMPTY_PROGRESS_STATE } from "@/achievements";
import { EMPTY_MP_STATS, getMyMpStats } from "./mpStore";

interface PlayerStatsRow {
  games_played: number;
  games_won: number;
  best_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

interface AchievementCountersRow {
  counters: Record<string, number>;
}

/**
 * Fetches the raw data allAchievements()/levelProgress() need to evaluate
 * every family — shared by PlayerLevelContext (the account's current level)
 * and GameOverScreen (diffing before/after this game to list which specific
 * achievements it just unlocked), so both read player_stats,
 * achievement_counters, and the multiplayer numbers the same way instead of
 * drifting independently. The mp_my_stats() call is best-effort (migration
 * 0011) — it falls back to zeros rather than failing the whole load.
 */
export async function loadAchievementProgressState(
  supabase: SupabaseClient,
  userId: string
): Promise<AchievementProgressState> {
  const [statsRes, countersRes, mpStats] = await Promise.all([
    supabase
      .from("player_stats")
      .select("games_played, games_won, wins_by_difficulty")
      .eq("user_id", userId)
      .maybeSingle<PlayerStatsRow>(),
    supabase
      .from("achievement_counters")
      .select("counters")
      .eq("user_id", userId)
      .maybeSingle<AchievementCountersRow>(),
    getMyMpStats(supabase).catch(() => ({ ...EMPTY_MP_STATS })),
  ]);
  return {
    ...EMPTY_PROGRESS_STATE,
    counters: countersRes.data?.counters ?? {},
    gamesPlayed: statsRes.data?.games_played ?? 0,
    gamesWon: statsRes.data?.games_won ?? 0,
    winsByDifficulty: statsRes.data?.wins_by_difficulty ?? {},
    mpGamesPlayed: mpStats.played,
    mpGamesWon: mpStats.won,
    mpBestWinStreak: mpStats.bestWinStreak,
  };
}
