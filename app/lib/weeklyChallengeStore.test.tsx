import { describe, expect, it } from "vitest";
import { isoWeekKey, weekKeyMinusOneWeek } from "./weeklyChallengeStore";

// Reference values cross-checked against the canonical ISO-8601 week
// algorithm (Thursday-anchored, first Thursday of the ISO year) — the exact
// dates real calendars disagree about: a Jan 1 that falls in the *previous*
// ISO year's last week, and a Dec 31 that falls in *next* ISO year's week 1.
describe("isoWeekKey", () => {
  it("handles an ordinary midyear date", () => {
    expect(isoWeekKey(new Date(2026, 5, 15))).toBe("2026-W25");
  });

  it("puts Jan 1 in the previous ISO year's last week when Jan 1 isn't Mon-Thu", () => {
    // 2027-01-01 is a Friday — belongs to 2026's final week (W53).
    expect(isoWeekKey(new Date(2027, 0, 1))).toBe("2026-W53");
  });

  it("puts Jan 1 in week 1 when Jan 1 is Mon-Thu", () => {
    // 2026-01-01 is a Thursday — belongs to 2026-W01.
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe("2026-W01");
  });

  it("puts a late-December date in next year's week 1 when it falls on/after that Monday", () => {
    // 2025-12-29 (Monday) already belongs to 2026-W01.
    expect(isoWeekKey(new Date(2025, 11, 29))).toBe("2026-W01");
  });

  it("gives a year 53 ISO weeks when its last Thursday falls in that year", () => {
    expect(isoWeekKey(new Date(2020, 11, 31))).toBe("2020-W53");
  });
});

describe("weekKeyMinusOneWeek", () => {
  it("steps back within the same ISO year", () => {
    expect(weekKeyMinusOneWeek("2026-W25")).toBe("2026-W24");
  });

  it("crosses an ISO year boundary correctly", () => {
    expect(weekKeyMinusOneWeek("2026-W01")).toBe("2025-W52");
  });

  it("is the true inverse of isoWeekKey across a boundary", () => {
    const thisWeek = isoWeekKey(new Date(2026, 0, 1));
    const lastWeek = weekKeyMinusOneWeek(thisWeek);
    // Stepping back 7 days from any date in `thisWeek` must land in `lastWeek`.
    const aDateThisWeek = new Date(2026, 0, 1);
    const aWeekEarlier = new Date(aDateThisWeek);
    aWeekEarlier.setDate(aWeekEarlier.getDate() - 7);
    expect(isoWeekKey(aWeekEarlier)).toBe(lastWeek);
  });
});
