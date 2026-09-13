// @vitest-environment jsdom

// React-layer tests for the local-game provider — the ~1000-line file that
// owns turn flow, the AI loop, and localStorage persistence, and had none.
// The headline case is the rapid-tap draw guard (a shipped bug: fast taps
// on the draw pile drew several cards in one turn).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { GameProvider, UNDO_GRACE_MS, useGame } from "./GameContext";
import { seededRng } from "@/deck";
import { solveContract } from "@/meld";
import { makeGameState, makeHand, makePlayer } from "@/testHelpers";
import { CONTRACTS, SHORT_GAME_CONTRACTS } from "@/types";
import { YOU_PLAYER_ID } from "./lib/recordGameResult";

// Audio/haptics fire on nearly every action and have nothing to test here.
vi.mock("./lib/sound", () => ({
  playCardTap: vi.fn(),
  playCardSlide: vi.fn(),
  playMeld: vi.fn(),
  playUndo: vi.fn(),
  playAchievementUnlock: vi.fn(),
  playLevelUp: vi.fn(),
  setTutorialSoundOverride: vi.fn(),
}));
vi.mock("./lib/haptics", () => ({
  hapticLight: vi.fn(),
  hapticMedium: vi.fn(),
}));

let api: ReturnType<typeof useGame>;
function Harness() {
  api = useGame();
  return null;
}

function mount() {
  render(
    <GameProvider>
      <Harness />
    </GameProvider>
  );
}

const TWO_PLAYERS = [
  { id: YOU_PLAYER_ID, name: "You", isAI: false },
  { id: "ai-1", name: "Bot", isAI: true, difficulty: "medium" as const },
];

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

/**
 * Deals real round-1 games (seeding Math.random, same trick
 * src/ai/balance.test.ts and engine.fuzz.test.ts use) until one leaves the
 * human holding a hand solveContract can meld outright, melds it, and
 * returns the hand length beforehand — so undo tests exercise confirmMeld
 * through a genuinely dealt hand instead of a hand-constructed one. The
 * provider must already be mounted.
 */
function meldFirstSolvableHand(): number {
  const realRandom = Math.random;
  try {
    for (let seed = 0; seed < 500; seed++) {
      Math.random = seededRng(seed);
      act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
      act(() => api.revealHand());
      act(() => api.draw(false));
      const melds = solveContract(api.state!.players[0].hand, CONTRACTS[0], YOU_PLAYER_ID);
      if (!melds) continue;
      const before = api.state!.players[0].hand.length;
      act(() => api.confirmMeld(melds.map((m) => m.cards.map((c) => c.id))));
      return before;
    }
    throw new Error("meldFirstSolvableHand: no solvable hand found in 500 seeds");
  } finally {
    Math.random = realRandom;
  }
}

describe("GameContext — turn flow", () => {
  it("starts a game with the human at the pass-gate, no cards drawn", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    expect(api.state).not.toBeNull();
    expect(api.state!.players).toHaveLength(2);
    expect(api.awaitingReveal).toBe(true);
    expect(api.hasDrawn).toBe(false);
    expect(api.state!.players[0].hand).toHaveLength(13);
  });

  it("draw() takes exactly one card per turn, even when called rapidly", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    act(() => api.revealHand());

    const drawPileBefore = api.state!.drawPile.length;
    const handBefore = api.state!.players[0].hand.length;

    // Simulate a burst of taps in one tick — the bug was that each call read
    // the stale `hasDrawn` state and went through.
    act(() => {
      api.draw(false);
      api.draw(false);
      api.draw(false);
      api.draw(false);
      api.draw(false);
    });

    expect(api.state!.players[0].hand).toHaveLength(handBefore + 1);
    expect(api.state!.drawPile).toHaveLength(drawPileBefore - 1);
    expect(api.hasDrawn).toBe(true);
  });

  it("a full turn: draw then discard advances to the AI seat and resets hasDrawn", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    act(() => api.revealHand());
    act(() => api.draw(false));

    expect(api.state!.currentPlayerIndex).toBe(0);
    const toDiscard = api.state!.players[0].hand[0].id;

    act(() => api.discard(toDiscard));

    expect(api.hasDrawn).toBe(false);
    expect(api.state!.currentPlayerIndex).toBe(1); // AI's turn now
    expect(api.state!.discardPile.at(-1)!.id).toBe(toDiscard);
  });

  it("discard() called twice in a tick only discards once", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    act(() => api.revealHand());
    act(() => api.draw(false));

    const handBefore = api.state!.players[0].hand.length;
    const first = api.state!.players[0].hand[0].id;

    act(() => {
      api.discard(first);
      api.discard(api.state!.players[0].hand[0]?.id ?? first);
    });

    expect(api.state!.players[0].hand).toHaveLength(handBefore - 1);
  });
});

describe("GameContext — persistence", () => {
  it("saves the game to localStorage and continueGame() restores it", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, SHORT_GAME_CONTRACTS));
    act(() => api.revealHand());
    act(() => api.draw(false));
    const discarded = api.state!.players[0].hand[0].id;
    act(() => api.discard(discarded));

    const saved = localStorage.getItem("booksAndRuns:savedGame");
    expect(saved).toBeTruthy();

    // Fresh provider — nothing in memory — then restore.
    mount();
    expect(api.state).toBeNull();
    expect(api.hasSavedGame).toBe(true);
    act(() => api.continueGame());

    expect(api.state).not.toBeNull();
    expect(api.state!.selectedContracts).toHaveLength(SHORT_GAME_CONTRACTS.length);
    expect(api.state!.discardPile.some((c) => c.id === discarded)).toBe(true);
  });

  it("a tutorial game never writes the real saved-game slot", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    act(() => api.revealHand());
    act(() => api.draw(false));
    act(() => api.discard(api.state!.players[0].hand[0].id));
    localStorage.removeItem("booksAndRuns:savedGame");

    act(() => api.startTutorialGame());
    act(() => api.revealHand());
    expect(api.isTutorial).toBe(true);
    expect(localStorage.getItem("booksAndRuns:savedGame")).toBeNull();
  });

  it("a Daily Deal game never writes the real saved-game slot", () => {
    mount();
    act(() => api.startDailyDeal());
    act(() => api.revealHand());
    act(() => api.draw(false));
    act(() => api.discard(api.state!.players[0].hand[0].id));

    expect(api.isDailyDeal).toBe(true);
    expect(localStorage.getItem("booksAndRuns:savedGame")).toBeNull();
  });

  it("a Daily Deal exited early can be resumed with continueDailyDeal()", () => {
    mount();
    act(() => api.startDailyDeal());
    act(() => api.revealHand());
    act(() => api.draw(false));
    const discarded = api.state!.players[0].hand[0].id;
    act(() => api.discard(discarded));

    const saved = localStorage.getItem("booksAndRuns:dailyDealSave");
    expect(saved).toBeTruthy();
    act(() => api.quitToHome());

    // Fresh provider — nothing in memory — then resume.
    mount();
    expect(api.state).toBeNull();
    act(() => api.continueDailyDeal());

    expect(api.state).not.toBeNull();
    expect(api.isDailyDeal).toBe(true);
    expect(api.state!.discardPile.some((c) => c.id === discarded)).toBe(true);
  });

  it("a Weekly Challenge game never writes the real saved-game slot", () => {
    mount();
    act(() => api.startWeeklyChallenge());
    act(() => api.revealHand());
    act(() => api.draw(false));
    act(() => api.discard(api.state!.players[0].hand[0].id));

    expect(api.isWeeklyChallenge).toBe(true);
    expect(api.isDailyDeal).toBe(false);
    expect(localStorage.getItem("booksAndRuns:savedGame")).toBeNull();
    // The full standard game, not a single round like Daily Deal.
    expect(api.state!.selectedContracts.length).toBe(CONTRACTS.length);
  });

  it("a Weekly Challenge exited early can be resumed with continueWeeklyChallenge()", () => {
    mount();
    act(() => api.startWeeklyChallenge());
    act(() => api.revealHand());
    act(() => api.draw(false));
    const discarded = api.state!.players[0].hand[0].id;
    act(() => api.discard(discarded));

    const saved = localStorage.getItem("booksAndRuns:weeklyChallengeSave");
    expect(saved).toBeTruthy();
    act(() => api.quitToHome());

    // Fresh provider — nothing in memory — then resume.
    mount();
    expect(api.state).toBeNull();
    act(() => api.continueWeeklyChallenge());

    expect(api.state).not.toBeNull();
    expect(api.isWeeklyChallenge).toBe(true);
    expect(api.state!.discardPile.some((c) => c.id === discarded)).toBe(true);
  });

  it("starting a Weekly Challenge doesn't leave Daily Deal's flag set, and vice versa", () => {
    mount();
    act(() => api.startDailyDeal());
    expect(api.isDailyDeal).toBe(true);
    act(() => api.startWeeklyChallenge());
    expect(api.isDailyDeal).toBe(false);
    expect(api.isWeeklyChallenge).toBe(true);
  });

  it("quitToHome() drops the game and clears the saved slot", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, SHORT_GAME_CONTRACTS));
    act(() => api.revealHand());
    act(() => api.draw(false));
    act(() => api.discard(api.state!.players[0].hand[0].id));
    expect(localStorage.getItem("booksAndRuns:savedGame")).toBeTruthy();

    act(() => api.quitToHome());

    expect(api.state).toBeNull();
    expect(api.hasSavedGame).toBe(false);
    expect(localStorage.getItem("booksAndRuns:savedGame")).toBeNull();
  });
});

describe("GameContext — hand ordering", () => {
  it("sortHand() reorders without adding or losing a card", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    act(() => api.revealHand());

    const before = api.state!.players[0].hand.map((c) => c.id).sort();
    act(() => api.sortHand("rank"));
    const after = api.state!.players[0].hand.map((c) => c.id).sort();

    expect(after).toEqual(before);
    expect(api.state!.players[0].hand).toHaveLength(13);
  });

  it("reorderHand() applies an exact given order", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    act(() => api.revealHand());

    const reversed = [...api.state!.players[0].hand.map((c) => c.id)].reverse();
    act(() => api.reorderHand(reversed));

    expect(api.state!.players[0].hand.map((c) => c.id)).toEqual(reversed);
  });
});

describe("GameContext — undo grace window", () => {
  it("arms canUndo/undoExpiresAt on a successful meld and reverts the hand on undoLastAction", () => {
    mount();
    const before = meldFirstSolvableHand();

    expect(api.canUndo).toBe(true);
    expect(api.undoExpiresAt).not.toBeNull();
    expect(api.undoExpiresAt!).toBeGreaterThan(Date.now());
    expect(api.state!.players[0].hand.length).toBeLessThan(before);

    act(() => api.undoLastAction());

    expect(api.canUndo).toBe(false);
    expect(api.undoExpiresAt).toBeNull();
    expect(api.state!.players[0].hand.length).toBe(before);
  });

  it("the grace window silently expires on its own after UNDO_GRACE_MS", () => {
    mount();
    meldFirstSolvableHand();
    expect(api.canUndo).toBe(true);

    act(() => vi.advanceTimersByTime(UNDO_GRACE_MS));

    expect(api.canUndo).toBe(false);
    expect(api.undoExpiresAt).toBeNull();
  });

  it("any other action invalidates a still-ticking grace window immediately", () => {
    mount();
    meldFirstSolvableHand();
    expect(api.canUndo).toBe(true);

    act(() => api.sortHand("rank"));

    expect(api.canUndo).toBe(false);
    expect(api.undoExpiresAt).toBeNull();
  });
});

describe("GameContext — seed and move log (server-verified stats)", () => {
  it("a fresh game gets a seed and starts with an empty move log; draw()/discard() append entries", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, CONTRACTS));
    expect(api.getSeed()).not.toBeNull();
    expect(api.getMoveLog()).toEqual([]);

    act(() => api.revealHand());
    act(() => api.draw(false));
    expect(api.getMoveLog()).toEqual([{ seat: 0, type: "draw", fromDiscard: false }]);

    const toDiscard = api.state!.players[0].hand[0].id;
    act(() => api.discard(toDiscard));
    expect(api.getMoveLog()).toEqual([
      { seat: 0, type: "draw", fromDiscard: false },
      { seat: 0, type: "discard", cardId: toDiscard },
    ]);
  });

  it("undoLastAction trims the move log back to before the undone meld, matching the reverted state", () => {
    mount();
    meldFirstSolvableHand();
    const loggedAfterMeld = api.getMoveLog();
    expect(loggedAfterMeld.at(-1)?.type).toBe("meldGroups");

    act(() => api.undoLastAction());

    expect(api.getMoveLog()).toHaveLength(loggedAfterMeld.length - 1);
  });

  it("a tutorial game has no seed and is never in scope for verification", () => {
    mount();
    act(() => api.startTutorialGame());
    expect(api.getSeed()).toBeNull();
  });

  it("continueGame() restores the seed and move log from the saved game", () => {
    mount();
    act(() => api.startNewGame(TWO_PLAYERS, SHORT_GAME_CONTRACTS));
    act(() => api.revealHand());
    act(() => api.draw(false));
    act(() => api.discard(api.state!.players[0].hand[0].id));
    const seedBefore = api.getSeed();
    const moveLogBefore = api.getMoveLog();

    mount();
    act(() => api.continueGame());

    expect(api.getSeed()).toBe(seedBefore);
    expect(api.getMoveLog()).toEqual(moveLogBefore);
  });

  /**
   * Melding (or laying off) down to a completely empty hand ends the round
   * immediately with no discard to follow — gameEngine.ts's own functions
   * don't do this themselves (see GameContext.tsx's finishIfWentOut), so
   * confirmMeld/layOff have to log that round-ending state change with the
   * same shape playAITurn's round-7 auto-out already uses, or a
   * server-side replay would have no way to know it happened (this was a
   * real gap: fixed alongside adding this test).
   */
  it("melding the whole hand outside round 7 logs a null-cardId discard entry (finishIfWentOut)", () => {
    mount();
    const you = makePlayer({
      id: YOU_PLAYER_ID,
      hand: [...makeHand(["A", "A", "A"]), ...makeHand(["K", "K", "K"])],
    });
    const ai = makePlayer({ id: "ai-1", isAI: true, difficulty: "medium", hand: makeHand(["9", "9", "9"]) });
    const state = makeGameState({
      round: 1,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      players: [you, ai],
    });
    localStorage.setItem(
      "booksAndRuns:savedGame",
      JSON.stringify({
        state,
        hasDrawn: true,
        roundStartScores: { [YOU_PLAYER_ID]: 0, "ai-1": 0 },
        roundHistory: [],
        sessionCounters: {},
        seed: 123,
        moveLog: [],
        trackStats: true,
        savedAt: Date.now(),
      })
    );
    act(() => api.continueGame());

    const aceIds = you.hand.filter((c) => c.rank === "A").map((c) => c.id);
    const kingIds = you.hand.filter((c) => c.rank === "K").map((c) => c.id);
    act(() => api.confirmMeld([aceIds, kingIds]));

    expect(api.state!.players[0].hand).toHaveLength(0);
    expect(api.state!.roundOver).toBe(true);
    expect(api.getMoveLog()).toEqual([
      { seat: 0, type: "meldGroups", groups: [aceIds, kingIds], preferredRunStarts: undefined },
      { seat: 0, type: "discard", cardId: null },
    ]);
  });
});
