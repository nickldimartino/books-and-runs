// Achievement-counter deltas for one action — draw, meld, lay off, or
// discard — as a pure function of that action's inputs and the engine's own
// return value. Extracted from GameContext.tsx's inline bump() calls so the
// exact same rule that credits a counter during live play can also derive
// it from a server-side replay (the planned solo-verify Edge Function),
// rather than maintaining two copies of "what counts" that could drift.
//
// Each function returns only the counters that specific action touched;
// callers merge/sum these into a running totals object (see mergeDeltas).
// None of this decides *whether* the acting player is the tracked account
// (YOU_PLAYER_ID) — callers gate on that themselves, same as the bump()
// call sites this was extracted from.

import { Card, ContractRequirement, Meld } from "./types";

export type CounterDeltas = Record<string, number>;

export function mergeDeltas(into: CounterDeltas, from: CounterDeltas): CounterDeltas {
  for (const [key, amount] of Object.entries(from)) {
    into[key] = (into[key] ?? 0) + amount;
  }
  return into;
}

/** A fresh game's table composition — credited once, at start, from the
 * initial seat config alone (never changes over the life of the game). */
export function tableCompositionDeltas(configs: { isAI: boolean }[]): CounterDeltas {
  const deltas: CounterDeltas = {};
  const humanCount = configs.filter((c) => !c.isAI).length;
  if (humanCount >= 2) deltas.pass_and_play_games = 1;
  if (humanCount === 1) deltas.solo_vs_ai_games = 1;
  if (configs.length >= 6) deltas.large_table_games = 1;
  return deltas;
}

/** Only called for an actual draw (drawFromPile/drawFromDiscard returned a
 * card) — a null draw (piles exhausted, round auto-ended) has nothing to
 * credit. */
export function drawDeltas(card: Card, actuallyFromDiscard: boolean): CounterDeltas {
  const deltas: CounterDeltas = {
    turns_taken: 1,
    [actuallyFromDiscard ? "cards_drawn_from_discard" : "cards_drawn_blind"]: 1,
  };
  if (card.isWild) deltas.wilds_drawn = 1;
  if (card.rank === "JOKER") deltas.jokers_drawn = 1;
  return deltas;
}

/** Only called for a successful meld (meldChosenGroups/attemptMeldContract
 * returned the melds laid, not null). Covers just the meld-shape counters
 * — a resulting round win is a separate, shared concern (see
 * roundWonDeltas), since both melding out and laying off can trigger it. */
export function meldDeltas(melds: Meld[], contract: ContractRequirement): CounterDeltas {
  const deltas: CounterDeltas = { [`completed_round_${contract.round}`]: 1 };
  for (const m of melds) {
    const wildCount = m.cards.filter((c) => c.isWild).length;
    if (m.type === "book") {
      deltas.books_melded = (deltas.books_melded ?? 0) + 1;
      if (m.cards.length > contract.bookSize) {
        deltas.oversized_books_melded = (deltas.oversized_books_melded ?? 0) + 1;
      }
    } else {
      deltas.runs_melded = (deltas.runs_melded ?? 0) + 1;
      if (m.cards.length > contract.runSize) {
        deltas.oversized_runs_melded = (deltas.oversized_runs_melded ?? 0) + 1;
      }
    }
    if (wildCount > 0) {
      deltas.wilds_used_in_melds = (deltas.wilds_used_in_melds ?? 0) + wildCount;
    } else {
      deltas.melds_with_zero_wilds = (deltas.melds_with_zero_wilds ?? 0) + 1;
    }
  }
  return deltas;
}

/** Only called for a successful lay-off (layOffCard returned true). `card`
 * and `meld` are the pre-mutation card/meld the lay-off targeted (the same
 * lookups the caller already did to call layOffCard itself).
 * `wasAmbiguous` mirrors the caller's own pre-call check (layOffOptions
 * returning both directions) — kept as a caller-supplied flag rather than
 * recomputed here since it depends on the meld's state *before* the lay-off
 * landed. */
export function layOffDeltas(card: Card, meld: Meld, actingPlayerId: string, wasAmbiguous: boolean): CounterDeltas {
  const deltas: CounterDeltas = { cards_laid_off: 1 };
  if (card.isWild) deltas.wilds_laid_off = 1;
  if (meld.ownerId !== actingPlayerId) deltas.laid_off_onto_opponent = 1;
  if (wasAmbiguous) deltas.ambiguous_wild_choices_made = 1;
  return deltas;
}

/** Shared by both ways a round can end in the acting player's favor: melding
 * out (no discard, the final wholeHandMeld round) or a normal discard-to-
 * empty. `viaDiscard` picks which of the two mutually exclusive "how they
 * won" counters applies; `rounds_won` itself always applies to either. */
export function roundWonDeltas(contract: ContractRequirement, viaDiscard: boolean): CounterDeltas {
  return {
    rounds_won: 1,
    [viaDiscard ? "rounds_won_via_discard" : contract.wholeHandMeld ? "rounds_won_final_round" : "rounds_won_no_discard"]: 1,
  };
}

/** Only called for a real discard (a card was actually found and removed,
 * or the round-7 empty-hand auto-out — see GameContext.tsx's discard()). */
export function discardDeltas(): CounterDeltas {
  return { cards_discarded: 1 };
}

/** Credited once at game-over from the final state alone, not a move-log
 * entry — a flat "finished with no penalty at all" bonus. */
export function finalGameDeltas(youFinalScore: number): CounterDeltas {
  return youFinalScore === 0 ? { zero_penalty_games: 1 } : {};
}
