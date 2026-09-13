import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { cosmeticRequirementLabel, isCosmeticUnlocked, makeUnlockContext } from "./cosmeticUnlocks";

function ctx(overrides: Partial<Parameters<typeof makeUnlockContext>[0]> = {}) {
  return makeUnlockContext({ level: 0, progress: EMPTY_PROGRESS_STATE, ...overrides });
}

const MASTERED_MULTIPLAYER = { ...EMPTY_PROGRESS_STATE, mpGamesPlayed: 1000, mpGamesWon: 1000, mpBestWinStreak: 1000 };

describe("isCosmeticUnlocked", () => {
  it("gates a level rule on the given level", () => {
    const rule = { kind: "level" as const, level: 25 };
    expect(isCosmeticUnlocked(rule, ctx({ level: 24 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ level: 25 }))).toBe(true);
  });

  it("gates a categoryMastered rule on every family in that category reaching Expert", () => {
    const rule = { kind: "categoryMastered" as const, category: "multiplayer" as const, categoryLabel: "Multiplayer" };
    expect(isCosmeticUnlocked(rule, ctx())).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ progress: MASTERED_MULTIPLAYER }))).toBe(true);
  });

  it("gates a categoriesMasteredCount rule on that many categories, not just one", () => {
    const rule = { kind: "categoriesMasteredCount" as const, count: 2 };
    expect(isCosmeticUnlocked(rule, ctx({ progress: MASTERED_MULTIPLAYER }))).toBe(false);
  });

  it("gates an allCategoriesMastered rule on literally every category", () => {
    const rule = { kind: "allCategoriesMastered" as const };
    expect(isCosmeticUnlocked(rule, ctx({ progress: MASTERED_MULTIPLAYER }))).toBe(false);
  });

  it("gates a gamesPlayed rule on the solo/pass-and-play count", () => {
    const rule = { kind: "gamesPlayed" as const, count: 500 };
    expect(isCosmeticUnlocked(rule, ctx({ gamesPlayed: 499 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ gamesPlayed: 500 }))).toBe(true);
  });

  it("gates a dailyDealStreak rule on the best streak, not the current one", () => {
    const rule = { kind: "dailyDealStreak" as const, days: 30 };
    expect(isCosmeticUnlocked(rule, ctx({ dailyDealBestStreak: 29 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ dailyDealBestStreak: 30 }))).toBe(true);
  });

  it("gates a weeklyChallengeStreak rule on the best streak", () => {
    const rule = { kind: "weeklyChallengeStreak" as const, weeks: 12 };
    expect(isCosmeticUnlocked(rule, ctx({ weeklyChallengeBestStreak: 11 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ weeklyChallengeBestStreak: 12 }))).toBe(true);
  });

  it("gates a complete rule on every condition at once, not any single one", () => {
    const rule = { kind: "complete" as const };
    expect(isCosmeticUnlocked(rule, ctx({ level: 250, dailyDealBestStreak: 30 }))).toBe(false);
    // achievements.ts's own allAchievements has no families in EMPTY_PROGRESS_STATE
    // to mark "mastered" against, so the all-categories leg can never pass here —
    // this only proves level/streak alone aren't enough, not the full positive case.
  });

  it("gates a creatorOnly rule purely on is_creator, ignoring every other field", () => {
    const rule = { kind: "creatorOnly" as const };
    expect(isCosmeticUnlocked(rule, ctx({ level: 999, dailyDealBestStreak: 999 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ isCreator: true }))).toBe(true);
  });
});

describe("cosmeticRequirementLabel", () => {
  it("describes each rule kind", () => {
    expect(cosmeticRequirementLabel({ kind: "level", level: 50 })).toContain("50");
    expect(
      cosmeticRequirementLabel({ kind: "categoryMastered", category: "melding", categoryLabel: "Melding" })
    ).toContain("Melding");
    expect(cosmeticRequirementLabel({ kind: "categoriesMasteredCount", count: 3 })).toContain("3");
    expect(cosmeticRequirementLabel({ kind: "allCategoriesMastered" })).toContain("every");
    expect(cosmeticRequirementLabel({ kind: "gamesPlayed", count: 500 })).toContain("500");
    expect(cosmeticRequirementLabel({ kind: "dailyDealStreak", days: 30 })).toContain("30");
    expect(cosmeticRequirementLabel({ kind: "weeklyChallengeStreak", weeks: 12 })).toContain("12");
    expect(cosmeticRequirementLabel({ kind: "complete" })).toContain("250");
    expect(cosmeticRequirementLabel({ kind: "creatorOnly" })).toContain("creator");
  });
});
