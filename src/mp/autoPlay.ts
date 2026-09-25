// Server-side "the clock ran out" move for an unresponsive human seat — the
// safe, boring version of a turn: draw from the stock (if not drawn yet),
// then discard the highest-penalty card that isn't wild, so the game keeps
// moving without the AFK seat being handed any strategic advantage. Never
// melds and never lays off. If the hand is already empty after melding, the
// turn ends by going out (exactly what the player would have had to do).
// Pure; built only on the same adapter operations a real move uses, so it
// can't produce a state a player couldn't have.

import { cardPenalty } from "../scorer";
import { applyDiscard, applyDraw } from "./adapter";
import { MpEngine } from "./types";

export function autoPlayTurn(engIn: MpEngine, seat: number): { engine: MpEngine; error?: string } {
  let eng = engIn;
  if (eng.state.gameOver || eng.state.roundOver) return { engine: engIn, error: "the round is over" };
  if (eng.state.currentPlayerIndex !== seat) return { engine: engIn, error: "it isn't your turn" };

  if (!eng.turnDrawn) {
    const drew = applyDraw(eng, seat, "stock");
    if (drew.error) return { engine: engIn, error: drew.error };
    eng = drew.engine;
    // Both piles empty → the round already ended inside applyDraw.
    if (!drew.card) return { engine: eng };
  }

  const player = eng.state.players[seat];
  if (player.hasMeldedContract && player.hand.length === 0) {
    const out = applyDiscard(eng, seat, { type: "discard" });
    return out.error ? { engine: engIn, error: out.error } : { engine: out.engine };
  }

  const pool = player.hand.filter((c) => !c.isWild && c.rank !== "JOKER");
  const choices = pool.length > 0 ? pool : player.hand;
  if (choices.length === 0) return { engine: engIn, error: "choose a card to discard" };
  let worst = choices[0];
  for (const c of choices) if (cardPenalty(c) > cardPenalty(worst)) worst = c;

  const res = applyDiscard(eng, seat, { type: "discard", discardCardId: worst.id });
  return res.error ? { engine: engIn, error: res.error } : { engine: res.engine };
}
