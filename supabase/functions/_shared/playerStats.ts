// Shared `player_stats` update math for both `mp` (recordMpGameOutcome) and
// `solo-verify` (handleVerify) — every completed game, solo or multiplayer,
// folds into the same account-level stats table the same way. Pulled out
// once both functions had grown a byte-for-byte identical ~80-line copy of
// this (down to the same EMPTY_WINS_BY_DIFFICULTY literal), which meant a
// future change to the scoring formula (e.g. how average_score is weighted)
// had to be remembered and applied in two places with nothing to catch a
// drift between them.
//
// Deliberately a pure function, not a DB call: each caller already reads
// `player_stats` and writes the result back differently (mp's finalize step
// soft-fails with a console.error since it's a background step; solo-verify
// returns a real HTTP 500, and runs its own rate-limit check first) — this
// only computes the new row's numbers from the old ones plus this game's
// outcome, and stays agnostic to how either caller fetches or persists it.

export interface PlayerStatsFields {
  games_played: number;
  games_won: number;
  games_tied: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

export const EMPTY_WINS_BY_DIFFICULTY: Record<string, number> = {
  beginner: 0,
  easy: 0,
  medium: 0,
  hard: 0,
  expert: 0,
};

/**
 * Derives the next `player_stats` row from whatever's currently on file (or
 * none, for a brand new account) plus this one game's outcome. `opponents`
 * only needs each one's `difficulty` (null for a human) — used to credit
 * `wins_by_difficulty` for every AI tier faced in a game you won, same as
 * before this was shared.
 */
export function computePlayerStatsUpdate(
  existing: PlayerStatsFields | null | undefined,
  cumulativeScore: number,
  won: boolean,
  tied: boolean,
  opponents: { difficulty: string | null }[]
): PlayerStatsFields {
  const priorGames = existing?.games_played ?? 0;
  const gamesPlayed = priorGames + 1;
  const gamesWon = (existing?.games_won ?? 0) + (won ? 1 : 0);
  const gamesTied = (existing?.games_tied ?? 0) + (tied ? 1 : 0);
  const bestScore = existing?.best_score != null ? Math.min(existing.best_score, cumulativeScore) : cumulativeScore;
  const worstScore = existing?.worst_score != null ? Math.max(existing.worst_score, cumulativeScore) : cumulativeScore;
  const priorAverage = existing?.average_score ?? cumulativeScore;
  const averageScore = (priorAverage * priorGames + cumulativeScore) / gamesPlayed;

  const winsByDifficulty = { ...EMPTY_WINS_BY_DIFFICULTY, ...(existing?.wins_by_difficulty ?? {}) };
  if (won) {
    const difficultiesFaced = new Set(opponents.map((o) => o.difficulty).filter((d): d is string => !!d));
    for (const d of difficultiesFaced) {
      if (d in winsByDifficulty) winsByDifficulty[d] += 1;
    }
  }

  return {
    games_played: gamesPlayed,
    games_won: gamesWon,
    games_tied: gamesTied,
    best_score: bestScore,
    worst_score: worstScore,
    average_score: averageScore,
    wins_by_difficulty: winsByDifficulty,
  };
}
