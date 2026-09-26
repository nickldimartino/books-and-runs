import { afterEach, describe, expect, it } from "vitest";
import { defaultTodayTab, loadTodayTab, resolveTodayTab, saveTodayTab, TODAY_TAB_KEY } from "./todayTab";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-today-tab");
});

const base = { questJustCompleted: false, dailyPlayedToday: false, weeklyPlayedThisWeek: false, questsAvailable: true };

describe("defaultTodayTab", () => {
  it("opens on Quests after a fresh payout", () => {
    expect(defaultTodayTab({ ...base, questJustCompleted: true })).toBe("quests");
  });
  it("otherwise Daily if unplayed, else Weekly if unplayed, else Quests", () => {
    expect(defaultTodayTab(base)).toBe("daily");
    expect(defaultTodayTab({ ...base, dailyPlayedToday: true })).toBe("weekly");
    expect(defaultTodayTab({ ...base, dailyPlayedToday: true, weeklyPlayedThisWeek: true })).toBe("quests");
  });
  it("never picks Quests while they are hidden (first session / unavailable)", () => {
    expect(defaultTodayTab({ ...base, questJustCompleted: true, questsAvailable: false })).toBe("daily");
    expect(defaultTodayTab({ ...base, dailyPlayedToday: true, weeklyPlayedThisWeek: true, questsAvailable: false })).toBe("daily");
  });
});

describe("resolveTodayTab", () => {
  it("prefers the remembered tab, then the computed default, then Daily", () => {
    expect(resolveTodayTab("weekly", "quests", true)).toBe("weekly");
    expect(resolveTodayTab(null, "weekly", true)).toBe("weekly");
    expect(resolveTodayTab(null, null, true)).toBe("daily");
  });
  it("ignores a remembered Quests tab when quests are not available", () => {
    expect(resolveTodayTab("quests", "weekly", false)).toBe("weekly");
    expect(resolveTodayTab("quests", null, false)).toBe("daily");
  });
});

describe("remembering the tab", () => {
  it("round-trips through localStorage and stamps <html data-today-tab>", () => {
    expect(loadTodayTab()).toBeNull();
    saveTodayTab("weekly");
    expect(loadTodayTab()).toBe("weekly");
    expect(document.documentElement.getAttribute("data-today-tab")).toBe("weekly");
  });
  it("ignores garbage values", () => {
    localStorage.setItem(TODAY_TAB_KEY, "bogus");
    expect(loadTodayTab()).toBeNull();
  });
});
