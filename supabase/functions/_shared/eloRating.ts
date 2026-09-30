// Plain Elo for human-vs-human multiplayer (migration 0097's mp_rating),
// shared shape as playerStats.ts's own doc: a pure function, not a DB call
// — the caller (mp's recordMpGameOutcome) fetches current ratings and
// persists the result, this only computes the new numbers.
//
// Chess Elo has no official extension to a >2-player table, so ties among
// N participants are settled as a round-robin of pairwise comparisons: for
// every pair (i, j), treat it as its own 1v1 (lower cumulative score wins,
// equal scores tie) with a K-factor scaled by 1/(N-1) so a game's total
// rating swing stays roughly the same size regardless of table size — a
// 2-player game and a 6-player game each move a player's rating by a
// comparable total amount, not 3x more just because there were more pairs
// to sum.

export interface RatedParticipant {
  userId: string;
  rating: number;
  ratedGames: number;
  /** This account's cumulative score for the round(s) just played — lower
   * wins, same convention as the round/game winner determination
   * everywhere else in this codebase. */
  score: number;
}

const K_FACTOR = 32;
/** Elo ratings can't go negative or near-zero without the exponent below
 * blowing up into an absurd expected-score swing — a long losing streak is
 * floored here rather than left to wander. 100 is arbitrary but well below
 * any rating a real losing streak should plausibly reach first. */
const MIN_RATING = 100;

function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** New rating for every participant after one game, plus their new
 * mp_rated_games count. Returns [] unchanged (no-op) for fewer than 2
 * participants — there's no pairwise comparison to make, and this also
 * keeps a solo/AI-only "multiplayer" game shell from touching rating at
 * all (see recordMpGameOutcome's own gate). */
export function computeEloUpdates(
  participants: readonly RatedParticipant[]
): { userId: string; rating: number; ratedGames: number }[] {
  if (participants.length < 2) return [];
  const n = participants.length;
  const deltas = new Map<string, number>(participants.map((p) => [p.userId, 0]));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = participants[i];
      const b = participants[j];
      const expectedA = expectedScore(a.rating, b.rating);
      const actualA = a.score === b.score ? 0.5 : a.score < b.score ? 1 : 0;
      const delta = (K_FACTOR / (n - 1)) * (actualA - expectedA);
      deltas.set(a.userId, (deltas.get(a.userId) ?? 0) + delta);
      deltas.set(b.userId, (deltas.get(b.userId) ?? 0) - delta);
    }
  }

  return participants.map((p) => ({
    userId: p.userId,
    rating: Math.max(MIN_RATING, Math.round(p.rating + (deltas.get(p.userId) ?? 0))),
    ratedGames: p.ratedGames + 1,
  }));
}
