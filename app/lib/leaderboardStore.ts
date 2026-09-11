// The leaderboard is a single public table (`leaderboard_entries`, migration
// 0006) with one self-reported row per account — there's no server job
// aggregating it, each client just upserts its own snapshot. `syncLeaderboardStats`
// is that upsert; it's called after every finished game and derives every
// column (stats, level, XP, MP columns) from the same progress data the
// Achievements page uses. The MP columns go in a separate best-effort upsert
// so a project without migration 0011 still gets a working core sync.
// `displayNameFor` is the shared "name or fallback" renderer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AchievementProgressState, allAchievements } from "@/achievements";
import { levelProgress } from "@/leveling";
import { EMPTY_MP_STATS, getMyMpStats } from "./mpStore";

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
  // Broadcast by syncDailyDealStreak below, not syncLeaderboardStats — see
  // its own doc for why these two are the one pair of columns here that
  // don't come from player_stats/achievement_counters.
  daily_deal_streak: number;
  daily_deal_best_streak: number;
  mp_games_played: number;
  mp_games_won: number;
  mp_best_win_streak: number;
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
  const [statsRes, countersRes, mpStats] = await Promise.all([
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
    // Best-effort (migration 0011) — a missing RPC just leaves MP stats at 0.
    getMyMpStats(supabase).catch(() => ({ ...EMPTY_MP_STATS })),
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
    mpGamesPlayed: mpStats.played,
    mpGamesWon: mpStats.won,
    mpBestWinStreak: mpStats.bestWinStreak,
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

  // The mp_* columns land in their own write so a project that hasn't run
  // migration 0011 yet still gets a working core sync (level/XP already
  // account for MP achievements via `progress` above).
  if (mpStats.played > 0) {
    const { error: mpError } = await supabase.from("leaderboard_entries").upsert({
      user_id: userId,
      mp_games_played: mpStats.played,
      mp_games_won: mpStats.won,
      mp_best_win_streak: mpStats.bestWinStreak,
      updated_at: new Date().toISOString(),
    });
    if (mpError) console.error("Failed to sync MP leaderboard columns (run migration 0011):", mpError);
  }
}

/** Max stored display-name length. Matches the DB CHECK in migration 0013
 * and the `maxLength` on the Account page's input. */
export const MAX_DISPLAY_NAME_LENGTH = 24;

/** Clamp length and strip control / bidi-override chars before a name is
 * stored — the Account input already caps length, but a direct call
 * shouldn't be able to persist something oversized or layout-breaking that
 * then renders to every other player on the leaderboard. */
function sanitizeDisplayName(name: string | null): string | null {
  if (name == null) return null;
  const cleaned = name.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/**
 * The signed-in account's own chosen display name, or null if they haven't
 * set one — the raw value (never the "Player 4821" placeholder), so callers
 * can tell "no name chosen yet" apart from an actual choice and fall back
 * however makes sense for where they're showing it (the Account page shows
 * the placeholder as a preview; New Game's seat-0 lock falls back to "You"
 * instead — see app/new-game/local/page.tsx).
 */
export async function fetchOwnDisplayName(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle<{ display_name: string | null }>();
  if (error) throw error;
  return data?.display_name?.trim() || null;
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
    display_name: sanitizeDisplayName(displayName),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Broadcasts the signed-in user's current Daily Deal streak (see
 * dailyDealStore.ts) to their leaderboard row — called right after
 * GameOverScreen records a Daily Deal result locally, not from
 * syncLeaderboardStats above: unlike every other column on this table,
 * these don't come from player_stats/achievement_counters, they come
 * straight from localStorage, so there's nothing in Supabase for
 * syncLeaderboardStats to recompute them from. Only ever writes these three
 * columns (plus display_name's own untouched-by-this precedent), so it
 * can't clobber a sync still in flight the same way updateLeaderboardDisplayName
 * can't. Safe to call even for an account that's never played a single
 * real tracked game — upsert fills in every other column's own default
 * (0/null) for a first-ever partial insert. `lastPlayedDate` is what makes
 * pullDailyDealStreak below (and dailyDealStore.ts's mergeCloudDailyDealState)
 * actually work across devices — without it, a second device has no way to
 * tell whether the cloud's streak already accounts for today.
 */
export async function syncDailyDealStreak(
  supabase: SupabaseClient,
  userId: string,
  streak: number,
  bestStreak: number,
  lastPlayedDate: string
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    daily_deal_streak: streak,
    daily_deal_best_streak: bestStreak,
    daily_deal_last_played: lastPlayedDate,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

interface DailyDealCloudRow {
  daily_deal_streak: number;
  daily_deal_best_streak: number;
  daily_deal_last_played: string | null;
}

/**
 * Reads back the signed-in account's cloud Daily Deal record — the other
 * half of what actually fixes cross-device sync (see
 * dailyDealStore.ts's mergeCloudDailyDealState, which this is meant to feed
 * into). Called before computing/showing a streak on any device: Home (so
 * the displayed streak/played-today state reflects every device, not just
 * this one) and GameOverScreen (so a fresh result is computed against the
 * account's true last-played date, not just this device's own history).
 * Returns null for an account with no leaderboard row at all yet (never
 * played a Daily Deal or finished a real game on any device) — callers
 * treat that as "nothing to merge," not an error.
 */
export async function pullDailyDealStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<{ streak: number; bestStreak: number; lastPlayedDate: string | null } | null> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("daily_deal_streak, daily_deal_best_streak, daily_deal_last_played")
    .eq("user_id", userId)
    .maybeSingle<DailyDealCloudRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    streak: data.daily_deal_streak,
    bestStreak: data.daily_deal_best_streak,
    lastPlayedDate: data.daily_deal_last_played,
  };
}
