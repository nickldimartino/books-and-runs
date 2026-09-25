import { afterEach, describe, expect, it } from "vitest";
import { isReturningAfterAbsence, readLastHomeVisit, touchHomeVisit, WELCOME_BACK_AFTER_DAYS } from "./welcomeBackStore";

const DAY = 86_400_000;

afterEach(() => window.localStorage.clear());

describe("welcomeBackStore", () => {
  it("has no previous visit on a fresh device — never a 'welcome back'", () => {
    expect(readLastHomeVisit()).toBeNull();
    expect(isReturningAfterAbsence(null)).toBe(false);
  });

  it("round-trips the visit timestamp", () => {
    touchHomeVisit(1_700_000_000_000);
    expect(readLastHomeVisit()).toBe(1_700_000_000_000);
  });

  it("only counts an absence of at least WELCOME_BACK_AFTER_DAYS", () => {
    const now = 1_800_000_000_000;
    expect(isReturningAfterAbsence(now - (WELCOME_BACK_AFTER_DAYS * DAY - 1), now)).toBe(false);
    expect(isReturningAfterAbsence(now - WELCOME_BACK_AFTER_DAYS * DAY, now)).toBe(true);
    expect(isReturningAfterAbsence(now - 30 * DAY, now)).toBe(true);
    expect(isReturningAfterAbsence(now - DAY, now)).toBe(false);
  });

  it("ignores garbage in storage", () => {
    window.localStorage.setItem("booksAndRuns:lastHomeVisit", "not-a-number");
    expect(readLastHomeVisit()).toBeNull();
  });
});
