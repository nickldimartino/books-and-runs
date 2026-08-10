import { describe, expect, it } from "vitest";
import { canLayOff, leftoverAfterMelds, solveContract } from "./meld";
import { CONTRACTS, Meld } from "./types";
import { makeCard, makeHand } from "./testHelpers";

describe("solveContract", () => {
  it("finds two books for round 1 (2 Books)", () => {
    const hand = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
      ["9", "hearts"],
      ["9", "clubs"],
      ["9", "spades"],
    ]);
    const melds = solveContract(hand, CONTRACTS[0], "p1");
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(2);
    expect(melds!.every((m) => m.type === "book" && m.cards.length === 3)).toBe(true);
  });

  it("uses a wild to fill a book short by one natural card", () => {
    const hand = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      "2", // wild
      ["9", "hearts"],
      ["9", "clubs"],
      ["9", "spades"],
    ]);
    const melds = solveContract(hand, CONTRACTS[0], "p1");
    expect(melds).not.toBeNull();
    const fiveBook = melds!.find((m) => m.cards.some((c) => c.rank === "5"));
    expect(fiveBook?.cards.some((c) => c.isWild)).toBe(true);
  });

  it("returns null when the contract can't currently be met", () => {
    const hand = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["9", "hearts"],
      ["9", "clubs"],
    ]);
    const melds = solveContract(hand, CONTRACTS[0], "p1");
    expect(melds).toBeNull();
  });

  it("finds a run of 4+ same-suit consecutive cards for round 3 (2 Runs)", () => {
    const hand = makeHand([
      ["4", "hearts"],
      ["5", "hearts"],
      ["6", "hearts"],
      ["7", "hearts"],
      ["8", "clubs"],
      ["9", "clubs"],
      ["10", "clubs"],
      ["J", "clubs"],
    ]);
    const melds = solveContract(hand, CONTRACTS[2], "p1");
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(2);
    expect(melds!.every((m) => m.type === "run" && m.cards.length === 4)).toBe(true);
  });

  it("finds a mixed book + run for round 2 (1 Book + 1 Run)", () => {
    const hand = makeHand([
      ["K", "hearts"],
      ["K", "clubs"],
      ["K", "spades"],
      ["4", "diamonds"],
      ["5", "diamonds"],
      ["6", "diamonds"],
      ["7", "diamonds"],
    ]);
    const melds = solveContract(hand, CONTRACTS[1], "p1");
    expect(melds).not.toBeNull();
    expect(melds!.some((m) => m.type === "book")).toBe(true);
    expect(melds!.some((m) => m.type === "run")).toBe(true);
  });

  it("does not reuse the same natural card across two melds", () => {
    // Only enough cards for one book, contract needs two.
    const hand = makeHand([
      ["7", "hearts"],
      ["7", "clubs"],
      ["7", "spades"],
    ]);
    const melds = solveContract(hand, CONTRACTS[0], "p1");
    expect(melds).toBeNull();
  });
});

describe("leftoverAfterMelds", () => {
  it("returns hand cards not used in the given melds", () => {
    const used = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]);
    const leftoverCard = makeCard("9", "diamonds");
    const hand = [...used, leftoverCard];
    const meld: Meld = { id: "m1", type: "book", ownerId: "p1", cards: used };
    expect(leftoverAfterMelds(hand, [meld])).toEqual([leftoverCard]);
  });
});

describe("canLayOff", () => {
  const book: Meld = {
    id: "book1",
    type: "book",
    ownerId: "p1",
    cards: makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]),
  };

  const run: Meld = {
    id: "run1",
    type: "run",
    ownerId: "p1",
    runStartIndex: 3, // index of "4" in RUN_ORDER
    cards: makeHand([
      ["4", "diamonds"],
      ["5", "diamonds"],
      ["6", "diamonds"],
      ["7", "diamonds"],
    ]),
  };

  it("allows a matching-rank card onto a book", () => {
    expect(canLayOff(makeCard("5", "diamonds"), book)).toBe(true);
  });

  it("rejects a non-matching-rank card onto a book", () => {
    expect(canLayOff(makeCard("6", "diamonds"), book)).toBe(false);
  });

  it("allows a wild card onto any meld", () => {
    expect(canLayOff(makeCard("2", "spades"), book)).toBe(true);
    expect(canLayOff(makeCard("2", "hearts"), run)).toBe(true);
  });

  it("allows a card extending either end of a run, same suit only", () => {
    expect(canLayOff(makeCard("3", "diamonds"), run)).toBe(true); // extends low end
    expect(canLayOff(makeCard("8", "diamonds"), run)).toBe(true); // extends high end
    expect(canLayOff(makeCard("8", "hearts"), run)).toBe(false); // wrong suit
    expect(canLayOff(makeCard("9", "diamonds"), run)).toBe(false); // not adjacent
  });
});
