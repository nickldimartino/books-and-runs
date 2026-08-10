import { Card, GameState, Player } from "../types";
import { AIStrategy } from "./strategy";

export const beginnerStrategy: AIStrategy = {
  wantsDiscardPileDraw() {
    return Math.random() < 0.5; // no real preference
  },
  chooseDiscard(_state: GameState, player: Player): Card {
    const nonWild = player.hand.filter((c) => !c.isWild);
    const pool = nonWild.length > 0 ? nonWild : player.hand;
    return pool[Math.floor(Math.random() * pool.length)];
  },
  // Beginner doesn't proactively lay off cards, even when it could —
  // part of what makes it feel genuinely novice rather than just unlucky.
  planLayOffs() {
    return [];
  },
};
