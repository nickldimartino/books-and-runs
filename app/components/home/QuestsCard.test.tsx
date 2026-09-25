// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { buildMetricSnapshot, questLedgerRef, questsForPeriod } from "@/quests";
import { buildQuestViews, EMPTY_QUEST_STATE } from "../../lib/questsStore";
import { formatResetsIn, QuestsCard } from "./QuestsCard";
import { QuestToast } from "./QuestToast";
import { WelcomeBackCard } from "./WelcomeBackCard";

afterEach(cleanup);

const NOW = new Date("2026-09-25T10:00:00Z");

describe("QuestsCard", () => {
  it("guests see the quests with a sign-in prompt instead of earned XP", () => {
    const views = buildQuestViews(EMPTY_QUEST_STATE, null, null, NOW);
    render(<QuestsCard views={views} earning={false} now={NOW} />);
    expect(screen.getAllByRole("progressbar")).toHaveLength(6);
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/sign-in");
    expect(screen.getByText(/sign in to earn xp/i)).toBeTruthy();
  });

  it("shows reset countdowns for both periods and hides the sign-in prompt when signed in", () => {
    const views = buildQuestViews(EMPTY_QUEST_STATE, EMPTY_PROGRESS_STATE, null, NOW);
    render(<QuestsCard views={views} earning now={NOW} />);
    expect(screen.getByText("New quests in 14h 0m")).toBeTruthy(); // 10:00 -> next UTC midnight
    expect(screen.getByText("New quests in 2d 14h")).toBeTruthy(); // Fri 10:00 -> Mon 00:00
    expect(screen.queryByText(/sign in to earn xp/i)).toBeNull();
  });

  it("shows progress against the baseline and a check on a claimed quest", () => {
    const quests = questsForPeriod("daily", "2026-09-25");
    const claimed = quests[0];
    const server = {
      baselines: { "2026-09-25": buildMetricSnapshot({ games_played: 0, games_won: 0 }, {}) },
      claimedRefs: new Set([questLedgerRef("2026-09-25", claimed.id)]),
    };
    const views = buildQuestViews(server, EMPTY_PROGRESS_STATE, null, NOW);
    render(<QuestsCard views={views} earning now={NOW} />);
    const bars = screen.getAllByRole("progressbar");
    const first = bars.find((b) => b.getAttribute("aria-valuemax") === String(claimed.target));
    expect(first).toBeTruthy();
    expect(screen.getAllByText("✓").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/^\+\d+ XP$/).length).toBe(6);
  });
});

describe("formatResetsIn", () => {
  const t = (key: string, vars?: Record<string, string | number>) => `${key}:${JSON.stringify(vars)}`;
  it("picks the coarsest useful unit", () => {
    expect(formatResetsIn(3 * 86_400_000 + 5 * 3_600_000, t as never)).toContain("quests.time.dh");
    expect(formatResetsIn(5 * 3_600_000, t as never)).toContain("quests.time.hm");
    expect(formatResetsIn(8 * 60_000, t as never)).toContain("quests.time.m");
    expect(formatResetsIn(0, t as never)).toContain('"m":1');
  });
});

describe("QuestToast", () => {
  it("renders nothing when there's nothing to celebrate", () => {
    const { container } = render(<QuestToast quests={[]} onDismiss={() => {}} />);
    expect(container.textContent).toBe("");
  });
  it("names each completed quest with its XP", () => {
    render(<QuestToast quests={[{ id: "d_win", period: "daily", xp: 30 }]} onDismiss={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Quest complete!");
    expect(screen.getByRole("status").textContent).toContain("Win games · +30 XP");
  });
});

describe("WelcomeBackCard", () => {
  it("recaps waiting games, a live streak and fresh quests, and can be dismissed", async () => {
    let dismissed = 0;
    render(<WelcomeBackCard gamesWaiting={2} dailyStreak={5} showQuests onDismiss={() => dismissed++} />);
    expect(screen.getByText("Welcome back!")).toBeTruthy();
    expect(screen.getByText("2 games are waiting for your move")).toBeTruthy();
    expect(screen.getByText(/5-day Daily Deal streak/)).toBeTruthy();
    expect(screen.getByText("Fresh quests are ready.")).toBeTruthy();
    screen.getByRole("button", { name: "Dismiss" }).click();
    expect(dismissed).toBe(1);
  });
  it("stays positive with no streak or games — no guilt copy", () => {
    render(<WelcomeBackCard gamesWaiting={0} dailyStreak={0} showQuests={false} onDismiss={() => {}} />);
    expect(screen.getByText(/Today's Daily Deal is ready/)).toBeTruthy();
    expect(screen.queryByText(/waiting for your move/)).toBeNull();
    expect(screen.queryByText(/quests/i)).toBeNull();
  });
});
