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

  it("gates a worstScoreUnder rule on the worst score, treating null (no game yet) as never satisfying it", () => {
    const rule = { kind: "worstScoreUnder" as const, score: 80 };
    expect(isCosmeticUnlocked(rule, ctx({ worstScore: null }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ worstScore: 80 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ worstScore: 79 }))).toBe(true);
  });

  it("gates an averageScoreUnder rule on both the average AND a minimum game count", () => {
    const rule = { kind: "averageScoreUnder" as const, score: 70, minGames: 15 };
    expect(isCosmeticUnlocked(rule, ctx({ averageScore: 50, gamesPlayed: 3 }))).toBe(false); // too few games
    expect(isCosmeticUnlocked(rule, ctx({ averageScore: 75, gamesPlayed: 20 }))).toBe(false); // average too high
    expect(isCosmeticUnlocked(rule, ctx({ averageScore: null, gamesPlayed: 20 }))).toBe(false); // no games yet
    expect(isCosmeticUnlocked(rule, ctx({ averageScore: 65, gamesPlayed: 15 }))).toBe(true);
  });

  it("gates a gamesTied rule on the tied-game count", () => {
    const rule = { kind: "gamesTied" as const, count: 3 };
    expect(isCosmeticUnlocked(rule, ctx({ gamesTied: 2 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ gamesTied: 3 }))).toBe(true);
  });

  it("gates an mpWinStreak rule on the multiplayer best win streak", () => {
    const rule = { kind: "mpWinStreak" as const, streak: 8 };
    expect(isCosmeticUnlocked(rule, ctx({ mpBestWinStreak: 7 }))).toBe(false);
    expect(isCosmeticUnlocked(rule, ctx({ mpBestWinStreak: 8 }))).toBe(true);
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
    expect(cosmeticRequirementLabel({ kind: "worstScoreUnder", score: 80 })).toContain("80");
    expect(cosmeticRequirementLabel({ kind: "averageScoreUnder", score: 70, minGames: 15 })).toContain("15");
    expect(cosmeticRequirementLabel({ kind: "gamesTied", count: 3 })).toContain("3");
    expect(cosmeticRequirementLabel({ kind: "mpWinStreak", streak: 8 })).toContain("8");
  });
});
