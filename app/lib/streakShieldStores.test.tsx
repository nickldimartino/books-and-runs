import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDailyDealGame,
  loadDailyDealState,
  markShieldNoticeSeen,
  mergeCloudDailyDealState,
  recordDailyDealResult,
  unseenShieldSave,
} from "./dailyDealStore";
import {
  createWeeklyChallengeGame,
  loadWeeklyChallengeState,
  mergeCloudWeeklyChallengeState,
  recordWeeklyChallengeResult,
} from "./weeklyChallengeStore";

// Local estimate of the streak-shield rule (the account's cloud record is the
// truth — see src/streakShield.ts and migration 0081). The local walk must
// match: +1 on consecutive days, one shield covers exactly one missed day.

function playOn(iso: string) {
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
  return recordDailyDealResult(createDailyDealGame());
}

describe("Daily Deal local shield estimate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("earns a shield at day 7 and shows it on that day only", () => {
    for (let d = 1; d <= 6; d++) playOn(`2026-05-0${d}`);
    expect(loadDailyDealState().shields).toBe(0);
    const s = playOn("2026-05-07");
    expect(s).toMatchObject({ streak: 7, shields: 1, shieldsEarned: 1, lastShieldEarnedOn: "2026-05-07" });
  });

  it("a single missed day spends the shield, keeps the streak, and doesn't count the covered day", () => {
    for (let d = 1; d <= 7; d++) playOn(`2026-05-0${d}`);
    const s = playOn("2026-05-09"); // 8th missed
    expect(s).toMatchObject({ streak: 8, shields: 0, coveredDays: ["2026-05-08"] });
    expect(s.history.map((h) => h.date)).not.toContain("2026-05-08");
  });

  it("two missed days reset the streak but keep the shield", () => {
    for (let d = 1; d <= 7; d++) playOn(`2026-05-0${d}`);
    const s = playOn("2026-05-10");
    expect(s).toMatchObject({ streak: 1, shields: 1, coveredDays: [] });
  });

  it("a missed day without a shield resets", () => {
    playOn("2026-05-01");
    playOn("2026-05-02");
    expect(playOn("2026-05-04")).toMatchObject({ streak: 1, shields: 0 });
  });

  it("re-recording the same day is a no-op", () => {
    for (let d = 1; d <= 7; d++) playOn(`2026-05-0${d}`);
    const once = loadDailyDealState();
    expect(playOn("2026-05-07")).toEqual(once);
  });

  it("announces a save once, only when recent", () => {
    for (let d = 1; d <= 7; d++) playOn(`2026-05-0${d}`);
    const s = playOn("2026-05-09");
    expect(unseenShieldSave(s)).toBe("2026-05-08");
    const seen = markShieldNoticeSeen();
    expect(unseenShieldSave(seen)).toBeNull();
    // A cover from long ago is never re-announced.
    vi.setSystemTime(new Date("2026-06-20T12:00:00"));
    expect(unseenShieldSave({ ...s, shieldNoticeSeen: null })).toBeNull();
  });

  it("merging a cloud record adopts its shields but keeps the device's seen marker", () => {
    for (let d = 1; d <= 7; d++) playOn(`2026-05-0${d}`);
    playOn("2026-05-09");
    markShieldNoticeSeen();
    const merged = mergeCloudDailyDealState({
      streak: 20,
      bestStreak: 20,
      lastPlayedDate: "2026-05-30",
      shields: 2,
      shieldsEarned: 4,
      covered: ["2026-05-08", "2026-05-20"],
      lastShieldEarnedOn: "2026-05-28",
    });
    expect(merged).toMatchObject({ shields: 2, shieldsEarned: 4, coveredDays: ["2026-05-08", "2026-05-20"], shieldNoticeSeen: "2026-05-08" });
    // An old-shaped cloud record (pre-0081) zeroes shields rather than crashing.
    expect(mergeCloudDailyDealState({ streak: 3, bestStreak: 3, lastPlayedDate: "2026-06-01" }).shields).toBe(0);
  });
});

describe("Weekly Challenge local shield estimate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  const playWeek = (iso: string) => {
    vi.setSystemTime(new Date(`${iso}T12:00:00`));
    return recordWeeklyChallengeResult(createWeeklyChallengeGame());
  };

  it("earns a shield at a 4-week streak and it covers exactly one missed week", () => {
    // Mondays of consecutive ISO weeks in 2026: 06-01 = W23 ... 06-22 = W26, skip W27, play W28 (07-06)
    for (const d of ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]) playWeek(d);
    expect(loadWeeklyChallengeState()).toMatchObject({ streak: 4, shields: 1, lastShieldEarnedOn: "2026-W26" });
    const s = playWeek("2026-07-06");
    expect(s).toMatchObject({ streak: 5, shields: 0, coveredWeeks: ["2026-W27"] });
  });

  it("two missed weeks reset, keeping the shield", () => {
    for (const d of ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]) playWeek(d);
    expect(playWeek("2026-07-13")).toMatchObject({ streak: 1, shields: 1 });
  });

  it("merge tolerates a pre-0081 cloud record", () => {
    expect(mergeCloudWeeklyChallengeState({ streak: 2, bestStreak: 2, lastPlayedWeek: "2026-W20" })).toMatchObject({
      shields: 0,
      coveredWeeks: [],
    });
  });
});
