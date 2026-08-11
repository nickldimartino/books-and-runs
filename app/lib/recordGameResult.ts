import { SupabaseClient } from "@supabase/supabase-js";
import { Difficulty, GameState } from "@/types";

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

  const won = state.winnerId === you.id;
  const opponents = state.players
    .filter((p) => p.id !== you.id)
    .map((p) => ({ name: p.name, difficulty: p.isAI ? p.difficulty ?? null : null }));

  const { data: existing } = await supabase
    .from("player_stats")
    .select("games_played, games_won, best_score, worst_score, average_score, wins_by_difficulty")
    .eq("user_id", userId)
    .maybeSingle<PlayerStatsRow>();

  const priorGames = existing?.games_played ?? 0;
  const gamesPlayed = priorGames + 1;
  const gamesWon = (existing?.games_won ?? 0) + (won ? 1 : 0);
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

  await supabase.from("player_stats").upsert({
    user_id: userId,
    games_played: gamesPlayed,
    games_won: gamesWon,
    best_score: bestScore,
    worst_score: worstScore,
    average_score: averageScore,
    wins_by_difficulty: winsByDifficulty,
    updated_at: new Date().toISOString(),
  });

  await supabase.from("game_history").insert({
    user_id: userId,
    opponents,
    rounds: roundHistory,
    winner: state.players.find((p) => p.id === state.winnerId)?.name ?? "unknown",
  });
}
