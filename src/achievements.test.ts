import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_TIERS,
  AchievementProgressState,
  achievementValue,
  allAchievements,
  EMPTY_PROGRESS_STATE,
} from "./achievements";

describe("ACHIEVEMENT_FAMILIES", () => {
  it("has exactly 40 families, giving 200 achievements at 5 tiers each", () => {
    expect(ACHIEVEMENT_FAMILIES).toHaveLength(40);
    expect(allAchievements(EMPTY_PROGRESS_STATE)).toHaveLength(200);
  });

  it("has unique family ids", () => {
    const ids = ACHIEVEMENT_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has strictly increasing thresholds beginner through expert for every family", () => {
    for (const family of ACHIEVEMENT_FAMILIES) {
      const values = ACHIEVEMENT_TIERS.map((t) => family.thresholds[t]);
      for (let i = 1; i < values.length; i++) {
        if (family.lowerIsBetter) {
          expect(values[i]).toBeLessThan(values[i - 1]);
        } else {
          expect(values[i]).toBeGreaterThan(values[i - 1]);
        }
      }
    }
  });
});

describe("allAchievements — locked/unlocked state", () => {
  it("unlocks nothing from an empty progress state", () => {
    expect(allAchievements(EMPTY_PROGRESS_STATE).every((a) => !a.unlocked)).toBe(true);
  });

  it("unlocks a counter-based tier exactly at its threshold, not one below", () => {
    const state: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, counters: { books_melded: 25 } };
    const tiers = allAchievements(state).filter((a) => a.familyId === "books_melded");
    expect(tiers.find((t) => t.tier === "beginner")!.unlocked).toBe(true); // threshold 5
    expect(tiers.find((t) => t.tier === "easy")!.unlocked).toBe(true); // threshold 25
    expect(tiers.find((t) => t.tier === "medium")!.unlocked).toBe(false); // threshold 75
  });

  it("treats games_played/games_won as account-level, not counters", () => {
    const state: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 50, gamesWon: 15 };
    const played = allAchievements(state).filter((a) => a.familyId === "games_played");
    const won = allAchievements(state).filter((a) => a.familyId === "games_won");
    expect(played.find((t) => t.tier === "easy")!.unlocked).toBe(true); // threshold 50
    expect(played.find((t) => t.tier === "medium")!.unlocked).toBe(false); // threshold 150
    expect(won.find((t) => t.tier === "easy")!.unlocked).toBe(true); // threshold 15
  });

  it("best_score is lower-is-better and null (no games yet) never unlocks", () => {
    const noGames = allAchievements(EMPTY_PROGRESS_STATE).filter((a) => a.familyId === "best_score");
    expect(noGames.every((t) => !t.unlocked)).toBe(true);

    const goodScore: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 5, bestScore: 12 };
    const tiers = allAchievements(goodScore).filter((a) => a.familyId === "best_score");
    expect(tiers.find((t) => t.tier === "hard")!.unlocked).toBe(true); // threshold 15, 12 <= 15
    expect(tiers.find((t) => t.tier === "expert")!.unlocked).toBe(false); // threshold 0, 12 > 0
  });

  it("best_score can't unlock off a lucky early game — needs a minimum games-played sample", () => {
    // A single perfect (0-penalty) game shouldn't be enough on its own to
    // instantly unlock every Sharpshooter tier, including Expert.
    const luckyFirstGame: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 1, bestScore: 0 };
    const tooFew = allAchievements(luckyFirstGame).filter((a) => a.familyId === "best_score");
    expect(tooFew.every((t) => !t.unlocked)).toBe(true);

    const enoughGames: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 5, bestScore: 0 };
    const unlocked = allAchievements(enoughGames).filter((a) => a.familyId === "best_score");
    expect(unlocked.every((t) => t.unlocked)).toBe(true);
  });

  it("win_rate stays at 0 below the minimum sample size even with a perfect record", () => {
    const tooFew: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 3, gamesWon: 3 };
    expect(achievementValue(ACHIEVEMENT_FAMILIES.find((f) => f.id === "win_rate")!, tooFew)).toBe(0);

    const enough: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 20, gamesWon: 16 };
    expect(achievementValue(ACHIEVEMENT_FAMILIES.find((f) => f.id === "win_rate")!, enough)).toBe(80);
  });

  it("wins_by_difficulty families read their own difficulty key only", () => {
    const state: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      winsByDifficulty: { beginner: 2, expert: 10 },
    };
    const beginnerFamily = ACHIEVEMENT_FAMILIES.find((f) => f.id === "wins_vs_beginner")!;
    const hardFamily = ACHIEVEMENT_FAMILIES.find((f) => f.id === "wins_vs_hard")!;
    expect(achievementValue(beginnerFamily, state)).toBe(2);
    expect(achievementValue(hardFamily, state)).toBe(0);
  });

  it("progressFraction is clamped to [0, 1] and reaches 1 once unlocked", () => {
    const state: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, counters: { turns_taken: 999999 } };
    const tiers = allAchievements(state).filter((a) => a.familyId === "turns_taken");
    expect(tiers.every((t) => t.progressFraction === 1)).toBe(true);
    expect(tiers.every((t) => t.unlocked)).toBe(true);
  });
});
