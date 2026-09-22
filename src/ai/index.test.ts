import { describe, expect, it, vi } from "vitest";
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

describe("playAITurn — move log", () => {
  it("returns a draw, meld, lay-off(s), and discard entry in order for a normal melding turn", () => {
    // A book of 2s in hand plus a spare 5 that lays off nowhere — melds the
    // contract (2 Books needs a second book too, so give it one), then has
    // nothing to lay off, then discards the spare.
    const hand = [
      ...makeHand(["A", "A", "A"]),
      ...makeHand(["K", "K", "K"]),
      makeCard("5", "clubs", { id: "spare" }),
    ];
    const ai = makePlayer({ id: "ai1", isAI: true, difficulty: "medium", hand });
    const human = makePlayer({ id: "p2", hand: makeHand(["9", "9", "9"]) });
    const state = makeGameState({
      round: 1,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      players: [ai, human],
      drawPile: [makeCard("3", "diamonds", { id: "drawn" })],
      discardPile: [],
    });

    const entries = playAITurn(state);

    expect(entries[0]).toMatchObject({ seat: 0, type: "draw" });
    expect(entries.some((e) => e.type === "meldContract")).toBe(true);
    expect(entries.at(-1)).toMatchObject({ seat: 0, type: "discard" });
    // Every entry actually happened — replaying them is exactly what made
    // hasMeldedContract/hand end up this way, nothing extra or skipped.
    expect(ai.hasMeldedContract).toBe(true);
  });

  it("still logs a draw entry when the draw pile is truly exhausted (round ends with no further moves)", () => {
    const ai = makePlayer({ id: "ai1", isAI: true, difficulty: "medium", hand: makeHand(["9", "9", "9"]) });
    const human = makePlayer({ id: "p2", hand: makeHand(["9", "9", "9"]) });
    const state = makeGameState({
      round: 1,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      players: [ai, human],
      drawPile: [],
      discardPile: [makeCard("K", "clubs")], // <=1 card: nothing left to reshuffle in either
    });

    // wantsDiscardPileDraw's default rng is the real Math.random — medium's
    // own MISTAKE_CHANCE (strategy.ts) means it occasionally takes the lone
    // King anyway regardless of whether it helps a 9-9-9 hand, which isn't
    // what this test is about (it's checking the round-ends-with-no-moves
    // path, not the mistake-roll subsystem — that's strategy.test.ts's own
    // job). Pin it so the real discardHelpsHand judgment always applies:
    // 1 is never < any (0,1) chance, so the mistake roll never fires.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const entries = playAITurn(state);
    randomSpy.mockRestore();

    expect(entries).toEqual([{ seat: 0, type: "draw", fromDiscard: false }]);
    expect(state.roundOver).toBe(true);
  });

  it("doesn't log a meldContract entry on a later turn where the player already melded", () => {
    const hand = [...makeHand(["A", "A", "A"]), makeCard("5", "clubs", { id: "spare" })];
    const ai = makePlayer({ id: "ai1", isAI: true, difficulty: "medium", hand, hasMeldedContract: true });
    const human = makePlayer({ id: "p2", hand: makeHand(["9", "9", "9"]) });
    const state = makeGameState({
      round: 1,
      selectedContracts: CONTRACTS,
      currentPlayerIndex: 0,
      melds: [{ id: "ai1-meld-0-book", type: "book", ownerId: "ai1", cards: makeHand(["A", "A", "A"]) }],
      players: [ai, human],
      drawPile: [makeCard("3", "diamonds", { id: "drawn" })],
      discardPile: [],
    });

    const entries = playAITurn(state);

    expect(entries.some((e) => e.type === "meldContract")).toBe(false);
  });
});
