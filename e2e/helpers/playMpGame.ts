// Drives a real multiplayer game to completion via direct calls to the
// live `mp` Edge Function — no browser involved.
//
// The `mp` function genuinely requires at least one other real human
// friend to create a game (handleCreate: "invite at least one friend" —
// this is a server-side rule, not just a UI-only gate on the New
// Game/Tournament forms), so a solo-vs-AI shortcut isn't actually
// available here. Every human seat needs its own signed-in client, keyed
// by seat number (0 is always the game's creator — see handleCreate's own
// seat assignment); AI seats need no entry at all — applyCommit's
// advanceThroughAi (src/mp/adapter.ts) resolves every AI turn inline,
// synchronously, within the same HTTP call, only ever stopping at the next
// *active human* turn or gameOver. Each move response reports whose turn
// it is next (view.currentSeat), so this just keeps dispatching to
// whichever client owns that seat until the game reports complete.
//
// The move logic reuses the real engine (solveContract/solveWholeHandContract,
// the exact same solver GameContext.tsx's Hint button and the AI both call)
// to meld a seat's own contract the instant it's possible each round, then
// discards whatever's left. It never lays off onto other melds — going out
// via melding alone is entirely sufficient to finish a round in a bounded
// number of turns, and skipping lay-off logic keeps this helper's own
// decision-making simple enough to trust at a glance. This is deliberately
// not "smart" play — it only has to be *legal*, since the point is
// reaching a completed game state fast, not winning it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { solveContract, solveWholeHandContract } from "@/meld";
import { Card, ContractRequirement } from "@/types";
import { submitMpMove, type MpMoveResponse } from "../../app/lib/mpStore";

// A full 7-round game between weak players is at most a few dozen turns
// per seat (see adapter.ts's own ADVANCE_GUARD, which bounds the *AI*
// side of this same loop far more generously); this is a safety net
// against a genuine bug turning this into an infinite loop, not a bound
// expected to ever actually bind.
const MAX_TURNS = 300;

function decideMeld(hand: Card[], contract: ContractRequirement): { groups: string[][]; runStarts: (number | undefined)[] } | null {
  const melds = contract.wholeHandMeld
    ? solveWholeHandContract(hand, contract, "me")
    : solveContract(hand, contract, "me");
  if (!melds) return null;
  return {
    groups: melds.map((m) => m.cards.map((c) => c.id)),
    runStarts: melds.map((m) => m.runStartIndex),
  };
}

async function playOneTurn(client: SupabaseClient, gameId: string): Promise<MpMoveResponse> {
  const drawRes = await submitMpMove(client, gameId, { type: "draw", from: "stock" });
  if (drawRes.status === "complete") return drawRes;

  const { view } = drawRes;
  if (view.yourSeat == null) throw new Error("autoCompleteMpGame: not a seated player in this game");
  const me = view.players[view.yourSeat];
  const hand = view.yourHand;

  // ContractRequirement also carries `round`/`label`, neither of which
  // solveContract/solveWholeHandContract actually reads — only the shape
  // fields below matter functionally, so a placeholder round/label is
  // exactly as good as the real ones here.
  const contract: ContractRequirement = { ...view.contract, round: view.round, label: view.roundLabel };
  const meld = me.hasMeldedContract ? null : decideMeld(hand, contract);
  const meldedIds = new Set(meld ? meld.groups.flat() : []);
  const leftover = hand.filter((c) => !meldedIds.has(c.id));

  // Prefer discarding a non-wild card — no strategic reason beyond not
  // needlessly burning a 2/Joker this helper will never get the chance to
  // use for anything smarter.
  const discardCard = leftover.length > 0 ? (leftover.find((c) => !c.isWild) ?? leftover[0]) : null;

  return submitMpMove(client, gameId, {
    type: "commit",
    groups: meld?.groups,
    preferredRunStarts: meld?.runStarts,
    discardCardId: discardCard?.id,
  });
}

/**
 * Plays a real multiplayer game to completion. `seatClients` maps each
 * *human* seat number to a signed-in client for that account (AI seats need
 * no entry — see this file's own doc). Seat 0 — the game's creator — always
 * moves first. Throws if MAX_TURNS is exceeded (a real bug: a seat with no
 * registered client, or something in the move logic above rejecting every
 * turn) rather than hanging a test run.
 */
export async function autoCompleteMpGame(seatClients: Record<number, SupabaseClient>, gameId: string): Promise<void> {
  let currentSeat = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const client = seatClients[currentSeat];
    if (!client) throw new Error(`autoCompleteMpGame: no client registered for seat ${currentSeat}`);
    const res = await playOneTurn(client, gameId);
    if (res.status === "complete") return;
    currentSeat = res.view.currentSeat;
  }
  throw new Error(`autoCompleteMpGame: exceeded ${MAX_TURNS} turns without completing.`);
}
