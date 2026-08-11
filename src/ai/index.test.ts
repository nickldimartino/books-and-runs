import { describe, expect, it } from "vitest";
import { playAITurn } from "./index";
import { CONTRACTS } from "../types";
import { makeCard, makeGameState, makeHand, makePlayer } from "../testHelpers";

describe("playAITurn — round 7 (3 Runs, no discard)", () => {
  it("ends the round when melding 3 runs leaves a card that gets discarded down to empty", () => {
    // 3 runs of 4 (12 cards) + 1 unrelated leftover card that can't lay off
    // anywhere and isn't picked up by the draw (drawPile has a dead card).
    const runs = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    const leftover = makeCard("K", "diamonds", { id: "leftover" });
    const ai = makePlayer({
      id: "ai1",
      isAI: true,
      difficulty: "medium",
      hand: [...runs, leftover],
    });
    const human = makePlayer({ id: "p2", hand: makeHand(["9", "9", "9"]) });

    const state = makeGameState({
      round: 7,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      players: [ai, human],
      drawPile: [makeCard("2", "spades", { id: "drawn" })], // wild, won't affect the leftover logic
      discardPile: [],
    });

    playAITurn(state);

    expect(ai.hasMeldedContract).toBe(true);
    expect(ai.hand).toHaveLength(0);
    expect(state.roundOver).toBe(true);
    expect(state.gameOver).toBe(true);
  });

  it("ends the round immediately (no discard) when melding empties the hand exactly", () => {
    const runs = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    const ai = makePlayer({ id: "ai1", isAI: true, difficulty: "medium", hand: runs });
    const human = makePlayer({ id: "p2", hand: makeHand(["9", "9", "9"]) });

    const state = makeGameState({
      round: 7,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      players: [ai, human],
      // The forced draw must itself end up melded/laid off for the hand to
      // reach exactly 0 — an 8♥ extends the hearts run already in hand.
      drawPile: [makeCard("8", "hearts", { id: "drawn" })],
      discardPile: [],
    });

    playAITurn(state);

    expect(ai.hasMeldedContract).toBe(true);
    expect(ai.hand).toHaveLength(0);
    expect(state.discardHistory).toHaveLength(0); // no-discard path, not a discard-to-empty
    expect(state.roundOver).toBe(true);
    expect(state.gameOver).toBe(true);
  });

  it("keeps playing normally when the hand has genuine cards left after melding", () => {
    const runs = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    const leftovers = [makeCard("K", "diamonds", { id: "leftover1" }), makeCard("Q", "diamonds", { id: "leftover2" })];
    const ai = makePlayer({ id: "ai1", isAI: true, difficulty: "medium", hand: [...runs, ...leftovers] });
    const human = makePlayer({ id: "p2", hand: makeHand(["9", "9", "9"]) });

    const state = makeGameState({
      round: 7,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      players: [ai, human],
      drawPile: [makeCard("2", "clubs", { id: "drawn" })], // wild — lays off onto a run, not a dead-end
      discardPile: [],
    });

    playAITurn(state);

    // Melded, laid the wild off, discarded one leftover — one card should
    // still remain (this is correct: the round should NOT end just because
    // the contract was melded, only once the hand is actually empty).
    expect(ai.hasMeldedContract).toBe(true);
    expect(ai.hand).toHaveLength(1);
    expect(state.roundOver).toBe(false);
    expect(state.currentPlayerIndex).toBe(1); // turn correctly advanced to the human
  });
});
