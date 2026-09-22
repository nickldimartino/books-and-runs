// Drives a real multiplayer game to completion via direct calls to the
// live `mp` Edge Function — no browser involved. This only works for a
// game with exactly one human seat (the rest AI): applyCommit's own
// advanceThroughAi (src/mp/adapter.ts) runs every AI seat's turn inline,
// synchronously, within the same HTTP call, stopping only at the next
// *active human* turn or gameOver — so with a single human seat, that's
// always this same account again, letting one account alone grind an
// entire multi-round game to completion in a bounded, fast loop of plain
// draw/commit calls. A real 2-human game (e2e/multiplayer.spec.ts) can't
// use this — advanceThroughAi would stop at the *other* human's turn,
// which nothing here submits moves for.
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

/**
 * Repeatedly draws and commits as the sole human seat until the game
 * reports `status: "complete"`. Throws if MAX_TURNS is exceeded (a real
 * bug — either this game has more than one human seat, or something in
 * the move logic above is rejecting every turn) rather than hanging a
 * test run.
 */
export async function autoCompleteMpGame(supabase: SupabaseClient, gameId: string): Promise<void> {
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const drawRes: MpMoveResponse = await submitMpMove(supabase, gameId, { type: "draw", from: "stock" });
    if (drawRes.status === "complete") return;

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
    // needlessly burning a 2/Joker this helper will never get the chance
    // to use for anything smarter.
    const discardCard = leftover.length > 0 ? (leftover.find((c) => !c.isWild) ?? leftover[0]) : null;

    const commitRes: MpMoveResponse = await submitMpMove(supabase, gameId, {
      type: "commit",
      groups: meld?.groups,
      preferredRunStarts: meld?.runStarts,
      discardCardId: discardCard?.id,
    });
    if (commitRes.status === "complete") return;
  }
  throw new Error(`autoCompleteMpGame: exceeded ${MAX_TURNS} turns without completing — is this really a solo-vs-AI game?`);
}
