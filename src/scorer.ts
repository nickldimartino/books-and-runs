// Hand scoring. At the end of a round every player who didn't go out adds
// the penalty value of the cards still in their hand to their cumulative
// score, and (Contract Rummy being a low-score-wins game) the lowest total
// after the last round wins. Penalty values are the traditional ones:
// jokers 50, wild 2s 20, aces 15, faces and 10s 10, everything else 5.

import { Card } from "./types";

/** Penalty value of a single card left in hand at round end. */
export function cardPenalty(card: Card): number {
  if (card.rank === "JOKER") return 50;
  if (card.rank === "2") return 20; // wild
  if (card.rank === "A") return 15;
  if (card.rank === "10" || card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return 5; // 3-9
}

/** Total penalty of a whole hand — what a non-going-out player scores. */
export function handPenalty(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + cardPenalty(c), 0);
}
