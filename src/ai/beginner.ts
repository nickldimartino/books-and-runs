// Beginner: no judgment at all. Coin-flips on taking the discard, discards a
// uniformly random card from the whole hand (wilds included — a real novice
// doesn't reliably notice a wild's value), and never lays off. Every other
// tier is defined as "this, but with a shrinking chance of a real
// heuristic" — see MISTAKE_CHANCE in strategy.ts.

import { Card, GameState, Player } from "../types";
import { AIStrategy } from "./strategy";

export const beginnerStrategy: AIStrategy = {
  wantsDiscardPileDraw() {
    return Math.random() < 0.5; // no real preference
  },
  // Genuinely random across the whole hand, wilds included — a real
  // beginner doesn't reliably recognize a wild card's value and can easily
  // discard one by mistake, unlike every other tier.
  chooseDiscard(_state: GameState, player: Player): Card {
    return player.hand[Math.floor(Math.random() * player.hand.length)];
  },
  // Beginner doesn't proactively lay off cards, even when it could —
  // part of what makes it feel genuinely novice rather than just unlucky.
  planLayOffs() {
    return [];
  },
};
