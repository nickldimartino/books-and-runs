// @vitest-environment jsdom

// React-layer tests for the local-game provider — the ~1000-line file that
// owns turn flow, the AI loop, and localStorage persistence, and had none.
// The headline case is the rapid-tap draw guard (a shipped bug: fast taps
// on the draw pile drew several cards in one turn).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { GameProvider, useGame } from "./GameContext";
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
