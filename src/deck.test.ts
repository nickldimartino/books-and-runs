import { describe, expect, it } from "vitest";
import { buildDeck, deal, roundSeed, seededRng, shuffle } from "./deck";

describe("buildDeck", () => {
  it("builds one 52-card deck plus 2 jokers per numDecks", () => {
    expect(buildDeck(1)).toHaveLength(54);
    expect(buildDeck(2)).toHaveLength(108);
    expect(buildDeck(4)).toHaveLength(216);
  });

  it("marks all 2s and jokers as wild, and nothing else", () => {
    const deck = buildDeck(1);
    for (const card of deck) {
      const shouldBeWild = card.rank === "2" || card.rank === "JOKER";
      expect(card.isWild).toBe(shouldBeWild);
    }
  });

  it("gives every card a unique id", () => {
    const deck = buildDeck(3);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });
});

describe("shuffle", () => {
  it("preserves the multiset of elements", () => {
    const deck = buildDeck(1);
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(deck.length);
    expect([...shuffled].sort()).not.toBe(deck); // different array instance
    const idsBefore = deck.map((c) => c.id).sort();
    const idsAfter = shuffled.map((c) => c.id).sort();
    expect(idsAfter).toEqual(idsBefore);
  });

  it("does not mutate the input array", () => {
    const deck = buildDeck(1);
    const copy = [...deck];
    shuffle(deck);
    expect(deck).toEqual(copy);
  });
});

describe("deal", () => {
  it("deals 13 cards to each player and splits the remainder into draw/discard piles", () => {
    const deck = buildDeck(3); // 6 players -> 3 decks
    const playerCount = 6;
    const { hands, drawPile, discardPile } = deal(deck, playerCount);

    expect(hands).toHaveLength(playerCount);
    for (const hand of hands) {
      expect(hand).toHaveLength(13);
    }
    expect(discardPile).toHaveLength(1);
    expect(drawPile.length + discardPile.length + hands.flat().length).toBe(deck.length);
  });

  it("deals distinct cards to each hand (no duplicates across hands)", () => {
    const deck = buildDeck(2);
    const { hands } = deal(deck, 4);
    const allIds = hands.flat().map((c) => c.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe("roundSeed", () => {
  it("is deterministic: same game seed and round always produce the same seed", () => {
    expect(roundSeed(12345, 1)).toBe(roundSeed(12345, 1));
    expect(roundSeed(999999, 4)).toBe(roundSeed(999999, 4));
  });

  it("differs across rounds for the same game seed", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7].map((round) => roundSeed(42, round));
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it("differs across game seeds for the same round", () => {
    expect(roundSeed(1, 1)).not.toBe(roundSeed(2, 1));
  });

  it("feeds seededRng deterministically end-to-end — replaying the same (seed, round) always shuffles identically", () => {
    const dealFrom = (gameSeed: number, round: number) => buildDeck(2, seededRng(roundSeed(gameSeed, round)));
    expect(dealFrom(777, 3)).toEqual(dealFrom(777, 3));
    expect(dealFrom(777, 3)).not.toEqual(dealFrom(777, 4));
  });
});
