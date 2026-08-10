import { Card, Rank, Suit } from "./types";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * One standard 52-card deck per 2 players, plus jokers, all shuffled together.
 * numDecks should be Math.ceil(playerCount / 2).
 */
export function buildDeck(numDecks: number): Card[] {
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
  return shuffle(cards);
}

export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
