// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { buildQuestViews, EMPTY_QUEST_STATE } from "../../lib/questsStore";
import { localDateKey } from "../../lib/dailyDealStore";
import { isoWeekKey } from "../../lib/weeklyChallengeStore";
import type { UseQuests } from "../../lib/useQuests";
import { TODAY_TAB_KEY } from "../../lib/todayTab";
import { TodayCard } from "./TodayCard";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const NOW = new Date();
function quests(over: Partial<UseQuests> = {}): UseQuests {
  return {
    views: buildQuestViews(EMPTY_QUEST_STATE, EMPTY_PROGRESS_STATE, null, NOW),
    earning: true,
    unavailable: false,
    justClaimed: [],
    dismissClaimed: () => {},
    now: NOW,
    ...over,
  };
}
const noop = () => {};
// Segment names can carry a screen-reader-only "needs attention" suffix.
const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });
const daily = (over = {}) => ({ streak: 3, lastPlayedDate: localDateKey(new Date(Date.now() - 86_400_000)), shields: 1, ...over });
const weekly = (over = {}) => ({ streak: 2, lastPlayedWeek: isoWeekKey(new Date(Date.now() - 7 * 86_400_000)), shields: 1, ...over });

function card(props: Partial<React.ComponentProps<typeof TodayCard>> = {}) {
  return render(
    <TodayCard
      signedIn
      dailyDeal={daily() as never}
      weeklyChallenge={weekly() as never}
      hasDailyDealSave={false}
      hasWeeklyChallengeSave={false}
      onPlayDaily={noop}
      onPlayWeekly={noop}
      quests={quests()}
      questsAvailable
      isFirstSession={false}
      {...props}
    />
  );
}

describe("TodayCard", () => {
  it("has Daily, Weekly and Quests segments and opens on Daily when it isn't played yet", () => {
    card();
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(/Something's waiting/, ""))).toEqual(["Daily", "Weekly", "Quests"]);
    expect(tab("Daily").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Play today's deal" })).toBeTruthy();
  });

  it("renders the streak + shield row once, for the selected segment only", () => {
    card();
    expect(screen.getAllByTestId("daily-shields")).toHaveLength(1);
    expect(screen.queryByTestId("weekly-shields")).toBeNull();
    fireEvent.click(tab("Weekly"));
    expect(screen.getAllByTestId("weekly-shields")).toHaveLength(1);
    expect(screen.queryByTestId("daily-shields")).toBeNull();
    fireEvent.click(tab("Quests"));
    expect(screen.queryByTestId("weekly-shields")).toBeNull();
    expect(screen.getByRole("region", { name: "Quests" })).toBeTruthy();
    expect(screen.getAllByRole("progressbar")).toHaveLength(6);
  });

  it("remembers the chosen segment, and a remembered one wins over the default", () => {
    const first = card();
    fireEvent.click(tab("Weekly"));
    expect(localStorage.getItem(TODAY_TAB_KEY)).toBe("weekly");
    first.unmount();
    card();
    expect(tab("Weekly").getAttribute("aria-selected")).toBe("true");
  });

  it("defaults to Weekly when Daily is already played", () => {
    card({ dailyDeal: daily({ lastPlayedDate: localDateKey() }) as never });
    expect(tab("Weekly").getAttribute("aria-selected")).toBe("true");
  });

  it("defaults to Quests after a fresh quest payout, and dots the segments that need attention", () => {
    card({ quests: quests({ justClaimed: [{ id: "d_win", period: "daily", xp: 30 }] }) });
    expect(tab("Quests").getAttribute("aria-selected")).toBe("true");
    // Daily and Weekly are unplayed -> dotted; the selected Quests segment isn't.
    expect(screen.getByTestId("today-dot-daily")).toBeTruthy();
    expect(screen.getByTestId("today-dot-weekly")).toBeTruthy();
    expect(screen.queryByTestId("today-dot-quests")).toBeNull();
  });

  it("shows no dots for guests (their played state isn't known) and a sign-in hint", () => {
    card({ signedIn: false, dailyDeal: null, weeklyChallenge: null, quests: quests({ earning: false }) });
    expect(screen.queryByTestId("today-dot-daily")).toBeNull();
    expect(screen.getByText(/sign in to keep a streak/i)).toBeTruthy();
    expect(screen.queryByTestId("daily-shields")).toBeNull();
  });

  it("hides the Quests segment in a calm first session and never lands on it", () => {
    localStorage.setItem(TODAY_TAB_KEY, "quests");
    card({ questsAvailable: false, isFirstSession: true });
    expect(document.getElementById("today-tab-quests")!.hasAttribute("hidden")).toBe(true);
    expect(tab("Daily").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("region", { name: "Quests" })).toBeNull();
  });

  it("supports arrow-key navigation between segments", () => {
    card();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(tab("Weekly").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(tab("Quests").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(tab("Daily").getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the in-progress note, the protected note and the play callbacks", () => {
    const onPlayDaily = vi.fn();
    card({ hasDailyDealSave: true, onPlayDaily });
    expect(screen.getByText("You left this one in progress.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue today's deal" }));
    expect(onPlayDaily).toHaveBeenCalled();
  });
});
