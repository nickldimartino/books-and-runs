import { describe, expect, it } from "vitest";
import { deadCards } from "./strategy";
import { easyStrategy } from "./easy";
import { CONTRACTS } from "../types";
import { makeCard, makeGameState, makeHand, makePlayer } from "../testHelpers";

// Regression coverage for the contract-aware discard fix: deadCards() used to
// judge "dead" purely by duplicate-rank count, with zero concept of runs, so
// run-heavy rounds (3, 5, 7) would happily discard the only card building
// toward a run the AI badly needed. It's now scoped to the round's actual
// contract shape.
describe("deadCards", () => {
  it("treats run-building cards as dead when the round only needs books", () => {
    const hand = [...makeHand([["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]), makeCard("2", "clubs")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 1, players: [player] }); // 2 Books, 0 Runs

    const dead = deadCards(player, state);

    expect(dead.map((c) => c.rank).sort()).toEqual(["5", "6", "7"]);
  });

  it("keeps the same run-building cards alive when the round needs runs", () => {
    const hand = [...makeHand([["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]), makeCard("2", "clubs")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 3, players: [player] }); // 2 Runs

    const dead = deadCards(player, state);

    expect(dead).toHaveLength(0);
  });

  it("never marks wild cards as dead", () => {
    const player = makePlayer({ hand: [makeCard("2", "clubs"), makeCard("JOKER", "joker")] });
    const state = makeGameState({ round: 1, players: [player] });
    expect(deadCards(player, state)).toHaveLength(0);
  });

  it("keeps book-building cards alive on a book round even without duplicates yet, if wilds can complete it", () => {
    const hand = [makeCard("9", "hearts"), makeCard("2", "clubs"), makeCard("2", "spades")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 1, players: [player] }); // needs bookSize 3, has 1 natural 9 + 2 wilds

    const dead = deadCards(player, state);

    expect(dead).toHaveLength(0); // the 9 is one wild-fill away from a full book
  });

  it("marks a truly unrelated card dead even on a mixed book+run round", () => {
    const hand = [
      ...makeHand([["K", "hearts"], ["K", "clubs"], ["K", "spades"]]), // complete book
      makeCard("3", "diamonds"), // isolated, no run/book potential, no wilds
    ];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 2, players: [player] }); // 1 Book + 1 Run

    const dead = deadCards(player, state);

    expect(dead.map((c) => c.id)).toEqual([hand[3].id]);
  });
});

describe("easyStrategy.chooseDiscard (integration with contract-aware deadCards)", () => {
  it("prefers discarding a genuinely dead card over a run-building one on a run round", () => {
    const runBuilder = makeCard("5", "hearts", { id: "run-builder" });
    const isolated = makeCard("K", "diamonds", { id: "isolated" }); // face card, high penalty, unrelated suit
    const player = makePlayer({ hand: [runBuilder, makeCard("6", "hearts"), makeCard("7", "hearts"), isolated] });
    const state = makeGameState({ round: 3, currentPlayerIndex: 0, players: [player] });

    const discard = easyStrategy.chooseDiscard(state, player);

    expect(discard.id).toBe("isolated");
  });
});
