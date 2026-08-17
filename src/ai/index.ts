import { attemptMeldContract, discardAndAdvance, drawFromDiscard, drawFromPile, layOffCard } from "../gameEngine";
import { Difficulty, GameState, Player } from "../types";
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

/**
 * Whether an AI player wants to buy the current top discard (taking it plus
 * a penalty card, out of turn). Reuses the same per-difficulty "is this
 * discard useful to me" judgment the AI already applies to its own normal
 * discard-pile draw decision — buying is a strictly worse deal (it costs an
 * extra penalty card), so declining whenever a normal draw wouldn't want it
 * either is a reasonable bar.
 */
export function aiWantsToBuyDiscard(state: GameState, player: Player): boolean {
  const strategy = STRATEGIES[player.difficulty ?? "medium"];
  return strategy.wantsDiscardPileDraw(state, player);
}

/** Plays one full AI turn: draw, meld if possible, lay off, discard. Mutates state. */
export function playAITurn(state: GameState): void {
  const player = state.players[state.currentPlayerIndex];
  const strategy = STRATEGIES[player.difficulty ?? "medium"];

  const wantsDiscard = state.discardPile.length > 0 && strategy.wantsDiscardPileDraw(state, player);
  let drew = true;
  if (wantsDiscard) {
    const got = drawFromDiscard(state);
    if (!got) drew = drawFromPile(state) !== null;
  } else {
    drew = drawFromPile(state) !== null;
  }
  // A null draw means the pile was truly exhausted and drawFromPile already
  // ended the round itself — nothing left for this turn to do.
  if (!drew) return;

  attemptMeldContract(state); // always attempt; melding is essentially always beneficial here

  if (player.hasMeldedContract) {
    const layOffs = strategy.planLayOffs(state, player);
    for (const move of layOffs) {
      layOffCard(state, move.cardId, move.meldId, move.position);
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
