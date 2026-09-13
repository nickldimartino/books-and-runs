// A visible rank badge instead of a bare win-rate percentage — bucketed
// from the same public games_played/games_won every leaderboard row
// already exposes (see leaderboardStore.ts's LeaderboardEntry). Purely
// derived and never stored: recomputed fresh from current stats every
// time, so it can never go stale or need its own sync/migration.

import { WIN_RATE_MIN_GAMES } from "@/achievements";

export interface RankTier {
  id: string;
  label: string;
  color: string;
  minWinRate: number; // inclusive, percent (0-100)
}

// Same bronze→diamond language as the achievement tier rings and avatar
// frames, for one consistent "rank color" vocabulary across the app.
export const RANK_TIERS: readonly RankTier[] = [
  { id: "bronze", label: "Bronze", color: "#CD7F32", minWinRate: 0 },
  { id: "silver", label: "Silver", color: "#B0B8C1", minWinRate: 35 },
  { id: "gold", label: "Gold", color: "#F5C518", minWinRate: 50 },
  { id: "platinum", label: "Platinum", color: "#4FD1C5", minWinRate: 62 },
  { id: "diamond", label: "Diamond", color: "#38BDF8", minWinRate: 75 },
];

export interface RankInfo {
  /** Null means Unranked — fewer than WIN_RATE_MIN_GAMES games played, the
   * same floor the Achievements/Leaderboard win-rate columns already use
   * (too small a sample to mean anything). */
  tier: RankTier | null;
  winRate: number | null;
}

export function computeRank(gamesPlayed: number, gamesWon: number): RankInfo {
  if (gamesPlayed < WIN_RATE_MIN_GAMES) return { tier: null, winRate: null };
  const winRate = (100 * gamesWon) / gamesPlayed;
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (winRate >= t.minWinRate) tier = t;
  }
  return { tier, winRate };
}
