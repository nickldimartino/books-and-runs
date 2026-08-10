import { attemptMeldContract, discardAndAdvance, drawFromDiscard, drawFromPile, layOffCard } from "../gameEngine";
import { Difficulty, GameState } from "../types";
import { beginnerStrategy } from "./beginner";
import { easyStrategy } from "./easy";
import { expertStrategy } from "./expert";
import { hardStrategy } from "./hard";
import { mediumStrategy } from "./medium";
import { AIStrategy } from "./strategy";

const STRATEGIES: Record<Difficulty, AIStrategy> = {
  beginner: beginnerStrategy,
  easy: easyStrategy,
  medium: mediumStrategy,
  hard: hardStrategy,
  expert: expertStrategy,
};

/** Plays one full AI turn: draw, meld if possible, lay off, discard. Mutates state. */
export function playAITurn(state: GameState): void {
  const player = state.players[state.currentPlayerIndex];
  const strategy = STRATEGIES[player.difficulty ?? "medium"];

  const wantsDiscard = state.discardPile.length > 0 && strategy.wantsDiscardPileDraw(state, player);
  if (wantsDiscard) {
    const got = drawFromDiscard(state);
    if (!got) drawFromPile(state);
  } else {
    drawFromPile(state);
  }

  attemptMeldContract(state); // always attempt; melding is essentially always beneficial here

  if (player.hasMeldedContract) {
    const layOffs = strategy.planLayOffs(state, player);
    for (const move of layOffs) {
      layOffCard(state, move.cardId, move.meldId);
    }
  }

  // Round 7 auto-out: if hand is empty after melding, discardAndAdvance handles it with no discard
  if (player.hand.length === 0) {
    discardAndAdvance(state, ""); // cardId unused in the no-discard branch
    return;
  }

  const discard = strategy.chooseDiscard(state, player);
  discardAndAdvance(state, discard.id);
}
