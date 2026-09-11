// Self-serve "download my data" (Account page) — everything this account
// owns, assembled client-side from the same owner-RLS tables and RPCs the
// rest of the app already reads, and handed to the browser as one JSON
// file. No Edge Function or new RPC needed: every table here already
// enforces `auth.uid() = user_id` (or, for the mp_* RPCs, is purpose-built
// to return only "my" rows even though the underlying tables are readable
// by other participants too — see their own migration comments), so a
// plain signed-in client can safely read all of it directly.
//
// Deliberately excludes: push_subscriptions' raw endpoint/keys (the export
// notes how many are registered, not the encryption material itself —
// nothing a person would ever want copy-pasted into a file), and
// client_errors/app_events (crash reports and anonymous analytics, not
// really "your data" in the sense this feature means).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { getFriendRequests, getFriends, getMyFriendCode } from "./friendsStore";
import { getMyMpGames, getMyMpHistory, getMyMpStats } from "./mpStore";

async function single<T>(supabase: SupabaseClient, table: string, userId: string): Promise<T | null> {
  const { data, error } = await supabase.from(table).select("*").eq("user_id", userId).maybeSingle<T>();
  if (error) throw error;
  return data ?? null;
}

async function many<T>(supabase: SupabaseClient, table: string, userId: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select("*").eq("user_id", userId);
  if (error) throw error;
  return (data as T[]) ?? [];
}

/** Best-effort — a table a project hasn't migrated yet (or a query that
 * simply fails) shouldn't block the rest of the export; it's noted in the
 * output instead so it's obvious something's missing rather than silently
 * absent. */
async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Data export: failed to load ${label}:`, err);
    return { error: message };
  }
}

export async function buildUserDataExport(supabase: SupabaseClient, user: User): Promise<Record<string, unknown>> {
  const uid = user.id;

  const [
    profile,
    friendCode,
    playerStats,
    achievementCounters,
    leaderboardEntry,
    houseSettings,
    gameHistory,
    soloSave,
    favoriteGameConfig,
    dailyDealScores,
    pushSubscriptions,
    friends,
    friendRequests,
    mpGames,
    mpHistory,
    mpStats,
  ] = await Promise.all([
    attempt("profile", () => single(supabase, "profiles", uid)),
    attempt("friend code", () => getMyFriendCode(supabase)),
    attempt("player stats", () => single(supabase, "player_stats", uid)),
    attempt("achievement counters", () => single(supabase, "achievement_counters", uid)),
    attempt("leaderboard entry", () => single(supabase, "leaderboard_entries", uid)),
    attempt("house settings", () => single(supabase, "settings", uid)),
    attempt("game history", () => many(supabase, "game_history", uid)),
    attempt("solo save", () => single(supabase, "solo_saves", uid)),
    attempt("favorite game config", () => single(supabase, "favorite_game_configs", uid)),
    attempt("Daily Deal scores", () => many(supabase, "daily_deal_scores", uid)),
    attempt("push subscriptions", async () => {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, created_at")
        .eq("user_id", uid);
      if (error) throw error;
      // The endpoint itself identifies a specific browser/device but isn't
      // secret the way the p256dh/auth keys are (never selected here) —
      // truncated anyway since the full URL is long and not meaningful to
      // read.
      return (data ?? []).map((row) => ({
        endpoint: `${String(row.endpoint).slice(0, 48)}…`,
        created_at: row.created_at,
      }));
    }),
    attempt("friends", () => getFriends(supabase)),
    attempt("friend requests", () => getFriendRequests(supabase)),
    attempt("multiplayer games", () => getMyMpGames(supabase)),
    attempt("multiplayer history", () => getMyMpHistory(supabase, 100)),
    attempt("multiplayer stats", () => getMyMpStats(supabase)),
  ]);

  return {
    exported_at: new Date().toISOString(),
    account: {
      user_id: uid,
      email: user.email ?? null,
      created_at: user.created_at,
      friend_code: friendCode,
    },
    profile,
    display_name_and_leaderboard: leaderboardEntry,
    settings: houseSettings,
    stats: {
      solo_and_pass_and_play: playerStats,
      multiplayer: mpStats,
      achievement_counters: achievementCounters,
    },
    game_history: {
      solo_and_pass_and_play: gameHistory,
      multiplayer: mpHistory,
    },
    in_progress_games: {
      solo_or_pass_and_play_save: soloSave,
      multiplayer_active_or_pending: mpGames,
    },
    favorite_game_config: favoriteGameConfig,
    daily_deal_scores: dailyDealScores,
    friends,
    friend_requests: friendRequests,
    push_subscriptions: pushSubscriptions,
  };
}

/** Triggers a browser download of the export as a formatted JSON file. */
export function downloadUserDataExport(data: Record<string, unknown>, userId: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `books-and-runs-data-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
