// The per-deal friend leaderboard for Daily Deal (migration 0018). Daily
// Deal's streak logic stays local (see dailyDealStore.ts); this is the one
// piece that reaches other accounts — your score on a given day's deal, and
// how your accepted friends did on the *same* deal.
//
// Both calls are best-effort and signed-in-only: a guest, an unconfigured
// deployment, or a project that hasn't run 0018 just doesn't see the panel.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DailyDealFriendScore {
  userId: string;
  displayName: string | null;
  score: number;
  won: boolean;
  isMe: boolean;
}

interface FriendScoreRow {
  user_id: string;
  display_name: string | null;
  score: number;
  won: boolean;
  is_me: boolean;
}

/** Record the signed-in account's score for `dealDate` ("YYYY-MM-DD"). The
 * first submission per day is canonical — a later call (a replay) is a
 * no-op server-side, matching recordDailyDealResult's own idempotency. */
export async function submitDailyDealScore(
  supabase: SupabaseClient,
  dealDate: string,
  score: number,
  won: boolean
): Promise<void> {
  const { error } = await supabase.rpc("daily_deal_submit", {
    p_date: dealDate,
    p_score: Math.round(score),
    p_won: won,
  });
  if (error) throw error;
}

/** The caller's score plus every accepted friend's score for one deal,
 * best (lowest) first. Empty array when nobody — including you — has a
 * recorded score for that date yet. */
export async function fetchDailyDealFriendScores(
  supabase: SupabaseClient,
  dealDate: string
): Promise<DailyDealFriendScore[]> {
  const { data, error } = await supabase.rpc("daily_deal_friend_scores", { p_date: dealDate });
  if (error) throw error;
  return ((data as FriendScoreRow[] | null) ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    score: r.score,
    won: r.won,
    isMe: r.is_me,
  }));
}
