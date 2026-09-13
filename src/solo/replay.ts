// Independently replays a finished solo/pass-and-play game from nothing but
// its starting seed and move log — the server-side half of "record what
// happened locally, then verify the whole game once it's over" (see the
// solo-verify Edge Function this is bundled into). Pure and unit-tested,
// same split as src/mp/adapter.ts: this file has no Deno/Supabase
// dependency at all, so it runs identically here (vitest) and there.
//
// Every step folds one src/moveLog.ts entry through the exact same
// gameEngine.ts functions a human's or AI's real turn already called —
// drawFromPile/drawFromDiscard, attemptMeldContract/meldChosenGroups,
// layOffCard, discardAndAdvance — the same functions gameEngine.ts's own
// doc says "callers (including the multiplayer server) are never trusted
// to have checked a move themselves" about. The instant one entry comes
// back illegal, replay stops and the whole submission is rejected: nothing
// about a game's outcome is ever taken on the client's word, only on
// whether every logged move actually held up when it was actually tried.

import {
  attemptMeldContract,
  createGame,
  discardAndAdvance,
  drawFromDiscard,
  drawFromPile,
  layOffCard,
  meldChosenGroups,
  PlayerConfig,
  startNextRound,
} from "../gameEngine";
import { roundSeed, seededRng } from "../deck";
import { layOffOptions } from "../meld";
import { MoveLogEntry } from "../moveLog";
import {
  CounterDeltas,
  discardDeltas,
  drawDeltas,
  layOffDeltas,
  meldDeltas,
  mergeDeltas,
  roundWonDeltas,
} from "../replayStats";
import { ContractRequirement, GameState, YOU_PLAYER_ID } from "../types";

export type ReplayResult =
  | { ok: true; state: GameState; counterDeltas: CounterDeltas }
  | { ok: false; error: string };

/** Advances past every round already over when this is called, and after
 * every folded move — a round boundary needs no log entry of its own (see
 * moveLog.ts), so this is what actually deals the next round when one
 * ends, exactly like GameContext.tsx's own advanceRound does live. */
function advancePastFinishedRounds(state: GameState, seed: number): GameState {
  let s = state;
  while (s.roundOver && !s.gameOver) {
    s = startNextRound(s, seededRng(roundSeed(seed, s.round + 1)));
  }
  return s;
}

export function replaySoloGame(
  seed: number,
  seats: PlayerConfig[],
  selectedContracts: ContractRequirement[],
  moveLog: MoveLogEntry[]
): ReplayResult {
  if (!Number.isFinite(seed)) return { ok: false, error: "invalid seed" };
  if (!Array.isArray(seats) || seats.length < 2 || seats.length > 8) {
    return { ok: false, error: "invalid seat count" };
  }
  if (!Array.isArray(selectedContracts) || selectedContracts.length === 0) {
    return { ok: false, error: "invalid contract sequence" };
  }
  if (!Array.isArray(moveLog)) return { ok: false, error: "invalid move log" };

  let state: GameState;
  try {
    state = advancePastFinishedRounds(
      createGame(seats, selectedContracts, seededRng(roundSeed(seed, 1))),
      seed
    );
  } catch {
    return { ok: false, error: "couldn't deal the game from its seed" };
  }

  // Mirrors src/mp/adapter.ts's MpEngine.turnDrawn — the raw gameEngine.ts
  // functions don't enforce "drew exactly once before melding/discarding"
  // themselves (every real caller, GameContext.tsx and the MP adapter
  // alike, enforces it one layer up), so a replay has to enforce it too or
  // a fabricated log could draw an unbounded number of cards in one "turn".
  let turnDrawn = false;

  // Credited only for whichever seat is the actual tracked account — same
  // isYou gating every replayStats.ts call site already uses live in
  // GameContext.tsx. Other seats (AI, or another pass-and-play human) never
  // earn anything here, same as today.
  const counterDeltas: CounterDeltas = {};

  for (const entry of moveLog) {
    if (state.gameOver) return { ok: false, error: "moves logged after the game already ended" };
    if (entry.seat !== state.currentPlayerIndex) {
      return { ok: false, error: "a logged move's seat doesn't match whose turn it actually was" };
    }
    const isYou = state.players[entry.seat]?.id === YOU_PLAYER_ID;
    const contract = selectedContracts[state.round - 1];

    switch (entry.type) {
      case "draw": {
        if (turnDrawn) return { ok: false, error: "drew more than once in a single turn" };
        const card = entry.fromDiscard ? drawFromDiscard(state) ?? drawFromPile(state) : drawFromPile(state);
        // A null card (piles truly exhausted) ends the round itself, with
        // nothing to credit — turnDrawn still flips true below since it
        // gets reset for the next round regardless (see roundBefore check).
        if (card && isYou) mergeDeltas(counterDeltas, drawDeltas(card, entry.fromDiscard));
        turnDrawn = true;
        break;
      }
      case "meldContract": {
        if (!turnDrawn) return { ok: false, error: "melded before drawing" };
        const melds = attemptMeldContract(state);
        if (!melds) return { ok: false, error: "an AI meld attempt didn't hold up on replay" };
        if (isYou) mergeDeltas(counterDeltas, meldDeltas(melds, contract));
        break;
      }
      case "meldGroups": {
        if (!turnDrawn) return { ok: false, error: "melded before drawing" };
        const melds = meldChosenGroups(state, entry.groups, entry.preferredRunStarts);
        if (!melds) return { ok: false, error: "a meld didn't hold up on replay" };
        if (isYou) mergeDeltas(counterDeltas, meldDeltas(melds, contract));
        break;
      }
      case "layOff": {
        if (!turnDrawn) return { ok: false, error: "laid off before drawing" };
        const player = state.players[state.currentPlayerIndex];
        const card = player.hand.find((c) => c.id === entry.cardId);
        const meld = state.melds.find((m) => m.id === entry.meldId);
        const wasAmbiguous = !!(card && meld && layOffOptions(card, meld).length === 2);
        if (!layOffCard(state, entry.cardId, entry.meldId, entry.position)) {
          return { ok: false, error: "a lay-off didn't hold up on replay" };
        }
        if (isYou && card && meld) {
          mergeDeltas(counterDeltas, layOffDeltas(card, meld, player.id, wasAmbiguous));
        }
        break;
      }
      case "discard": {
        if (!turnDrawn) return { ok: false, error: "discarded before drawing" };
        const seatBefore = state.currentPlayerIndex;
        const ended = discardAndAdvance(state, entry.cardId ?? "");
        if (!ended && state.currentPlayerIndex === seatBefore) {
          return { ok: false, error: "a discard didn't hold up on replay" };
        }
        if (isYou) {
          mergeDeltas(counterDeltas, discardDeltas());
          // A real (non-null) discarded card that ended the round is a win
          // "via discard"; cardId: null only ever comes from a no-discard
          // auto-out (finishIfWentOut / playAITurn's round-7 path) — see
          // moveLog.ts. Matches the exact viaDiscard GameContext.tsx itself
          // passes at each of those call sites.
          if (ended) mergeDeltas(counterDeltas, roundWonDeltas(contract, entry.cardId !== null));
        }
        turnDrawn = false;
        break;
      }
      default:
        return { ok: false, error: "unknown move type in the log" };
    }

    // Whether or not the round just changed underneath this move (a
    // discard, or a null draw off an exhausted pile, or the deadlock
    // backstop can all end a round without every path resetting turnDrawn
    // itself above) — the new round's first player hasn't drawn yet.
    const roundBefore = state.round;
    state = advancePastFinishedRounds(state, seed);
    if (state.round !== roundBefore) turnDrawn = false;
  }

  if (!state.gameOver) return { ok: false, error: "the move log doesn't reach a finished game" };
  return { ok: true, state, counterDeltas };
}
