// The AI entry point. playAITurn runs one complete turn through the same
// engine functions a human's UI calls — draw, always attempt the contract,
// lay off, discard — so an AI can never make a move a human couldn't.
//
// Everything difficulty-specific is a strategy object (one per file in this
// folder, all implementing AIStrategy from strategy.ts) that only answers
// three questions: take the discard?, which card to discard?, and which
// lay-offs to make?. STRATEGIES maps a Difficulty to its object; a missing
// difficulty falls back to "medium".

import { attemptMeldContract, discardAndAdvance, drawFromDiscard, drawFromPile, layOffCard } from "../gameEngine";
import { MoveLogEntry } from "../moveLog";
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

/**
 * Plays one full AI turn: draw, meld if possible, lay off, discard. Mutates
 * state. Returns the concrete moves it actually made, in order — not for
 * the caller to act on, but so GameContext.tsx can append them to the
 * game's move log at the same granularity a human's own turn already is
 * (see moveLog.ts). The AI's strategy decisions themselves (which card to
 * discard, whether to take the discard pile, which lay-offs to make) can
 * use randomness and aren't reproducible server-side — but each one, once
 * made, is just another legal move for a replay to verify, same as a
 * human's tap.
 */
export function playAITurn(state: GameState): MoveLogEntry[] {
  const seat = state.currentPlayerIndex;
  const player = state.players[seat];
  const strategy = STRATEGIES[player.difficulty ?? "medium"];
  const entries: MoveLogEntry[] = [];

  const wantsDiscard = state.discardPile.length > 0 && strategy.wantsDiscardPileDraw(state, player);
  let drew = true;
  let fromDiscard = false;
  if (wantsDiscard) {
    const got = drawFromDiscard(state);
    if (got) {
      fromDiscard = true;
    } else {
      drew = drawFromPile(state) !== null;
    }
  } else {
    drew = drawFromPile(state) !== null;
  }
  // Logged even when the draw came back null below — see the identical
  // note in GameContext.tsx's own draw(): a replay needs to know a draw
  // was attempted here at all, since that's what tells it to call the same
  // drawFromPile/drawFromDiscard that (when the piles are truly exhausted)
  // ends the round itself as a side effect, with no further entry to
  // signal it.
  entries.push({ seat, type: "draw", fromDiscard });
  // A null draw means the pile was truly exhausted and drawFromPile already
  // ended the round itself — nothing left for this turn to do.
  if (!drew) return entries;

  // Only a real transition (not-melded -> melded) counts as this turn's
  // move — attemptMeldContract is a no-op if the player already melded
  // their contract on an earlier turn this round (see its own doc).
  const hadMeldedBefore = player.hasMeldedContract;
  attemptMeldContract(state); // always attempt; melding is essentially always beneficial here
  if (!hadMeldedBefore && player.hasMeldedContract) entries.push({ seat, type: "meldContract" });

  if (player.hasMeldedContract) {
    const layOffs = strategy.planLayOffs(state, player);
    for (const move of layOffs) {
      if (layOffCard(state, move.cardId, move.meldId, move.position)) {
        entries.push({ seat, type: "layOff", cardId: move.cardId, meldId: move.meldId, position: move.position });
      }
    }
  }

  // Round 7 auto-out: if hand is empty after melding, discardAndAdvance handles it with no discard
  if (player.hand.length === 0) {
    discardAndAdvance(state, ""); // cardId unused in the no-discard branch
    entries.push({ seat, type: "discard", cardId: null });
    return entries;
  }

  const discard = strategy.chooseDiscard(state, player);
  discardAndAdvance(state, discard.id);
  entries.push({ seat, type: "discard", cardId: discard.id });
  return entries;
}
