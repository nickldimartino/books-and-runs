import { describe, expect, it } from "vitest";
import { canLayOff, leftoverAfterMelds, solveContract, validateManualGroup } from "./meld";
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

describe("validateManualGroup", () => {
  const round1 = CONTRACTS[0]; // 2 Books, bookSize 3
  const round3 = CONTRACTS[2]; // 2 Runs, runSize 4

  it("accepts a valid book of matching ranks", () => {
    const group = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]);
    expect(validateManualGroup(group, round1)).toMatchObject({ valid: true, type: "book" });
  });

  it("accepts a book completed with a wild", () => {
    const group = [...makeHand([["5", "hearts"], ["5", "clubs"]]), makeCard("2", "diamonds")];
    expect(validateManualGroup(group, round1)).toMatchObject({ valid: true, type: "book" });
  });

  it("rejects a book selection below the required size", () => {
    const group = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
    ]);
    expect(validateManualGroup(group, round1).valid).toBe(false);
  });

  it("accepts a valid run of consecutive same-suit cards", () => {
    const group = makeHand([
      ["4", "hearts"],
      ["5", "hearts"],
      ["6", "hearts"],
      ["7", "hearts"],
    ]);
    expect(validateManualGroup(group, round3)).toMatchObject({ valid: true, type: "run" });
  });

  it("accepts a run with a wild filling a gap", () => {
    const group = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["7", "hearts"]]),
      makeCard("2", "clubs"), // wild fills the "6" slot
    ];
    expect(validateManualGroup(group, round3)).toMatchObject({ valid: true, type: "run" });
  });

  it("rejects a run with cards too far apart to fit one window", () => {
    const group = makeHand([
      ["3", "hearts"],
      ["4", "hearts"],
      ["9", "hearts"],
      ["10", "hearts"],
    ]);
    // four naturals but spanning a gap wider than the 4-card window they'd need to fit in
    expect(validateManualGroup(group, round3).valid).toBe(false);
  });

  it("rejects a run with a repeated rank", () => {
    const group = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"]]),
      makeCard("4", "hearts", { id: "dup-4h" }),
    ];
    expect(validateManualGroup(group, round3).valid).toBe(false);
  });

  it("rejects a selection that's neither a consistent rank nor a consistent suit", () => {
    const group = makeHand([
      ["4", "hearts"],
      ["7", "clubs"],
      ["K", "spades"],
    ]);
    expect(validateManualGroup(group, round1).valid).toBe(false);
  });

  it("rejects an all-wild selection", () => {
    const group = [makeCard("2", "hearts"), makeCard("JOKER", "joker")];
    expect(validateManualGroup(group, round1).valid).toBe(false);
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
