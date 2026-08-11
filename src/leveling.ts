// Account level/XP — a pure function of the same progress data the
// Achievements page already loads (player_stats + achievement_counters),
// so it needs no new Supabase schema of its own. Like achievements.ts, this
// has zero dependency on Supabase or React.
//
// XP sources, in relative order of weight (per house rules):
//   1. Finishing a game always earns a little XP, win or lose.
//   2. Winning earns substantially more than just finishing — losing a
//      game is worth barely anything beyond the base "finished" XP.
//   3. A win against a tougher AI difficulty earns a bonus on top of the
//      base win XP, scaled beginner -> expert — but even the biggest of
//      these bonuses (expert) is still smaller than the base win XP itself,
//      so *winning* always matters more than *who* you beat.
//   4. Every unlocked achievement tier grants XP, scaled beginner -> expert
//      the same way (a Hard-tier unlock is worth more than a Beginner-tier
//      unlock of the same family).

import { AchievementProgressState, AchievementTier, allAchievements } from "./achievements";

export const FINISH_GAME_XP = 5;
export const WIN_GAME_XP = 100;

export const DIFFICULTY_WIN_XP: Record<string, number> = {
  beginner: 10,
  easy: 20,
  medium: 35,
  hard: 55,
  expert: 80, // still < WIN_GAME_XP — beating Expert never outweighs the win itself
};

export const ACHIEVEMENT_TIER_XP: Record<AchievementTier, number> = {
  beginner: 10,
  easy: 25,
  medium: 60,
  hard: 150,
  expert: 400,
};

// Level curve: xp needed to REACH level N is K*N^2 — quadratic and
// open-ended (no cap). Because the marginal cost per level (K*(2N+1)) grows
// with N, early levels come quickly and later ones take substantially
// longer, forever, without needing a lookup table or a ceiling.
const LEVEL_CURVE_K = 50;

/** Total cumulative XP required to have reached `level` (level 0 = 0 XP). */
export function xpForLevel(level: number): number {
  return LEVEL_CURVE_K * level * level;
}

/** The level a given total XP amount currently sits at. */
export function levelForXp(xp: number): number {
  if (xp <= 0) return 0;
  return Math.floor(Math.sqrt(xp / LEVEL_CURVE_K));
}

export function computeTotalXp(state: AchievementProgressState): number {
  let xp = state.gamesPlayed * FINISH_GAME_XP + state.gamesWon * WIN_GAME_XP;

  for (const [difficulty, xpPerWin] of Object.entries(DIFFICULTY_WIN_XP)) {
    xp += (state.winsByDifficulty[difficulty] ?? 0) * xpPerWin;
  }

  for (const achievement of allAchievements(state)) {
    if (achievement.unlocked) xp += ACHIEVEMENT_TIER_XP[achievement.tier];
  }

  return xp;
}

export interface LevelProgress {
  totalXp: number;
  level: number;
  /** XP earned past the current level's own floor. */
  xpIntoLevel: number;
  /** XP the current level spans, start to next level. */
  xpSpanForLevel: number;
  /** 0-1 — how far into the current level, for a progress bar. */
  progressFraction: number;
}

export function levelProgress(state: AchievementProgressState): LevelProgress {
  const totalXp = computeTotalXp(state);
  const level = levelForXp(totalXp);
  const levelFloor = xpForLevel(level);
  const nextLevelFloor = xpForLevel(level + 1);
  const xpSpanForLevel = nextLevelFloor - levelFloor;
  const xpIntoLevel = totalXp - levelFloor;

  return {
    totalXp,
    level,
    xpIntoLevel,
    xpSpanForLevel,
    progressFraction: xpSpanForLevel > 0 ? xpIntoLevel / xpSpanForLevel : 0,
  };
}
