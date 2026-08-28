import { SupabaseClient } from "@supabase/supabase-js";
import { AchievementProgressState, EMPTY_PROGRESS_STATE } from "@/achievements";

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
 * achievements it just unlocked), so both read player_stats and
 * achievement_counters the same way instead of drifting independently.
 */
export async function loadAchievementProgressState(
  supabase: SupabaseClient,
  userId: string
): Promise<AchievementProgressState> {
  const [statsRes, countersRes] = await Promise.all([
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
  ]);
  return {
    ...EMPTY_PROGRESS_STATE,
    counters: countersRes.data?.counters ?? {},
    gamesPlayed: statsRes.data?.games_played ?? 0,
    gamesWon: statsRes.data?.games_won ?? 0,
    winsByDifficulty: statsRes.data?.wins_by_difficulty ?? {},
  };
}
