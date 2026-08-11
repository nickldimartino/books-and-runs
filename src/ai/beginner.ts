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
