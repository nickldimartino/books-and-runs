import { SupabaseClient } from "@supabase/supabase-js";
import { AchievementProgressState, allAchievements } from "@/achievements";
import { levelProgress } from "@/leveling";

interface PlayerStatsRow {
  games_played: number;
  games_won: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

interface AchievementCountersRow {
  counters: Record<string, number>;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  level: number;
  total_xp: number;
  achievements_unlocked: number;
  games_played: number;
  games_won: number;
  average_score: number | null;
  worst_score: number | null;
  updated_at: string;
}

/**
 * "Player 4821" — a stable placeholder for any account that hasn't set a
 * display name yet (leaderboard_entries.display_name stays null in the
 * database until they do, rather than storing generated text that would
 * then need to be told apart from a real, deliberately-chosen name). Purely
 * a display-time fallback; the same account always gets the same number,
 * derived from its own user id.
 */
export function displayNameFor(entry: Pick<LeaderboardEntry, "user_id" | "display_name">): string {
  if (entry.display_name && entry.display_name.trim()) return entry.display_name.trim();
  const hex = entry.user_id.replace(/-/g, "").slice(-4) || "0000";
  return `Player ${parseInt(hex, 16) % 10000}`;
}

/**
 * Recomputes and upserts the signed-in user's own leaderboard row — see the
 * migration's own comment for why this is self-reported (computed here,
 * client-side, with the exact same scoring logic used everywhere else in
 * the app) rather than derived server-side. Safe and cheap to call
 * opportunistically (a game finishing, the Account/Leaderboard pages
 * loading) — it only ever overwrites the stat columns, never
 * `display_name` (that's updateLeaderboardDisplayName's job below), so
 * calling this can never clobber a name someone already chose.
 */
export async function syncLeaderboardStats(supabase: SupabaseClient, userId: string): Promise<void> {
  const [statsRes, countersRes] = await Promise.all([
    supabase
      .from("player_stats")
      .select("games_played, games_won, best_score, worst_score, average_score, wins_by_difficulty")
      .eq("user_id", userId)
      .maybeSingle<PlayerStatsRow>(),
    supabase
      .from("achievement_counters")
      .select("counters")
      .eq("user_id", userId)
      .maybeSingle<AchievementCountersRow>(),
  ]);
  if (statsRes.error) throw statsRes.error;
  if (countersRes.error) throw countersRes.error;

  const stats = statsRes.data;
  const progress: AchievementProgressState = {
    counters: countersRes.data?.counters ?? {},
    gamesPlayed: stats?.games_played ?? 0,
    gamesWon: stats?.games_won ?? 0,
    bestScore: stats?.best_score ?? null,
    winsByDifficulty: stats?.wins_by_difficulty ?? {},
  };
  const level = levelProgress(progress);
  const achievementsUnlocked = allAchievements(progress).filter((a) => a.unlocked).length;

  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    level: level.level,
    total_xp: level.totalXp,
    achievements_unlocked: achievementsUnlocked,
    games_played: stats?.games_played ?? 0,
    games_won: stats?.games_won ?? 0,
    average_score: stats?.average_score ?? null,
    worst_score: stats?.worst_score ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Sets (or clears, with null) just the signed-in user's own display name —
 * never touches the stat columns, so it can't undo a sync still in flight. */
export async function updateLeaderboardDisplayName(
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
