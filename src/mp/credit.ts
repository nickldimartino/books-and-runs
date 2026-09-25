// Server-side achievement-counter deltas for the split MP actions (meld /
// layoff / discard). Pure so it can be unit-tested; the Edge Function calls
// it with the PRE-move state and the adapter's own result, so every credit is
// derived from what the engine just verified — never from the client's claim.
// (The legacy `commit` action keeps its inline crediting in mp/index.ts.)

import { layOffOptions } from "../meld";
import {
  CounterDeltas,
  discardDeltas,
  layOffDeltas,
  meldDeltas,
  mergeDeltas,
  roundWonDeltas,
} from "../replayStats";
import { GameState, Meld } from "../types";
import { MpAction } from "./types";

export function splitMoveDeltas(
  preState: GameState,
  seat: number,
  action: Extract<MpAction, { type: "meld" | "layoff" | "discard" }>,
  result: { meldedThisAction?: Meld[]; wentOutThisAction?: boolean; discarded?: boolean }
): CounterDeltas {
  const deltas: CounterDeltas = {};
  const contract = preState.selectedContracts[preState.round - 1];
  const actingPlayerId = preState.players[seat]?.id;

  if (action.type === "meld") {
    if (result.meldedThisAction && result.meldedThisAction.length > 0) {
      mergeDeltas(deltas, meldDeltas(result.meldedThisAction, contract));
    }
  } else if (action.type === "layoff") {
    const card = preState.players[seat]?.hand.find((c) => c.id === action.cardId);
    const meld = preState.melds.find((m) => m.id === action.meldId);
    if (card && meld && actingPlayerId) {
      const wasAmbiguous = layOffOptions(card, meld).length === 2;
      mergeDeltas(deltas, layOffDeltas(card, meld, actingPlayerId, wasAmbiguous));
    }
  } else {
    if (result.discarded) mergeDeltas(deltas, discardDeltas());
    if (result.wentOutThisAction) mergeDeltas(deltas, roundWonDeltas(contract, !!result.discarded));
  }
  return deltas;
}
