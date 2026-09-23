// Beginner: no judgment at all. Coin-flips on taking the discard, discards a
// uniformly random card from the whole hand (wilds included — a real novice
// doesn't reliably notice a wild's value), and never lays off. Every other
// tier is defined as "this, but with a shrinking chance of a real
// heuristic" — see MISTAKE_CHANCE in strategy.ts.

import { Card, GameState, Player } from "../types";
import { AIStrategy, Rng } from "./strategy";

export const beginnerStrategy: AIStrategy = {
  // Threads rng like every other tier does, purely for interface
  // consistency (so a fixed Rng passed here isn't silently ignored the way
  // a bare Math.random() call would be) — Beginner has no mistake chance to
  // gate since it's *always* the mistake, so this never branches on it the
  // way the other tiers' own mistake rolls do.
  wantsDiscardPileDraw(_state: GameState, _player: Player, rng: Rng = Math.random) {
    return rng() < 0.5; // no real preference
  },
  // Genuinely random across the whole hand, wilds included — a real
  // beginner doesn't reliably recognize a wild card's value and can easily
  // discard one by mistake, unlike every other tier.
  chooseDiscard(_state: GameState, player: Player, rng: Rng = Math.random): Card {
    return player.hand[Math.floor(rng() * player.hand.length)];
  },
  // Beginner doesn't proactively lay off cards, even when it could —
  // part of what makes it feel genuinely novice rather than just unlucky.
  planLayOffs() {
    return [];
  },
};
