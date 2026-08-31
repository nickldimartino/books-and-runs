import { Card, Rank, Suit } from "./types";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * At least 2 decks, scaling up roughly one deck per 2 players. A single
 * deck only has 4 copies of any given rank — fine once 3+ players are
 * splitting 2+ decks between them, but a real 2-player game running on
 * just 1 deck can exhaust a specific rank's cards entirely across both
 * hands, the draw pile, and the discard pile, deadlocking a round neither
 * player can ever finish.
 */
export function decksForPlayerCount(playerCount: number): number {
  return Math.max(2, Math.ceil(playerCount / 2));
}

/**
 * One standard 52-card deck per numDecks, plus jokers, all shuffled
 * together — see decksForPlayerCount for how numDecks is chosen. `rng`
 * defaults to Math.random for every normal game; Daily Deal (see
 * dailyDealStore.ts) is the one caller that passes a seeded one instead, so
 * the same calendar date always deals the same shuffle.
 */
export function buildDeck(numDecks: number, rng: () => number = Math.random): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `${suit[0]}-${rank}-${d}`,
          suit,
          rank,
          isWild: rank === "2",
        });
      }
    }
    // 2 jokers per deck, standard for this variant
    cards.push({ id: `joker-a-${d}`, suit: "joker", rank: "JOKER", isWild: true });
    cards.push({ id: `joker-b-${d}`, suit: "joker", rank: "JOKER", isWild: true });
  }
  return shuffle(cards, rng);
}

export function shuffle<T>(input: T[], rng: () => number = Math.random): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * A small, fast, deterministic PRNG (mulberry32) — Math.random can't be
 * seeded at all, which is the one property Daily Deal actually needs: the
 * same date must always produce the same shuffle, for every player, every
 * time they load it. Not cryptographic, and doesn't need to be — this is
 * shuffling a card game, not securing anything.
 */
export function seededRng(seed: number): () => number {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function deal(deck: Card[], playerCount: number, handSize = 13) {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let cursor = 0;
  for (let i = 0; i < handSize; i++) {
    for (let p = 0; p < playerCount; p++) {
      hands[p].push(deck[cursor]);
      cursor++;
    }
  }
  const remaining = deck.slice(cursor);
  const discardPile = [remaining.pop()!];
  return { hands, drawPile: remaining, discardPile };
}
