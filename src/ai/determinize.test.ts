// Exercises sampleOpponentHand/estimateCompletionChance against a real
// (unmocked) deck composition and meld solver — the only thing "faked" is
// the Rng. NEVER_MISTAKE (rng() always returns 1) makes
// pickWithoutReplacement deterministically take whatever's left at the end
// of the composed pool each draw, which — given fullComposition's fixed
// build order (deck-by-deck, suit-by-suit, rank-by-rank, jokers last) —
// makes every sample fully predictable: with nothing marked "seen," the
// last deck's 2 jokers come first, then its spades in descending rank
// order. Exact expected values below were verified empirically before
// being locked in here, not hand-derived from first principles.

import { describe, expect, it } from "vitest";
import { estimateCompletionChance, layOffRisk, sampleOpponentHand } from "./determinize";
import { makeCard, makeGameState, makeHand, makePlayer } from "../testHelpers";
import { Meld } from "../types";

const NEVER_MISTAKE = () => 1;

describe("sampleOpponentHand", () => {
  it("returns exactly the opponent's known hand size", () => {
    const self = makePlayer({ id: "self", hand: [] });
    const opponent = makePlayer({ id: "opponent", hand: makeHand(["9", "9", "9"]) });
    const state = makeGameState({ players: [self, opponent] });

    expect(sampleOpponentHand(state, self, opponent, NEVER_MISTAKE)).toHaveLength(3);
  });

  it("never samples a card whose only remaining copies are already accounted for as seen", () => {
    // Exactly 2 decks minimum (decksForPlayerCount), so exactly 2 copies of
    // any given card exist in the whole game — holding both leaves none
    // for anyone else to plausibly hold.
    const self = makePlayer({ id: "self", hand: makeHand([["9", "hearts"], ["9", "hearts"]]) });
    const opponent = makePlayer({ id: "opponent", hand: makeHand(new Array(10).fill("9")) });
    const state = makeGameState({ players: [self, opponent] });

    const sample = sampleOpponentHand(state, self, opponent, NEVER_MISTAKE);

    expect(sample.some((c) => c.rank === "9" && c.suit === "hearts")).toBe(false);
  });

  it("with a deterministic rng and nothing marked seen, draws the last deck's jokers first", () => {
    const self = makePlayer({ id: "self", hand: [] });
    const opponent = makePlayer({ id: "opponent", hand: makeHand(["9", "9"]) }); // only cares about length
    const state = makeGameState({ players: [self, opponent] });

    const sample = sampleOpponentHand(state, self, opponent, NEVER_MISTAKE);

    expect(sample.map((c) => c.rank)).toEqual(["JOKER", "JOKER"]);
  });
});

describe("estimateCompletionChance", () => {
  it("is 0 when the sampled hand plus the candidate card can't reach this round's contract", () => {
    const self = makePlayer({ id: "self", hand: [] });
    // Deterministic 7-card sample (see the file's own doc): 2 jokers plus a
    // 9-10-J-Q-K spades run — real, but round 3 needs *two* runs, and one
    // unrelated card doesn't supply a second one.
    const opponent = makePlayer({ id: "opponent", hand: makeHand(new Array(7).fill("9")) });
    const state = makeGameState({ round: 3, players: [self, opponent] }); // 2 runs, size 4

    const chance = estimateCompletionChance(state, self, opponent, makeCard("K", "clubs"), 5, NEVER_MISTAKE);

    expect(chance).toBe(0);
  });

  it("is 1 when the specific candidate card is exactly what completes the contract", () => {
    const self = makePlayer({ id: "self", hand: [] });
    const opponent = makePlayer({ id: "opponent", hand: makeHand(new Array(7).fill("9")) });
    const state = makeGameState({ round: 3, players: [self, opponent] });

    // Same deterministic sample as above (2 jokers + 9-10-J-Q-K spades) —
    // an 8 of spades extends it to 8 full consecutive spades plus 2 wilds,
    // comfortably enough for two runs of 4.
    const chance = estimateCompletionChance(state, self, opponent, makeCard("8", "spades"), 5, NEVER_MISTAKE);

    expect(chance).toBe(1);
  });
});

describe("layOffRisk", () => {
  const meld: Meld = {
    id: "book1",
    type: "book",
    ownerId: "opponent",
    cards: makeHand([["6", "hearts"], ["6", "clubs"], ["6", "spades"]]),
  };

  it("is 0 for an opponent who hasn't melded yet, regardless of the card", () => {
    const opponent = makePlayer({ id: "opponent", hand: makeHand(["9"]), hasMeldedContract: false });
    const state = makeGameState({ players: [makePlayer({ id: "self" }), opponent], melds: [meld] });

    expect(layOffRisk(state, opponent, makeCard("6", "diamonds"))).toBe(0);
  });

  it("is 0 for a melded opponent when the card can't be laid off anywhere", () => {
    const opponent = makePlayer({ id: "opponent", hand: makeHand(["9"]), hasMeldedContract: true });
    const state = makeGameState({ players: [makePlayer({ id: "self" }), opponent], melds: [meld] });

    expect(layOffRisk(state, opponent, makeCard("K", "spades"))).toBe(0);
  });

  it("is 1 (certain) for a melded opponent down to their last card who could lay off exactly this one", () => {
    const opponent = makePlayer({ id: "opponent", hand: makeHand(["9"]), hasMeldedContract: true });
    const state = makeGameState({ players: [makePlayer({ id: "self" }), opponent], melds: [meld] });

    expect(layOffRisk(state, opponent, makeCard("6", "diamonds"))).toBe(1);
  });

  it("is a real but smaller risk for a melded opponent with more than one card left", () => {
    const opponent = makePlayer({ id: "opponent", hand: makeHand(["9", "K"]), hasMeldedContract: true });
    const state = makeGameState({ players: [makePlayer({ id: "self" }), opponent], melds: [meld] });

    const risk = layOffRisk(state, opponent, makeCard("6", "diamonds"));
    expect(risk).toBeGreaterThan(0);
    expect(risk).toBeLessThan(1);
  });

  it("doesn't require the opponent to own the meld — lay-off targets are anyone's", () => {
    // ownerId on `meld` is "opponent" above; here the same check runs
    // against a DIFFERENT close opponent for a meld they don't own, which
    // is exactly how a real lay-off works (any table meld is fair game).
    const otherOpponent = makePlayer({ id: "someone-else", hand: makeHand(["9"]), hasMeldedContract: true });
    const state = makeGameState({
      players: [makePlayer({ id: "self" }), makePlayer({ id: "opponent" }), otherOpponent],
      melds: [meld],
    });

    expect(layOffRisk(state, otherOpponent, makeCard("6", "diamonds"))).toBe(1);
  });
});
