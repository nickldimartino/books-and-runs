import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_FAMILIES, EMPTY_PROGRESS_STATE, type AchievementProgressState } from "@/achievements";
import { ACHIEVEMENT_TIER_XP } from "@/leveling";
import { diffAchievementProgress, estimateProgress } from "./achievementUnlockDiff";

const gamesPlayedFamily = ACHIEVEMENT_FAMILIES.find((f) => f.source.kind === "gamesPlayed")!;
const bestScoreFamily = ACHIEVEMENT_FAMILIES.find((f) => f.source.kind === "bestScore")!;
const p = (o: Partial<AchievementProgressState>): AchievementProgressState => ({ ...EMPTY_PROGRESS_STATE, ...o });

describe("diffAchievementProgress", () => {
  it("reports nothing when progress is unchanged", () => {
    const d = diffAchievementProgress(p({ gamesPlayed: 3 }), p({ gamesPlayed: 3 }));
    expect(d.newlyUnlocked).toEqual([]);
    expect(d.leveledUpTo).toBeNull();
  });

  it("lists newly unlocked tiers with their XP", () => {
    const threshold = Math.min(...Object.values(gamesPlayedFamily.thresholds));
    const d = diffAchievementProgress(p({}), p({ gamesPlayed: threshold }));
    const hit = d.newlyUnlocked.filter((i) => i.achievement.familyId === gamesPlayedFamily.id);
    expect(hit.length).toBeGreaterThan(0);
    for (const i of hit) expect(i.xp).toBe(ACHIEVEMENT_TIER_XP[i.achievement.tier]);
  });

  it("does not re-report already-unlocked tiers", () => {
    const threshold = Math.min(...Object.values(gamesPlayedFamily.thresholds));
    const d = diffAchievementProgress(p({ gamesPlayed: threshold }), p({ gamesPlayed: threshold }));
    expect(d.newlyUnlocked).toEqual([]);
  });

  it("handles lowerIsBetter achievements (a lower best score unlocks)", () => {
    const loosest = Math.max(...Object.values(bestScoreFamily.thresholds));
    const d = diffAchievementProgress(p({ gamesPlayed: 1000, bestScore: loosest + 500 }), p({ gamesPlayed: 1000, bestScore: loosest }));
    expect(d.newlyUnlocked.some((i) => i.achievement.familyId === bestScoreFamily.id)).toBe(true);
    const worse = diffAchievementProgress(p({ gamesPlayed: 1000, bestScore: loosest }), p({ gamesPlayed: 1000, bestScore: loosest + 500 }));
    expect(worse.newlyUnlocked).toEqual([]);
  });

  it("reports a level-up, honoring explicit level overrides", () => {
    const d = diffAchievementProgress(p({}), p({}), { before: 4, after: 5 });
    expect(d.leveledUpTo).toBe(5);
    expect(diffAchievementProgress(p({}), p({}), { before: 5, after: 5 }).leveledUpTo).toBeNull();
  });

  it("derives a level-up from unlocked-achievement XP when no override is given", () => {
    const big = p({ gamesPlayed: 100000, gamesWon: 100000, counters: { anything: 1 } });
    const d = diffAchievementProgress(p({}), big);
    expect(d.newlyUnlocked.length).toBeGreaterThan(0);
    expect(d.leveledUpTo).not.toBeNull();
  });
});

describe("estimateProgress", () => {
  it("adds session counters onto persisted counters without mutating", () => {
    const before = p({ counters: { a: 2 } });
    const est = estimateProgress(before, { a: 3, b: 1 });
    expect(est.counters).toEqual({ a: 5, b: 1 });
    expect(before.counters).toEqual({ a: 2 });
  });
  it("returns before unchanged for null/empty counters", () => {
    const before = p({ counters: { a: 2 } });
    expect(estimateProgress(before, null)).toBe(before);
    expect(estimateProgress(before, {})).toBe(before);
  });
});
