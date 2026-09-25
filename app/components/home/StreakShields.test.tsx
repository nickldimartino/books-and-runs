// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShieldSavedCard } from "./ShieldSavedCard";
import { StreakShields } from "./StreakShields";
import { WelcomeBackCard } from "./WelcomeBackCard";

afterEach(cleanup);

describe("StreakShields", () => {
  it("renders one glyph per slot, filled for held shields, with an accessible label and explainer", () => {
    const { container } = render(<StreakShields count={1} max={2} explainer="Earn one every 7 days." testId="daily-shields" />);
    const filled = container.querySelectorAll('svg[data-filled="true"]');
    const open = container.querySelectorAll('svg[data-filled="false"]');
    expect(filled).toHaveLength(1);
    expect(open).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Streak shields: 1 of 2" })).toBeTruthy();
    expect(screen.getByText("Earn one every 7 days.")).toBeTruthy();
    expect(screen.getByTestId("daily-shields").getAttribute("title")).toContain("Streak shields: 1 of 2");
  });

  it("clamps the held count to the slots", () => {
    render(<StreakShields count={5} max={2} explainer="x" testId="s" />);
    expect(screen.getByRole("img", { name: "Streak shields: 2 of 2" })).toBeTruthy();
    cleanup();
    render(<StreakShields count={-1} max={1} explainer="x" testId="s" />);
    expect(screen.getByRole("img", { name: "Streak shields: 0 of 1" })).toBeTruthy();
  });
});

describe("ShieldSavedCard", () => {
  it("is a friendly, dismissible status message", () => {
    const onDismiss = vi.fn();
    render(<ShieldSavedCard streak={9} onDismiss={onDismiss} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Your shield saved your streak")).toBeTruthy();
    expect(screen.getByText(/9-day streak is still going strong/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("WelcomeBackCard with a saved streak", () => {
  it("mentions the shield instead of the plain streak line", () => {
    render(<WelcomeBackCard gamesWaiting={0} dailyStreak={9} shieldSaved showQuests={false} onDismiss={() => {}} />);
    expect(screen.getByText(/A shield covered a missed day, so your 9-day streak is safe/)).toBeTruthy();
    expect(screen.queryByText(/still going/)).toBeNull();
  });
  it("keeps the existing line when no shield was used", () => {
    render(<WelcomeBackCard gamesWaiting={0} dailyStreak={9} showQuests={false} onDismiss={() => {}} />);
    expect(screen.getByText(/9-day Daily Deal streak is still going/)).toBeTruthy();
  });
});
