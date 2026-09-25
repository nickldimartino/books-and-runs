import { describe, expect, it } from "vitest";
import {
  DAILY_DEAL_XP,
  DAILY_STREAK_MILESTONE_XP,
  dailyLedgerRef,
  nextUtcMidnight,
  nextUtcWeekStart,
  reachedStreakMilestones,
  streakLedgerRef,
  streakStats,
  utcDayKey,
  utcIsoWeekKey,
  WEEKLY_CHALLENGE_XP,
  weeklyLedgerRef,
} from "./dailyRewards";

describe("fixed XP", () => {
  it("weekly pays more than daily, and milestones grow with the streak", () => {
    expect(WEEKLY_CHALLENGE_XP).toBeGreaterThan(DAILY_DEAL_XP);
    const days = Object.keys(DAILY_STREAK_MILESTONE_XP).map(Number).sort((a, b) => a - b);
    expect(days).toEqual([7, 30, 100]);
    const xps = days.map((d) => DAILY_STREAK_MILESTONE_XP[d]);
    expect([...xps].sort((a, b) => a - b)).toEqual(xps);
  });

  it("builds distinct, stable ledger refs (the primary key that makes credits idempotent)", () => {
    expect(dailyLedgerRef("2026-09-25")).toBe("daily:2026-09-25");
    expect(weeklyLedgerRef("2026-W39")).toBe("weekly:2026-W39");
    expect(streakLedgerRef(7)).toBe("streak:daily:7");
    expect(new Set([dailyLedgerRef("2026-09-25"), weeklyLedgerRef("2026-W39"), streakLedgerRef(7)]).size).toBe(3);
  });
});

describe("reachedStreakMilestones", () => {
  it("returns nothing below the first milestone", () => {
    expect(reachedStreakMilestones(6)).toEqual([]);
  });
  it("returns every milestone a best streak has reached, ascending", () => {
    expect(reachedStreakMilestones(7).map((m) => m.days)).toEqual([7]);
    expect(reachedStreakMilestones(45).map((m) => m.days)).toEqual([7, 30]);
    expect(reachedStreakMilestones(120).map((m) => m.days)).toEqual([7, 30, 100]);
  });
});

describe("streakStats (days)", () => {
  it("is all zeros for no completions", () => {
    expect(streakStats([], "day")).toEqual({ count: 0, best: 0, current: 0 });
  });
  it("counts consecutive days, ignoring order and duplicates", () => {
    const keys = ["2026-09-03", "2026-09-01", "2026-09-02", "2026-09-02"];
    expect(streakStats(keys, "day")).toEqual({ count: 3, best: 3, current: 3 });
  });
  it("resets after a gap but remembers the best run", () => {
    const keys = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-10", "2026-09-11"];
    expect(streakStats(keys, "day")).toEqual({ count: 5, best: 3, current: 2 });
  });
  it("handles month and year boundaries", () => {
    expect(streakStats(["2025-12-31", "2026-01-01", "2026-01-02"], "day").best).toBe(3);
    expect(streakStats(["2026-02-28", "2026-03-01"], "day").best).toBe(2);
  });
});

describe("streakStats (weeks) — same adjacency rule as migration 0039's trigger", () => {
  it("counts consecutive week numbers", () => {
    expect(streakStats(["2026-W10", "2026-W11", "2026-W12"], "week")).toEqual({ count: 3, best: 3, current: 3 });
  });
  it("breaks on a skipped week", () => {
    expect(streakStats(["2026-W10", "2026-W12"], "week")).toEqual({ count: 2, best: 1, current: 1 });
  });
  it("continues across a year rollover from week 52 or 53 into week 1", () => {
    expect(streakStats(["2025-W52", "2026-W01"], "week").best).toBe(2);
    expect(streakStats(["2020-W53", "2021-W01"], "week").best).toBe(2);
    expect(streakStats(["2025-W50", "2026-W01"], "week").best).toBe(1);
  });
});

describe("UTC period keys", () => {
  it("formats the UTC day", () => {
    expect(utcDayKey(new Date("2026-09-25T23:59:59Z"))).toBe("2026-09-25");
    expect(utcDayKey(new Date("2026-09-26T00:00:00Z"))).toBe("2026-09-26");
  });
  it("computes ISO weeks, including year edges", () => {
    expect(utcIsoWeekKey(new Date("2026-09-25T12:00:00Z"))).toBe("2026-W39");
    expect(utcIsoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(utcIsoWeekKey(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01"); // Monday of ISO week 1 of 2025
    expect(utcIsoWeekKey(new Date("2021-01-03T00:00:00Z"))).toBe("2020-W53"); // Sunday
  });
  it("Sunday belongs to the week that started the previous Monday", () => {
    expect(utcIsoWeekKey(new Date("2026-09-27T23:00:00Z"))).toBe("2026-W39");
    expect(utcIsoWeekKey(new Date("2026-09-28T00:00:00Z"))).toBe("2026-W40");
  });
  it("finds the next resets", () => {
    const now = new Date("2026-09-25T10:00:00Z"); // a Friday
    expect(new Date(nextUtcMidnight(now)).toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(new Date(nextUtcWeekStart(now)).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    const sunday = new Date("2026-09-27T23:59:00Z");
    expect(new Date(nextUtcWeekStart(sunday)).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    const monday = new Date("2026-09-28T00:00:00Z");
    expect(new Date(nextUtcWeekStart(monday)).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});
