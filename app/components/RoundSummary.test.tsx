// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { makeGameState, makePlayer } from "@/testHelpers";

vi.mock("../GameContext", () => ({
  useGame: () => ({ getSessionCounters: () => ({}), isTutorial: true, trackStats: true }),
}));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/supabaseClient", () => ({ supabase: null }));
vi.mock("../lib/sound", () => ({ playAchievementUnlock: vi.fn(), playLevelUp: vi.fn() }));

import { RoundSummary } from "./RoundSummary";

afterEach(cleanup);

const state = makeGameState({
  round: 2,
  players: [
    makePlayer({ id: "p1", name: "You", cumulativeScore: 5, hasMeldedContract: true, hand: [] }),
    makePlayer({ id: "ai-0", name: "Bot", isAI: true, cumulativeScore: 20 }),
  ],
});

describe("RoundSummary — screen-reader confirmation", () => {
  // This screen fully replaces the board (game/page.tsx swaps it in
  // whenever a round ends) with nothing else moving focus there — without
  // this, a screen-reader user gets no signal that the round just ended.
  it("moves focus to the round-complete heading on mount", () => {
    render(<RoundSummary state={state} roundStartScores={{}} onNextRound={() => {}} />);
    expect(document.activeElement?.textContent).toContain("Round 2 complete");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("moves focus again when the round number changes without a full remount", () => {
    const { rerender } = render(<RoundSummary state={state} roundStartScores={{}} onNextRound={() => {}} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    rerender(<RoundSummary state={{ ...state, round: 3 }} roundStartScores={{}} onNextRound={() => {}} />);
    expect(document.activeElement?.textContent).toContain("Round 3 complete");
  });
});
