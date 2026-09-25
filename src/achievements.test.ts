import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_TIERS,
  AchievementProgressState,
  achievementValue,
  allAchievements,
  EMPTY_PROGRESS_STATE,
  tierNumber,
} from "./achievements";

describe("tierNumber", () => {
  it("numbers beginner through expert as 1 through 5", () => {
    expect(ACHIEVEMENT_TIERS.map(tierNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("ACHIEVEMENT_FAMILIES", () => {
  it("has exactly 48 families, giving 240 achievements at 5 tiers each", () => {
    expect(ACHIEVEMENT_FAMILIES).toHaveLength(48);
    expect(allAchievements(EMPTY_PROGRESS_STATE)).toHaveLength(240);
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

  it("multiplayer families read the mp progress fields", () => {
    const state: AchievementProgressState = {
      ...EMPTY_PROGRESS_STATE,
      mpGamesPlayed: 8,
      mpGamesWon: 5,
      mpBestWinStreak: 4,
    };
    expect(achievementValue(ACHIEVEMENT_FAMILIES.find((f) => f.id === "mp_games_played")!, state)).toBe(8);
    expect(achievementValue(ACHIEVEMENT_FAMILIES.find((f) => f.id === "mp_games_won")!, state)).toBe(5);
    expect(achievementValue(ACHIEVEMENT_FAMILIES.find((f) => f.id === "mp_win_streak")!, state)).toBe(4);
    // 5/8 = 62.5%, and 8 games clears MP_WIN_RATE_MIN_GAMES (6)
    expect(achievementValue(ACHIEVEMENT_FAMILIES.find((f) => f.id === "mp_win_rate")!, state)).toBeCloseTo(62.5);

    const tooFew: AchievementProgressState = { ...EMPTY_PROGRESS_STATE, mpGamesPlayed: 3, mpGamesWon: 3 };
    expect(achievementValue(ACHIEVEMENT_FAMILIES.find((f) => f.id === "mp_win_rate")!, tooFew)).toBe(0);
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

// achievement_thresholds (migration 0027 + later additions) drives
// compute_total_xp()/category_mastered()/rarity server-side and is kept in
// sync with ACHIEVEMENT_FAMILIES by hand — this catches drift in either one.
describe("achievement_thresholds SQL parity", () => {
  const dir = join(__dirname, "../supabase/migrations");
  const sql = ["0027_premium_emoji_live_level.sql", "0057_daily_weekly_achievements.sql"]
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  const rowRe =
    /\(\s*'([a-z_0-9]+)',\s*'([A-Za-z]+)',\s*'([A-Za-z]+)',\s*(null|'[a-z_0-9]+'),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(true|false)\s*\)/g;
  const rows = new Map<string, RegExpMatchArray>();
  for (const m of sql.matchAll(rowRe)) rows.set(m[1], m);

  it("has a row for every family with identical category, source key, thresholds and direction", () => {
    for (const family of ACHIEVEMENT_FAMILIES) {
      const row = rows.get(family.id);
      expect(row, `missing SQL row for ${family.id}`).toBeTruthy();
      const [, , category, , key, b, e, m, h, x, lower] = row!;
      expect(category, family.id).toBe(family.category);
      if (family.source.kind === "counter") expect(key, family.id).toBe(`'${family.source.key}'`);
      expect([b, e, m, h, x].map(Number), family.id).toEqual(ACHIEVEMENT_TIERS.map((t) => family.thresholds[t]));
      expect(lower === "true", family.id).toBe(!!family.lowerIsBetter);
    }
    expect(rows.size).toBe(ACHIEVEMENT_FAMILIES.length);
  });
});
