import { describe, expect, it } from "vitest";
import { playAITurn } from "./index";
import { CONTRACTS } from "../types";
import { makeCard, makeGameState, makeHand, makePlayer } from "../testHelpers";

describe("playAITurn — round 7 (3 Runs, whole-hand meld)", () => {
  it("melds and ends the round immediately when the drawn card extends a run to use the whole hand", () => {
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
      // The forced draw must itself end up melded for the hand to reach
      // exactly 0 — an 8♥ extends the hearts run already in hand.
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

  it("does not meld a partial contract that would leave cards stranded in hand", () => {
    // 3 valid runs (12 cards) plus a 4th-suit leftover that can't join any of
    // them and isn't a 4th run either — the round needs exactly 3. Melding
    // just these 3 runs and discarding the leftover is exactly the bug this
    // round's whole-hand rule exists to prevent: nothing may be melded until
    // the entire hand fits.
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
      drawPile: [makeCard("2", "spades", { id: "drawn" })], // wild, still can't rescue the diamond leftover
      discardPile: [],
    });

    playAITurn(state);

    // Can't meld this turn — the whole hand doesn't fit into exactly 3 runs.
    // Play continues normally: draw, no meld, discard, turn advances.
    expect(ai.hasMeldedContract).toBe(false);
    expect(state.melds).toHaveLength(0);
    expect(state.roundOver).toBe(false);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("absorbs a genuinely extra wild by padding a run beyond the minimum length", () => {
    // Hearts run of exactly 4, clubs run of exactly 4, and a short 3-card
    // spades cluster (4-5-6, no internal gap) one short of the minimum run
    // size of 4 — the drawn wild pads it out to 4-5-6-7, using every card in
    // hand, including the drawn wild, across exactly 3 runs.
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"]]),
    ];
    const ai = makePlayer({ id: "ai1", isAI: true, difficulty: "medium", hand });
    const human = makePlayer({ id: "p2", hand: makeHand(["9", "9", "9"]) });

    const state = makeGameState({
      round: 7,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      players: [ai, human],
      drawPile: [makeCard("JOKER", "joker", { id: "drawn" })],
      discardPile: [],
    });

    playAITurn(state);

    expect(ai.hasMeldedContract).toBe(true);
    expect(ai.hand).toHaveLength(0);
    expect(state.roundOver).toBe(true);
  });
});
