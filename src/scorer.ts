import { Card } from "./types";

export function cardPenalty(card: Card): number {
  if (card.rank === "JOKER") return 50;
  if (card.rank === "2") return 20; // wild
  if (card.rank === "A") return 15;
  if (card.rank === "10" || card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return 5; // 3-9
}

export function handPenalty(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + cardPenalty(c), 0);
}
