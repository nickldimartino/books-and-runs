import { describe, expect, it } from "vitest";
import { cardPenalty, handPenalty } from "./scorer";
import { makeCard, makeHand } from "./testHelpers";

describe("cardPenalty", () => {
  it("scores number cards (3-9) at 5 points", () => {
    for (const rank of ["3", "4", "5", "6", "7", "8", "9"] as const) {
      expect(cardPenalty(makeCard(rank))).toBe(5);
    }
  });

  it("scores 10 and face cards (J, Q, K) at 10 points", () => {
    for (const rank of ["10", "J", "Q", "K"] as const) {
      expect(cardPenalty(makeCard(rank))).toBe(10);
    }
  });

  it("scores aces at 15 points", () => {
    expect(cardPenalty(makeCard("A"))).toBe(15);
  });

  it("scores wild 2s at 20 points", () => {
    expect(cardPenalty(makeCard("2"))).toBe(20);
  });

  it("scores jokers at 50 points", () => {
    expect(cardPenalty(makeCard("JOKER", "joker"))).toBe(50);
  });
});

describe("handPenalty", () => {
  it("sums penalty values across the whole hand", () => {
    const hand = makeHand(["A", "K", "5", "2", ["JOKER", "joker"]]);
    // 15 + 10 + 5 + 20 + 50
    expect(handPenalty(hand)).toBe(100);
  });

  it("returns 0 for an empty hand", () => {
    expect(handPenalty([])).toBe(0);
  });
});
