import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS_STATE, AchievementProgressState } from "./achievements";
import {
  computeTotalXp,
  DIFFICULTY_WIN_XP,
  FINISH_GAME_XP,
  levelForXp,
  levelProgress,
  WIN_GAME_XP,
  xpForLevel,
} from "./leveling";

describe("xpForLevel / levelForXp", () => {
  it("is open-ended — level keeps climbing with no cap", () => {
    expect(levelForXp(xpForLevel(500))).toBe(500);
  });

  it("costs more per level as level increases (open-ended curve)", () => {
    const costLowLevels = xpForLevel(2) - xpForLevel(1);
    const costHighLevels = xpForLevel(100) - xpForLevel(99);
    expect(costHighLevels).toBeGreaterThan(costLowLevels);
  });

  it("0 XP is level 0", () => {
    expect(levelForXp(0)).toBe(0);
  });
});

describe("computeTotalXp", () => {
  it("awards a small amount just for finishing a game", () => {
    const state: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 1 };
    expect(computeTotalXp(state)).toBe(FINISH_GAME_XP);
  });

  it("winning is worth substantially more than losing", () => {
    const lost: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 1, gamesWon: 0 };
    const won: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      gamesPlayed: 1,
      gamesWon: 1,
      winsByDifficulty: { beginner: 1 },
    };
    expect(computeTotalXp(won)).toBeGreaterThan(computeTotalXp(lost) * 5);
  });

  it("beating a tougher AI difficulty is worth more than an easier one", () => {
    const vsBeginner: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      gamesPlayed: 1,
      gamesWon: 1,
      winsByDifficulty: { beginner: 1 },
    };
    const vsExpert: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      gamesPlayed: 1,
      gamesWon: 1,
      winsByDifficulty: { expert: 1 },
    };
    expect(computeTotalXp(vsExpert)).toBeGreaterThan(computeTotalXp(vsBeginner));
  });

  it("winning still matters more than which difficulty you beat", () => {
    // The base win bonus alone must outweigh even the single biggest
    // difficulty bonus (expert) — beating Expert never eclipses winning.
    expect(WIN_GAME_XP).toBeGreaterThan(DIFFICULTY_WIN_XP.expert);
  });

  it("counts XP for every unlocked achievement tier, weighted by tier", () => {
    const fewBooks: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, counters: { books_melded: 5 } };
    const manyBooks: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, counters: { books_melded: 1000 } };
    // 1000 books unlocks every Bookworm tier (beginner..expert); 5 only unlocks beginner.
    expect(computeTotalXp(manyBooks)).toBeGreaterThan(computeTotalXp(fewBooks));
  });

  it("multiple AI difficulties present in the same win each contribute their own bonus", () => {
    const mixedTable: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      gamesPlayed: 1,
      gamesWon: 1,
      winsByDifficulty: { beginner: 1, expert: 1 },
    };
    const soloExpert: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      gamesPlayed: 1,
      gamesWon: 1,
      winsByDifficulty: { expert: 1 },
    };
    expect(computeTotalXp(mixedTable)).toBeGreaterThan(computeTotalXp(soloExpert));
  });
});

describe("computeTotalXp — server-credited bonus XP", () => {
  it("adds the xp_ledger sum on top of the derived XP", () => {
    const base: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 1 };
    expect(computeTotalXp({ ...base, bonusXp: 125 })).toBe(computeTotalXp(base) + 125);
  });
  it("treats a missing bonusXp (older state shapes) as 0", () => {
    const legacy = { ...EMPTY_PROGRESS_STATE } as Partial<AchievementProgressState>;
    delete legacy.bonusXp;
    expect(computeTotalXp(legacy as AchievementProgressState)).toBe(0);
  });
  it("can lift the level", () => {
    const state: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, bonusXp: xpForLevel(3) };
    expect(levelProgress(state).level).toBe(3);
  });
  it("daily/weekly achievements pay the usual tier XP", () => {
    const state: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      counters: { daily_deals_completed: 3, weekly_challenges_completed: 1 },
    };
    expect(computeTotalXp(state)).toBe(10 + 10); // beginner tier of each
  });
});

describe("levelProgress", () => {
  it("reports 0 progress and level 0 for a brand-new account", () => {
    const progress = levelProgress(EMPTY_PROGRESS_STATE);
    expect(progress.level).toBe(0);
    expect(progress.totalXp).toBe(0);
    expect(progress.progressFraction).toBe(0);
  });

  it("progressFraction lands between 0 and 1 mid-level", () => {
    const state: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 3 };
    const progress = levelProgress(state);
    expect(progress.progressFraction).toBeGreaterThanOrEqual(0);
    expect(progress.progressFraction).toBeLessThanOrEqual(1);
  });
});
