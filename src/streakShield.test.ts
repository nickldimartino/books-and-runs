import { describe, expect, it } from "vitest";
import { reachedStreakMilestones, streakStats } from "./dailyRewards";
import {
  dailyDisplayStreak,
  dailyShieldStats,
  dayIndex,
  dayKeyFromIndex,
  displayStreak,
  walkShieldStreak,
  weekIndex,
  weekKeyFromIndex,
  weeklyDisplayStreak,
  weeklyShieldStats,
  DAILY_SHIELD_CONFIG,
  WEEKLY_SHIELD_CONFIG,
} from "./streakShield";

const BASE = "2026-03-01";
/** Day keys for the given offsets from BASE. */
const days = (...offsets: number[]) => offsets.map((o) => dayKeyFromIndex(dayIndex(BASE) + o));
const range = (from: number, len: number) => Array.from({ length: len }, (_, i) => from + i);

describe("daily shield: earning", () => {
  it("earns nothing before day 7, one at day 7", () => {
    expect(dailyShieldStats(days(...range(0, 6))).shields).toBe(0);
    const s = dailyShieldStats(days(...range(0, 7)));
    expect(s).toMatchObject({ current: 7, best: 7, shields: 1, earned: 1, used: 0, lastEarnedOn: days(6)[0] });
  });
  it("earns another at 14 and is capped at holding 2", () => {
    expect(dailyShieldStats(days(...range(0, 14))).shields).toBe(2);
    const s = dailyShieldStats(days(...range(0, 21)));
    expect(s.shields).toBe(2);
    expect(s.earned).toBe(2); // the 21-day shield was not granted at the cap
  });
  it("earns again at 28 after the cap freed up by a spend", () => {
    // 0..13 (2 shields), gap covered at 14, play 15..20 -> streak 21? spend one then earn at 21.
    const s = dailyShieldStats(days(...range(0, 14), ...range(15, 10)));
    expect(s.used).toBe(1);
    expect(s.current).toBe(24);
    expect(s.earned).toBe(3); // streak hit 21 with 1 held -> granted
    expect(s.shields).toBe(2);
  });
  it("no shield for 6 days, then a 7th after a reset", () => {
    const s = dailyShieldStats(days(...range(0, 5), ...range(8, 7)));
    expect(s.current).toBe(7);
    expect(s.shields).toBe(1);
  });
});

describe("daily shield: spending", () => {
  it("a single missed day with a shield continues the streak without incrementing for the covered day", () => {
    const s = dailyShieldStats(days(...range(0, 7), 8)); // missed day 7
    expect(s.current).toBe(8); // 7 played + 1 more played; covered day adds nothing
    expect(s.used).toBe(1);
    expect(s.shields).toBe(0);
    expect(s.covered).toEqual(days(7));
    expect(s.count).toBe(8); // covered day is not a completion
  });
  it("a single missed day without a shield resets to 1", () => {
    const s = dailyShieldStats(days(...range(0, 6), 7));
    expect(s.current).toBe(1);
    expect(s.best).toBe(6);
    expect(s.covered).toEqual([]);
  });
  it("two or more missed days reset regardless of shields, and shields are kept", () => {
    const s = dailyShieldStats(days(...range(0, 14), 17));
    expect(s.current).toBe(1);
    expect(s.best).toBe(14);
    expect(s.shields).toBe(2);
    expect(s.used).toBe(0);
  });
  it("chains across separate gaps, one shield each", () => {
    // 14 days (2 shields), gap, 2 days, gap, 2 days
    const s = dailyShieldStats(days(...range(0, 14), 15, 16, 18, 19));
    expect(s.used).toBe(2);
    expect(s.shields).toBe(0);
    expect(s.current).toBe(18);
    expect(s.covered).toEqual(days(14, 17));
  });
  it("a third separate gap with no shield left resets", () => {
    const s = dailyShieldStats(days(...range(0, 14), 15, 17, 19));
    expect(s.used).toBe(2);
    expect(s.current).toBe(1);
    expect(s.best).toBe(16);
  });
  it("reaching a multiple of 7 on a shield-bridged day still earns", () => {
    // 7 played (1 shield), gap covered, then 6 more -> streak 14 on a bridge-including run
    const s = dailyShieldStats(days(...range(0, 7), ...range(8, 6)));
    expect(s.current).toBe(13);
    const t = dailyShieldStats(days(...range(0, 7), ...range(8, 7)));
    expect(t.current).toBe(14);
    expect(t.earned).toBe(2);
    expect(t.shields).toBe(1); // spent 1, earned at 14
  });
  it("consecutive-day resets: back-to-back plays never spend a shield", () => {
    const s = dailyShieldStats(days(...range(0, 20)));
    expect(s.used).toBe(0);
  });
});

describe("daily shield: keys, ordering, idempotence", () => {
  it("is order- and duplicate-insensitive", () => {
    const keys = days(...range(0, 9), 11, 12);
    const shuffled = [...keys].reverse().concat(keys.slice(0, 4));
    expect(dailyShieldStats(shuffled)).toEqual(dailyShieldStats(keys));
  });
  it("is a pure function of the history (recompute is idempotent)", () => {
    const keys = days(...range(0, 20), 22, 23);
    const a = dailyShieldStats(keys);
    expect(dailyShieldStats(keys)).toEqual(a);
    expect(dailyShieldStats([...keys, ...keys])).toEqual(a);
  });
  it("handles month, year and leap-day boundaries by calendar adjacency", () => {
    expect(dailyShieldStats(["2027-12-30", "2027-12-31", "2028-01-01"]).current).toBe(3);
    expect(dailyShieldStats(["2028-02-28", "2028-02-29", "2028-03-01"]).current).toBe(3);
    expect(dailyShieldStats(["2027-02-28", "2027-03-01"]).current).toBe(2);
  });
  it("uses calendar keys, so DST-change days are still adjacent", () => {
    // US spring-forward 2026-03-08, fall-back 2026-11-01: 23h/25h days must not create phantom gaps.
    expect(dailyShieldStats(["2026-03-07", "2026-03-08", "2026-03-09"]).current).toBe(3);
    expect(dailyShieldStats(["2026-10-31", "2026-11-01", "2026-11-02"]).current).toBe(3);
  });
  it("empty and single histories", () => {
    expect(dailyShieldStats([])).toMatchObject({ count: 0, current: 0, best: 0, shields: 0, lastPlayed: null, covered: [] });
    expect(dailyShieldStats(["2026-01-01"])).toMatchObject({ count: 1, current: 1, best: 1, lastPlayed: "2026-01-01" });
  });
  it("invariant: shields = earned - used, 0 <= shields <= cap", () => {
    let seed = 7;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let n = 0; n < 300; n++) {
      const idx = range(0, 80).filter(() => r() < 0.8);
      const w = walkShieldStreak(idx, DAILY_SHIELD_CONFIG);
      expect(w.shields).toBe(w.earned - w.used);
      expect(w.shields).toBeGreaterThanOrEqual(0);
      expect(w.shields).toBeLessThanOrEqual(2);
      expect(w.count).toBe(new Set(idx).size);
      expect(w.best).toBeGreaterThanOrEqual(w.current);
    }
  });
});

describe("streak-milestone XP and completion counts are unaffected", () => {
  it("covered days are not completions", () => {
    const keys = days(...range(0, 7), 8);
    expect(dailyShieldStats(keys).count).toBe(keys.length);
    expect(streakStats(keys, "day").count).toBe(keys.length);
  });
  it("milestone XP is keyed per milestone, so a bridged run can never pay one twice", () => {
    // 7-day streak reached via a bridge is still ONE 7-milestone.
    const s = dailyShieldStats(days(...range(0, 4), ...range(5, 5))); // no shield yet: gap resets
    expect(s.best).toBe(5);
    const t = dailyShieldStats(days(...range(0, 7), ...range(8, 25)));
    const ms = reachedStreakMilestones(t.best);
    expect(ms.map((m) => m.days)).toEqual([7, 30]);
    expect(new Set(ms.map((m) => m.days)).size).toBe(ms.length);
  });
  it("without gaps the shield stats match the plain streak stats", () => {
    const keys = days(...range(0, 40));
    const plain = streakStats(keys, "day");
    const sh = dailyShieldStats(keys);
    expect([sh.count, sh.best, sh.current]).toEqual([plain.count, plain.best, plain.current]);
  });
});

describe("weekly shield", () => {
  const wk = (from: string, ...offsets: number[]) => offsets.map((o) => weekKeyFromIndex(weekIndex(from) + o));
  it("earns one at a 4-week streak and holds at most 1", () => {
    expect(weeklyShieldStats(wk("2026-W10", 0, 1, 2)).shields).toBe(0);
    expect(weeklyShieldStats(wk("2026-W10", 0, 1, 2, 3)).shields).toBe(1);
    const s = weeklyShieldStats(wk("2026-W10", ...range(0, 8)));
    expect(s.shields).toBe(1);
    expect(s.earned).toBe(1);
  });
  it("covers exactly one missed week", () => {
    const s = weeklyShieldStats(wk("2026-W10", 0, 1, 2, 3, 5));
    expect(s.current).toBe(5);
    expect(s.covered).toEqual(wk("2026-W10", 4));
    expect(s.shields).toBe(0);
    expect(weeklyShieldStats(wk("2026-W10", 0, 1, 2, 3, 6)).current).toBe(1);
  });
  it("adjacency works across the ISO year boundary (2026 has 53 weeks)", () => {
    expect(weekKeyFromIndex(weekIndex("2026-W53") + 1)).toBe("2027-W01");
    expect(weeklyShieldStats(["2026-W52", "2026-W53", "2027-W01"]).current).toBe(3);
    expect(weekKeyFromIndex(weekIndex("2027-W01") - 1)).toBe("2026-W53");
  });
  it("week key <-> index round trips over several years", () => {
    for (let i = weekIndex("2022-W01"); i < weekIndex("2030-W01"); i++) {
      expect(weekIndex(weekKeyFromIndex(i))).toBe(i);
    }
    expect(weekKeyFromIndex(weekIndex("2026-W39"))).toBe("2026-W39");
  });
  it("uses its own config", () => {
    expect(walkShieldStreak(range(0, 8), WEEKLY_SHIELD_CONFIG).shields).toBe(1);
  });
});

describe("display streak", () => {
  it("keeps the streak for today or yesterday, lapses otherwise", () => {
    expect(displayStreak(5, 0, 0)).toBe(5);
    expect(displayStreak(5, 1, 0)).toBe(5);
    expect(displayStreak(5, 2, 0)).toBe(0);
    expect(displayStreak(0, 0, 2)).toBe(0);
    expect(displayStreak(5, null, 2)).toBe(0);
  });
  it("a held shield keeps a one-day-missed streak alive, but not two days", () => {
    expect(displayStreak(9, 2, 1)).toBe(9);
    expect(displayStreak(9, 3, 2)).toBe(0);
  });
  it("keyed wrappers", () => {
    expect(dailyDisplayStreak(9, "2026-05-01", 1, "2026-05-03")).toBe(9);
    expect(dailyDisplayStreak(9, "2026-05-01", 0, "2026-05-03")).toBe(0);
    expect(weeklyDisplayStreak(6, "2026-W20", 1, "2026-W22")).toBe(6);
    expect(weeklyDisplayStreak(6, "2026-W20", 1, "2026-W23")).toBe(0);
  });
});
