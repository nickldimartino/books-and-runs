// The pure "before/after achievement progress -> what just unlocked" diff
// shared by RoundSummary (estimate), GameOverScreen (server-verified) and
// useMpGame (snapshot in localStorage, diffed at game over). Callers keep
// their own timing, storage, sounds and UI state; this only computes.

import { allAchievements, type AchievementProgressState } from "@/achievements";
import { ACHIEVEMENT_TIER_XP, levelProgress } from "@/leveling";
import type { AchievementUnlockItem } from "../components/AchievementUnlock";
import { type AnyCosmeticOption, diffNewlyUnlockedCosmetics } from "./allCosmetics";
import { withSessionCounters } from "./pendingProgress";

export interface AchievementDiff {
  newlyUnlocked: AchievementUnlockItem[];
  /** The new level if `after` crossed a level boundary vs `before`, else null. */
  leveledUpTo: number | null;
  newCosmetics: AnyCosmeticOption[];
}

/** Persisted progress plus this game's not-yet-verified session counters. */
export function estimateProgress(
  before: AchievementProgressState,
  sessionCounters: Record<string, number> | null
): AchievementProgressState {
  return withSessionCounters(before, sessionCounters);
}

/**
 * Diff two progress snapshots. `levels` overrides the levels derived from the
 * progress states (GameOverScreen uses the server-reported ones).
 */
export function diffAchievementProgress(
  before: AchievementProgressState,
  after: AchievementProgressState,
  levels?: { before: number; after: number }
): AchievementDiff {
  const beforeUnlocked = new Set(
    allAchievements(before)
      .filter((a) => a.unlocked)
      .map((a) => `${a.familyId}:${a.tier}`)
  );
  const newlyUnlocked = allAchievements(after)
    .filter((a) => a.unlocked && !beforeUnlocked.has(`${a.familyId}:${a.tier}`))
    .map((a) => ({ achievement: a, xp: ACHIEVEMENT_TIER_XP[a.tier] }));
  const beforeLevel = levels?.before ?? levelProgress(before).level;
  const afterLevel = levels?.after ?? levelProgress(after).level;
  return {
    newlyUnlocked,
    leveledUpTo: afterLevel > beforeLevel ? afterLevel : null,
    newCosmetics: diffNewlyUnlockedCosmetics(beforeLevel, before, afterLevel, after),
  };
}
