import { SupabaseClient } from "@supabase/supabase-js";
import { Difficulty, GameState } from "@/types";
import { joinNames } from "./formatNames";

/**
 * The seat id that represents "the signed-in account" in pass-and-play,
 * where several human players can share one device/session but at most one
 * of them is actually the account owner. New Game always assigns this id to
 * the first human slot ("You"). Not cryptographically enforced — anyone
 * could rename that seat or seat a different person in slot 0 — but it's
 * the same convention every account-linked feature in this app relies on
 * (stats here, and achievement counters in GameContext.tsx).
 */
export const YOU_PLAYER_ID = "human-0";

export interface RoundHistoryEntry {
  round: number;
  totals: Record<string, number>;
}

interface PlayerStatsRow {
  games_played: number;
  games_won: number;
  games_tied: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

const EMPTY_WINS_BY_DIFFICULTY: Record<string, number> = {
  beginner: 0,
  easy: 0,
  medium: 0,
  hard: 0,
  expert: 0,
};

/**
 * Records a finished game against the signed-in user's stats. Only the
 * device owner's stats are tracked (the "human-0" / "You" seat) — other
 * pass-and-play participants at the table aren't necessarily the signed-in
 * account, per the design doc's device-owner-centric stats model.
 */
export async function recordGameResult(
  supabase: SupabaseClient,
  userId: string,
  state: GameState,
  roundHistory: RoundHistoryEntry[]
): Promise<void> {
  const you = state.players.find((p) => p.id === YOU_PLAYER_ID);
  if (!you) return;

  // Lowest score wins, but a tie for it is a tie, not a win — ties are
  // rare and tracked as their own stat (games_tied) instead of inflating
  // games_won/wins_by_difficulty. Matches GameOverScreen's identical rule
  // for the XP breakdown it shows for this same game.
  const lowestScore = Math.min(...state.players.map((p) => p.cumulativeScore));
  const winners = state.players.filter((p) => p.cumulativeScore === lowestScore);
  const won = winners.length === 1 && you.cumulativeScore === lowestScore;
  const tied = winners.length > 1 && you.cumulativeScore === lowestScore;
  const opponents = state.players
    .filter((p) => p.id !== you.id)
    .map((p) => ({ name: p.name, difficulty: p.isAI ? p.difficulty ?? null : null }));

  // A failed select (RLS rejection, network hiccup) previously looked
  // identical to "no row yet" — data comes back null either way — so the
  // code below would treat an existing player as brand new and overwrite
  // games_played/best_score/etc. with fresh defaults instead of failing
  // loudly. Throwing here lets GameOverScreen's .catch(() => setSaved
  // ("error")) do its job, matching recordAchievementProgress.ts.
  const { data: existing, error: selectError } = await supabase
    .from("player_stats")
    .select("games_played, games_won, games_tied, best_score, worst_score, average_score, wins_by_difficulty")
    .eq("user_id", userId)
    .maybeSingle<PlayerStatsRow>();
  if (selectError) throw selectError;

  const priorGames = existing?.games_played ?? 0;
  const gamesPlayed = priorGames + 1;
  const gamesWon = (existing?.games_won ?? 0) + (won ? 1 : 0);
  const gamesTied = (existing?.games_tied ?? 0) + (tied ? 1 : 0);
  const bestScore =
    existing?.best_score != null ? Math.min(existing.best_score, you.cumulativeScore) : you.cumulativeScore;
  const worstScore =
    existing?.worst_score != null ? Math.max(existing.worst_score, you.cumulativeScore) : you.cumulativeScore;
  const priorAverage = existing?.average_score ?? you.cumulativeScore;
  const averageScore = (priorAverage * priorGames + you.cumulativeScore) / gamesPlayed;

  const winsByDifficulty = { ...EMPTY_WINS_BY_DIFFICULTY, ...(existing?.wins_by_difficulty ?? {}) };
  if (won) {
    const difficultiesFaced = new Set(
      opponents.map((o) => o.difficulty).filter((d): d is Difficulty => !!d)
    );
    for (const d of difficultiesFaced) {
      if (d in winsByDifficulty) winsByDifficulty[d] += 1;
    }
  }

  const { error: upsertError } = await supabase.from("player_stats").upsert({
    user_id: userId,
    games_played: gamesPlayed,
    games_won: gamesWon,
    games_tied: gamesTied,
    best_score: bestScore,
    worst_score: worstScore,
    average_score: averageScore,
    wins_by_difficulty: winsByDifficulty,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;

  const { error: insertError } = await supabase.from("game_history").insert({
    user_id: userId,
    opponents,
    rounds: roundHistory,
    winner:
      winners.length > 1 ? `${joinNames(winners.map((p) => p.name))} (tied)` : (winners[0]?.name ?? "unknown"),
  });
  if (insertError) throw insertError;
}
