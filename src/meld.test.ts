import { describe, expect, it } from "vitest";
import {
  canLayOff,
  layOffOptions,
  leftoverAfterMelds,
  runCardRank,
  solveContract,
  solveWholeHandContract,
  validateManualGroup,
} from "./meld";
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

  it("does not use more wild cards than natural cards to complete a book", () => {
    // Only 1 natural "5" — the old solver would've filled the other 2 book
    // slots with wilds; that's no longer allowed (wilds can't outnumber
    // naturals), so this hand can't meet the round-1 (2 Books) contract.
    const hand = makeHand([
      ["5", "hearts"],
      "2",
      "2",
      ["9", "hearts"],
      ["9", "clubs"],
      ["9", "spades"],
    ]);
    const melds = solveContract(hand, CONTRACTS[0], "p1");
    expect(melds).toBeNull();
  });

  it("solves a round with an Ace-high run (J-Q-K-A)", () => {
    const hand = makeHand([
      ["J", "hearts"],
      ["Q", "hearts"],
      ["K", "hearts"],
      ["A", "hearts"],
      ["4", "clubs"],
      ["5", "clubs"],
      ["6", "clubs"],
      ["7", "clubs"],
    ]);
    const melds = solveContract(hand, CONTRACTS[2], "p1"); // round 3: 2 Runs
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(2);
    expect(melds!.every((m) => m.type === "run" && m.cards.length === 4)).toBe(true);
  });

  it("keeps a run's cards in sorted rank order with a wild filling the correct gap", () => {
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["7", "hearts"]]),
      makeCard("2", "clubs"), // wild — must fill the "6" slot, not just tack onto the end
    ];
    const oneRun = { ...CONTRACTS[2], runs: 1 }; // round 3's shape, but needing only 1 run
    const melds = solveContract(hand, oneRun, "p1");
    expect(melds).not.toBeNull();
    const run = melds![0];
    expect(run.cards.map((c) => c.isWild)).toEqual([false, false, true, false]);
    expect(run.cards.map((_, i) => runCardRank(run, i))).toEqual(["4", "5", "6", "7"]);
  });

  // 2s are dual-purpose for the AI's own melding too (see validateManualGroup
  // for the rule; here it's the automatic solver's version of the same idea).
  it("recognizes a book of natural 2s, no wild needed", () => {
    const hand = [
      makeCard("2", "hearts"),
      makeCard("2", "clubs"),
      makeCard("2", "spades"),
      ...makeHand([["9", "hearts"], ["9", "clubs"], ["9", "spades"]]),
    ];
    const melds = solveContract(hand, CONTRACTS[0], "p1");
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(2);
    const twoBook = melds!.find((m) => m.cards.every((c) => c.rank === "2"));
    expect(twoBook?.cards).toHaveLength(3);
  });

  it("recognizes a book of 2s completed by a Joker", () => {
    const hand = [
      makeCard("2", "hearts"),
      makeCard("2", "clubs"),
      makeCard("JOKER", "joker"),
      ...makeHand([["9", "hearts"], ["9", "clubs"], ["9", "spades"]]),
    ];
    const melds = solveContract(hand, CONTRACTS[0], "p1");
    expect(melds).not.toBeNull();
    const twoBook = melds!.find((m) => m.cards.some((c) => c.rank === "2"));
    expect(twoBook?.cards.map((c) => c.rank).sort()).toEqual(["2", "2", "JOKER"]);
  });

  it("uses a natural 2 in a run's own slot, no wild left over to spend elsewhere", () => {
    const hand = makeHand([
      ["A", "hearts"],
      ["2", "hearts"],
      ["3", "hearts"],
      ["4", "hearts"],
    ]);
    const oneRun = { ...CONTRACTS[2], runs: 1 };
    const melds = solveContract(hand, oneRun, "p1");
    expect(melds).not.toBeNull();
    expect(melds![0].cards.map((c) => c.rank)).toEqual(["A", "2", "3", "4"]);
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

  it("accepts a run with Ace low (A-2-3-4, wild filling the 2)", () => {
    const group = [
      ...makeHand([["A", "hearts"], ["3", "hearts"], ["4", "hearts"]]),
      makeCard("2", "hearts"), // wild fills the "2" slot
    ];
    expect(validateManualGroup(group, round3)).toMatchObject({ valid: true, type: "run" });
  });

  it("accepts a run with Ace high (J-Q-K-A)", () => {
    const group = makeHand([
      ["J", "hearts"],
      ["Q", "hearts"],
      ["K", "hearts"],
      ["A", "hearts"],
    ]);
    expect(validateManualGroup(group, round3)).toMatchObject({ valid: true, type: "run" });
  });

  it("rejects a run that would wrap King-Ace-2-3", () => {
    const group = [
      ...makeHand([["K", "hearts"], ["A", "hearts"], ["3", "hearts"]]),
      makeCard("2", "hearts"), // wild
    ];
    expect(validateManualGroup(group, round3).valid).toBe(false);
  });

  it("rejects a book with more wilds than naturals", () => {
    const group = [makeCard("5", "hearts"), makeCard("2", "clubs"), makeCard("2", "spades")];
    expect(validateManualGroup(group, round1).valid).toBe(false);
  });

  it("rejects a run that would need two wild cards in a row", () => {
    // Naturals 4 and 9 are 5 slots apart — the only 4-card window covering
    // both would need "5" and a slot between them both wild, and no other
    // window fits two naturals this far apart either.
    const group = [
      ...makeHand([["4", "hearts"], ["9", "hearts"]]),
      makeCard("2", "clubs"),
      makeCard("2", "diamonds"),
    ];
    expect(validateManualGroup(group, round3).valid).toBe(false);
  });

  it("returns the run's cards in sorted order, wild in its correct gap, regardless of selection order", () => {
    // Tapped in a scrambled order: 7, wild, 4, 5 — the "6" slot must still
    // end up sorted between 5 and 7 in the returned arrangement.
    const seven = makeCard("7", "hearts");
    const wild = makeCard("2", "clubs");
    const four = makeCard("4", "hearts");
    const five = makeCard("5", "hearts");
    const result = validateManualGroup([seven, wild, four, five], round3);
    expect(result).toMatchObject({ valid: true, type: "run" });
    expect(result.orderedCards).toEqual([four, five, wild, seven]);
  });

  it("accepts a run with two non-adjacent wilds", () => {
    // Naturals 6,7 with two wilds can only form a valid run as 5-6-7-8 (wilds
    // filling 5 and 8) — the other candidate windows (4-5-6-7, 6-7-8-9) would
    // both need the two wilds back to back, so this only works because a
    // non-adjacent placement also exists.
    const group = [
      ...makeHand([["6", "hearts"], ["7", "hearts"]]),
      makeCard("2", "clubs"),
      makeCard("2", "diamonds"),
    ];
    expect(validateManualGroup(group, round3)).toMatchObject({ valid: true, type: "run" });
  });

  // A 2 is dual-purpose: it can count as its own natural rank ("2") or as a
  // generic wild, whichever makes the selection valid — unlike a Joker,
  // which is always wild.
  it("accepts a book of 2s completed with a Joker", () => {
    const group = [makeCard("2", "hearts"), makeCard("2", "clubs"), makeCard("JOKER", "joker")];
    expect(validateManualGroup(group, round1)).toMatchObject({ valid: true, type: "book" });
  });

  it("accepts a book of three natural 2s, no wild needed", () => {
    const group = [makeCard("2", "hearts"), makeCard("2", "clubs"), makeCard("2", "spades")];
    expect(validateManualGroup(group, round1)).toMatchObject({ valid: true, type: "book" });
  });

  it("still rejects a 'book of Jokers' completed by a 2 — Jokers have no natural rank of their own", () => {
    const group = [makeCard("JOKER", "joker"), makeCard("JOKER", "joker"), makeCard("2", "hearts")];
    expect(validateManualGroup(group, round1).valid).toBe(false);
  });

  it("accepts a run using a natural 2 in its own suit's '2' slot, no wild needed", () => {
    const group = makeHand([
      ["A", "spades"],
      ["2", "spades"],
      ["3", "spades"],
      ["4", "spades"],
    ]);
    const result = validateManualGroup(group, round3);
    expect(result).toMatchObject({ valid: true, type: "run" });
    // All four cards are naturals in their own right — none of them should
    // have been reclassified as a generic wild filling a gap.
    expect(result.orderedCards).toEqual(group);
  });

  it("accepts a run using one 2 naturally and a second 2 as a wild filling a different gap (A-2-[wild 3]-4)", () => {
    const group = [
      makeCard("A", "spades"),
      makeCard("2", "spades"),
      makeCard("2", "hearts"), // wild, fills the missing "3"
      makeCard("4", "spades"),
    ];
    const result = validateManualGroup(group, round3);
    expect(result).toMatchObject({ valid: true, type: "run" });
    expect(result.orderedCards?.map((c) => c.rank)).toEqual(["A", "2", "2", "4"]);
  });

  it("accepts a run using a natural 2 alongside a Joker filling a different gap (A-2-[wild 3]-4)", () => {
    const group = [
      makeCard("A", "spades"),
      makeCard("2", "spades"),
      makeCard("JOKER", "joker"), // wild, fills the missing "3"
      makeCard("4", "spades"),
    ];
    const result = validateManualGroup(group, round3);
    expect(result).toMatchObject({ valid: true, type: "run" });
    expect(result.orderedCards?.map((c) => c.rank)).toEqual(["A", "2", "JOKER", "4"]);
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

  it("allows an Ace to extend a run past King (ace-high)", () => {
    const nineToQueen: Meld = {
      id: "run2",
      type: "run",
      ownerId: "p1",
      runStartIndex: 8, // "9"
      cards: makeHand([
        ["9", "diamonds"],
        ["10", "diamonds"],
        ["J", "diamonds"],
        ["Q", "diamonds"],
        ["K", "diamonds"],
      ]),
    };
    expect(canLayOff(makeCard("A", "diamonds"), nineToQueen)).toBe(true);
  });

  it("allows an Ace to extend a run before 2 (ace-low)", () => {
    const twoToFive: Meld = {
      id: "run3",
      type: "run",
      ownerId: "p1",
      runStartIndex: 1, // "2" (wild-filled — natural 2s are always wild)
      cards: [
        makeCard("2", "clubs"),
        ...makeHand([["3", "clubs"], ["4", "clubs"], ["5", "clubs"]]),
      ],
    };
    expect(canLayOff(makeCard("A", "clubs"), twoToFive)).toBe(true);
  });

  it("rejects an Ace that doesn't reach either end of the run", () => {
    const fiveToEight: Meld = {
      id: "run4",
      type: "run",
      ownerId: "p1",
      runStartIndex: 4, // "5"
      cards: makeHand([
        ["5", "spades"],
        ["6", "spades"],
        ["7", "spades"],
        ["8", "spades"],
      ]),
    };
    expect(canLayOff(makeCard("A", "spades"), fiveToEight)).toBe(false);
  });
});

describe("layOffOptions", () => {
  it("gives a wild both ends when a run has room on both sides — genuinely ambiguous", () => {
    const midRun: Meld = {
      id: "run5",
      type: "run",
      ownerId: "p1",
      runStartIndex: 4, // "5"
      cards: makeHand([
        ["5", "diamonds"],
        ["6", "diamonds"],
        ["7", "diamonds"],
        ["8", "diamonds"],
      ]),
    };
    expect(layOffOptions(makeCard("2", "diamonds"), midRun)).toEqual(["low", "high"]);
  });

  it("gives a natural card exactly one option — never ambiguous", () => {
    const midRun: Meld = {
      id: "run6",
      type: "run",
      ownerId: "p1",
      runStartIndex: 4, // "5"
      cards: makeHand([
        ["5", "diamonds"],
        ["6", "diamonds"],
        ["7", "diamonds"],
        ["8", "diamonds"],
      ]),
    };
    expect(layOffOptions(makeCard("4", "diamonds"), midRun)).toEqual(["low"]);
    expect(layOffOptions(makeCard("9", "diamonds"), midRun)).toEqual(["high"]);
  });

  it("only offers the open end when a run already touches a boundary", () => {
    const atLowBoundary: Meld = {
      id: "run7",
      type: "run",
      ownerId: "p1",
      runStartIndex: 0, // "A" (low)
      cards: makeHand([
        ["A", "diamonds"],
        ["2", "diamonds"], // wild filling the "2" slot
        ["3", "diamonds"],
        ["4", "diamonds"],
      ]),
    };
    expect(layOffOptions(makeCard("2", "clubs"), atLowBoundary)).toEqual(["high"]);
  });

  it("offers a natural 2 exactly one option when it fits its own '2' slot and only that end is open", () => {
    // Spans "3" through the high Ace (indices 2-13) — the high end already
    // touches the boundary, so only "low" is open, and a same-suit natural
    // 2 fits there via its own rank (index 1), not just generic wildness.
    const run: Meld = {
      id: "run8",
      type: "run",
      ownerId: "p1",
      runStartIndex: 2,
      cards: [
        ...makeHand([
          ["3", "diamonds"],
          ["4", "diamonds"],
          ["5", "diamonds"],
          ["6", "diamonds"],
          ["7", "diamonds"],
          ["8", "diamonds"],
          ["9", "diamonds"],
          ["10", "diamonds"],
          ["J", "diamonds"],
          ["Q", "diamonds"],
          ["K", "diamonds"],
        ]),
        makeCard("A", "diamonds"),
      ],
    };
    expect(layOffOptions(makeCard("2", "diamonds"), run)).toEqual(["low"]);
  });

  it("offers a 2 both ends when it could fit its own '2' slot on one end and only as a generic wild on the other", () => {
    const run: Meld = {
      id: "run9",
      type: "run",
      ownerId: "p1",
      runStartIndex: 2, // "3"
      cards: makeHand([
        ["3", "diamonds"],
        ["4", "diamonds"],
        ["5", "diamonds"],
        ["6", "diamonds"],
      ]),
    };
    // Low end ("2") matches the incoming card's own rank; high end ("7")
    // only works because a 2 can also serve as a generic wild there.
    expect(layOffOptions(makeCard("2", "diamonds"), run)).toEqual(["low", "high"]);
  });

  it("refuses to lay a wild onto an end already occupied by a wild — no two wilds in a row", () => {
    const run: Meld = {
      id: "run10",
      type: "run",
      ownerId: "p1",
      runStartIndex: 4, // "5"
      cards: [
        ...makeHand([
          ["5", "diamonds"],
          ["6", "diamonds"],
          ["7", "diamonds"],
        ]),
        makeCard("JOKER", "joker"), // wild, filling the "8" slot
      ],
    };
    // Low end ("4") is open and touches a natural card — fine. High end
    // ("9") is open too, but the card already there (the Joker) is itself
    // wild, so stacking another wild on top of it would make two in a row.
    expect(layOffOptions(makeCard("JOKER", "joker"), run)).toEqual(["low"]);
  });

  it("still allows a wild next to a 2 that's sitting in its own natural '2' slot", () => {
    const run: Meld = {
      id: "run11",
      type: "run",
      ownerId: "p1",
      runStartIndex: 1, // "2" — the low end is this 2's own natural slot, not a stand-in
      cards: [
        makeCard("2", "diamonds"),
        makeCard("3", "diamonds"),
        makeCard("4", "diamonds"),
        makeCard("5", "diamonds"),
      ],
    };
    // The "2" is a natural card here, not an acting wild, so a wild is
    // still free to extend past it into the "A" slot — this rule only ever
    // blocks wild next to wild, never wild next to a natural (even a
    // dual-purpose one).
    expect(layOffOptions(makeCard("JOKER", "joker"), run)).toEqual(["low", "high"]);
  });
});

describe("solveWholeHandContract", () => {
  const ROUND_7 = CONTRACTS[6]; // 3 runs, wholeHandMeld: true

  it("solves when the hand splits exactly into 3 minimum-length runs", () => {
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    const melds = solveWholeHandContract(hand, ROUND_7, "p1");
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(3);
    expect(melds!.every((m) => m.type === "run" && m.cards.length === 4)).toBe(true);
    expect(new Set(melds!.flatMap((m) => m.cards.map((c) => c.id))).size).toBe(hand.length);
  });

  it("returns null when a leftover card can't join any of the 3 runs", () => {
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
      makeCard("K", "diamonds"),
    ];
    expect(solveWholeHandContract(hand, ROUND_7, "p1")).toBeNull();
  });

  it("pads a run beyond the minimum length to absorb an otherwise-unplaceable wild", () => {
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"]]), // one short of runSize
      makeCard("JOKER", "joker"),
    ];
    const melds = solveWholeHandContract(hand, ROUND_7, "p1");
    expect(melds).not.toBeNull();
    const spadesRun = melds!.find((m) => m.cards.some((c) => c.suit === "spades"));
    expect(spadesRun!.cards).toHaveLength(4);
    expect(new Set(melds!.flatMap((m) => m.cards.map((c) => c.id))).size).toBe(hand.length);
  });

  it("uses a wild to bridge a genuine gap inside a run", () => {
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["7", "hearts"]]), // missing 6♥
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
      makeCard("2", "diamonds"), // wild
    ];
    const melds = solveWholeHandContract(hand, ROUND_7, "p1");
    expect(melds).not.toBeNull();
    const heartsRun = melds!.find((m) => m.cards.some((c) => c.suit === "hearts"))!;
    expect(heartsRun.cards).toHaveLength(4);
    expect(heartsRun.cards.map((c, i) => (c.isWild ? runCardRank(heartsRun, i) : c.rank))).toEqual([
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(heartsRun.cards.some((c) => c.isWild)).toBe(true);
  });

  it("branches over ace-low and ace-high independently per suit", () => {
    const hand = [
      ...makeHand([["A", "hearts"], ["3", "hearts"], ["4", "hearts"], ["5", "hearts"]]), // A low, wild fills "2"
      ...makeHand([["10", "clubs"], ["J", "clubs"], ["Q", "clubs"], ["K", "clubs"], ["A", "clubs"]]), // A high
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
      makeCard("JOKER", "joker"),
    ];
    const melds = solveWholeHandContract(hand, ROUND_7, "p1");
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(3);
    const heartsRun = melds!.find((m) => m.cards.some((c) => c.suit === "hearts"))!;
    expect(heartsRun.cards.map((c) => c.rank)).toEqual(["A", "JOKER", "3", "4", "5"]);
    expect(heartsRun.cards[1].isWild).toBe(true);
    const clubsRun = melds!.find((m) => m.cards.some((c) => c.suit === "clubs"))!;
    expect(clubsRun.cards.map((c) => c.rank)).toEqual(["10", "J", "Q", "K", "A"]);
  });

  it("returns null when a duplicate same-suit, same-rank card can't share one run", () => {
    const hand = [
      ...makeHand([
        ["4", "hearts"],
        ["5", "hearts"],
        ["6", "hearts"],
        ["7", "hearts"],
        ["7", "hearts"], // duplicate — from a second deck
      ]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    expect(solveWholeHandContract(hand, ROUND_7, "p1")).toBeNull();
  });

  it("returns null when there aren't enough wilds to bridge a genuine gap", () => {
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["7", "hearts"]]), // missing 6♥, no wild available
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    expect(solveWholeHandContract(hand, ROUND_7, "p1")).toBeNull();
  });

  it("returns null when there are more wilds than any arrangement of 3 runs can absorb", () => {
    const hand = [
      ...makeHand([["5", "hearts"], ["6", "hearts"], ["7", "hearts"], ["8", "hearts"]]),
      ...makeHand([["5", "clubs"], ["6", "clubs"], ["7", "clubs"], ["8", "clubs"]]),
      ...makeHand([["5", "spades"], ["6", "spades"], ["7", "spades"], ["8", "spades"]]),
      ...Array.from({ length: 7 }, () => makeCard("JOKER", "joker")),
    ];
    expect(solveWholeHandContract(hand, ROUND_7, "p1")).toBeNull();
  });

  it("returns null for a contract that also needs books (not implemented)", () => {
    const mixedRequirement = { ...ROUND_7, books: 1, runs: 3 };
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
      ...makeHand([["9", "hearts"], ["9", "clubs"], ["9", "spades"]]),
    ];
    expect(solveWholeHandContract(hand, mixedRequirement, "p1")).toBeNull();
  });

  it("uses a natural 2 to complete a run's own suit chain, no wild spent", () => {
    const hand = [
      ...makeHand([
        ["A", "hearts"],
        ["2", "hearts"],
        ["3", "hearts"],
        ["4", "hearts"],
        ["5", "hearts"],
      ]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    const melds = solveWholeHandContract(hand, ROUND_7, "p1");
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(3);
    const heartsRun = melds!.find((m) => m.cards.some((c) => c.suit === "hearts"))!;
    expect(heartsRun.cards.map((c) => c.rank)).toEqual(["A", "2", "3", "4", "5"]);
    expect(new Set(melds!.flatMap((m) => m.cards.map((c) => c.id))).size).toBe(hand.length);
  });

  it("still treats a 2 as pure wild when its suit has no other naturals to anchor a chain", () => {
    // A lone natural 2 with nothing else in its suit can never reach runSize
    // on its own — claiming it anyway would invent an unsatisfiable phantom
    // 4th chain instead of correctly using it to bridge hearts' gap.
    const hand = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["7", "hearts"]]), // missing 6♥
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
      makeCard("2", "diamonds"), // wild — no other diamonds in hand
    ];
    const melds = solveWholeHandContract(hand, ROUND_7, "p1");
    expect(melds).not.toBeNull();
    expect(melds).toHaveLength(3);
    const heartsRun = melds!.find((m) => m.cards.some((c) => c.suit === "hearts"))!;
    expect(heartsRun.cards.map((c, i) => (c.isWild ? runCardRank(heartsRun, i) : c.rank))).toEqual([
      "4",
      "5",
      "6",
      "7",
    ]);
    // The diamond 2 filled the gap as a wild, not as its own suit's natural.
    expect(heartsRun.cards.some((c) => c.suit === "diamonds")).toBe(true);
  });
});
