import { playAITurn } from "../ai/index";
import {
  createGame,
  discardAndAdvance,
  drawFromDiscard,
  drawFromPile,
  layOffCard,
  meldChosenGroups,
  startNextRound,
} from "../gameEngine";
import { handPenalty } from "../scorer";
import { Card, CONTRACTS, ContractRequirement, GameState } from "../types";
import { MpAction, MpConfig, MpEngine, RedactedView, RoundResult } from "./types";

/** Flat penalty added to a resigner's score so they always finish last. */
export const RESIGN_PENALTY = 200;

/** Safety bound on the AI/round auto-advance loop. A round is at most a few
 * dozen turns even with weak AI; this is orders of magnitude clear of that. */
const ADVANCE_GUARD = 5000;

function contractsFor(rounds: number[]): ContractRequirement[] {
  return rounds
    .map((r) => CONTRACTS.find((c) => c.round === r))
    .filter((c): c is ContractRequirement => !!c);
}

function seatIsHuman(config: MpConfig, seat: number): boolean {
  return config.seats.some((s) => s.seat === seat && s.kind === "human");
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function snapshotRound(state: GameState): RoundResult {
  const contract = state.selectedContracts[state.round - 1];
  return {
    round: state.round,
    label: contract.label,
    scores: state.players.map((p, i) => ({
      seat: i,
      penalty: handPenalty(p.hand),
      cumulative: p.cumulativeScore,
    })),
  };
}

/** Force-end a game that can't continue (everyone but one human has left).
 * Scores the current round for anyone still holding cards. */
function finalizeGame(state: GameState): void {
  if (state.gameOver) return;
  if (!state.roundOver) {
    for (const p of state.players) p.cumulativeScore += handPenalty(p.hand);
  }
  state.roundOver = true;
  state.gameOver = true;
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  state.winnerId = standings[0].id;
}

/**
 * Deal a fresh game from a seat config. Seats must be a 0-based contiguous
 * set (seat i ↔ players[i]); the create path is responsible for numbering
 * them that way.
 */
export function dealGame(config: MpConfig): MpEngine {
  const contracts = contractsFor(config.contractRounds);
  if (contracts.length === 0) throw new Error("no valid contract rounds");

  const seats = [...config.seats].sort((a, b) => a.seat - b.seat);
  seats.forEach((s, i) => {
    if (s.seat !== i) throw new Error("seats must be 0..N-1 with no gaps");
  });
  if (seats.length < 2 || seats.length > 8) throw new Error("2–8 seats required");

  const state = createGame(
    seats.map((s) => ({
      id: `seat-${s.seat}`,
      name: s.name,
      isAI: s.kind === "ai",
      difficulty: s.kind === "ai" ? s.difficulty : undefined,
    })),
    contracts
  );

  return advanceThroughAi({ state, turnDrawn: false, resignedSeats: [], roundResults: [] });
}

/**
 * Run every AI turn (and auto-advance every finished round) until it's an
 * active human's turn, or the game is over. Resigned seats are skipped.
 * Mutates a clone; returns it.
 */
export function advanceThroughAi(engIn: MpEngine): MpEngine {
  const eng = clone(engIn);

  for (let guard = 0; guard < ADVANCE_GUARD; guard++) {
    const s = eng.state;

    if (s.roundOver) {
      // Snapshot the round that just ended (once — guarded so a repeat call
      // on an already-finished game can't double-record it), then either
      // stop (game over) or deal the next round.
      if (!eng.roundResults.some((r) => r.round === s.round)) {
        eng.roundResults.push(snapshotRound(s));
      }
      if (s.gameOver) break;
      eng.state = startNextRound(s);
      eng.turnDrawn = false;
      continue;
    }

    if (s.gameOver) break;

    if (eng.resignedSeats.includes(s.currentPlayerIndex)) {
      s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
      continue;
    }

    if (!s.players[s.currentPlayerIndex].isAI) break; // active human — stop here

    playAITurn(s);
    eng.turnDrawn = false;
  }

  return eng;
}

/**
 * The seat draws a card. Returns the drawn card so the caller can send it to
 * that one player. On an invalid draw, `engine` is the untouched input and
 * `error` is set.
 */
export function applyDraw(
  engIn: MpEngine,
  seat: number,
  from: "stock" | "discard"
): { engine: MpEngine; card: Card | null; error?: string } {
  const s0 = engIn.state;
  if (s0.roundOver || s0.gameOver) return { engine: engIn, card: null, error: "the round is over" };
  if (s0.currentPlayerIndex !== seat) return { engine: engIn, card: null, error: "it isn't your turn" };
  if (engIn.turnDrawn) return { engine: engIn, card: null, error: "you've already drawn this turn" };

  const eng = clone(engIn);
  const s = eng.state;

  let card: Card | null;
  if (from === "discard") {
    card = drawFromDiscard(s) ?? drawFromPile(s);
  } else {
    card = drawFromPile(s);
  }

  // A null card means both piles were exhausted and drawFromPile already
  // ended the round — nothing more this turn; run past it.
  if (!card) {
    eng.turnDrawn = false;
    return { engine: advanceThroughAi(eng), card: null };
  }

  eng.turnDrawn = true;
  return { engine: eng, card };
}

/**
 * The seat commits its whole turn: an optional meld, any lay-offs, then the
 * discard (or going out with an empty hand). Validated end to end with the
 * real engine. All-or-nothing — on any failure `engine` is the untouched
 * input.
 */
export function applyCommit(
  engIn: MpEngine,
  config: MpConfig,
  seat: number,
  action: Extract<MpAction, { type: "commit" }>
): { engine: MpEngine; error?: string } {
  const s0 = engIn.state;
  if (s0.roundOver || s0.gameOver) return { engine: engIn, error: "the round is over" };
  if (s0.currentPlayerIndex !== seat) return { engine: engIn, error: "it isn't your turn" };
  if (!engIn.turnDrawn) return { engine: engIn, error: "draw a card first" };

  const eng = clone(engIn);
  const s = eng.state;
  const player = s.players[seat];

  if (action.groups && action.groups.length > 0) {
    if (player.hasMeldedContract) return { engine: engIn, error: "you've already melded this round" };
    const melds = meldChosenGroups(s, action.groups, action.preferredRunStarts);
    if (!melds) return { engine: engIn, error: "that meld doesn't complete this round's contract" };
  }

  for (const lo of action.layoffs ?? []) {
    if (!layOffCard(s, lo.cardId, lo.meldId, lo.position)) {
      return { engine: engIn, error: "one of those lay-offs isn't valid" };
    }
  }

  if (player.hasMeldedContract && player.hand.length === 0) {
    discardAndAdvance(s, ""); // went out — no discard
  } else {
    if (!action.discardCardId) return { engine: engIn, error: "choose a card to discard" };
    const before = s.currentPlayerIndex;
    const ended = discardAndAdvance(s, action.discardCardId);
    if (!ended && s.currentPlayerIndex === before) {
      return { engine: engIn, error: "that card isn't in your hand" };
    }
  }

  eng.turnDrawn = false;
  return { engine: advanceThroughAi(eng) };
}

/**
 * The seat resigns. Their hand is cleared, they take a flat penalty, and
 * their turns are skipped from here. If fewer than two human seats are still
 * in it, the game is force-completed.
 */
export function applyResign(engIn: MpEngine, config: MpConfig, seat: number): MpEngine {
  let eng = clone(engIn);

  if (!eng.resignedSeats.includes(seat)) {
    eng.resignedSeats.push(seat);
    const p = eng.state.players[seat];
    p.hand = [];
    p.cumulativeScore += RESIGN_PENALTY;
  }

  const activeHumans = config.seats
    .filter((x) => x.kind === "human" && !eng.resignedSeats.includes(x.seat))
    .length;

  if (activeHumans < 2) {
    finalizeGame(eng.state);
    return eng;
  }

  const s = eng.state;
  if (!s.roundOver && !s.gameOver && s.currentPlayerIndex === seat) {
    s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
  }

  eng = advanceThroughAi(eng);
  return eng;
}

/** Reduce the full engine to what one seat is allowed to see. `viewerSeat`
 * null is a spectator (shouldn't happen for a participant). */
export function redactFor(eng: MpEngine, config: MpConfig, viewerSeat: number | null): RedactedView {
  const s = eng.state;
  const contract = s.selectedContracts[s.round - 1];
  const userIdForSeat = (seat: number): string | undefined => {
    const m = config.seats.find((x) => x.seat === seat);
    return m && m.kind === "human" ? m.userId : undefined;
  };

  return {
    round: s.round,
    roundLabel: contract.label,
    totalRounds: s.selectedContracts.length,
    contract: {
      books: contract.books,
      runs: contract.runs,
      bookSize: contract.bookSize,
      runSize: contract.runSize,
      wholeHandMeld: contract.wholeHandMeld,
    },
    players: s.players.map((p, i) => ({
      seat: i,
      name: p.name,
      isAI: p.isAI,
      userId: userIdForSeat(i),
      handCount: p.hand.length,
      hasMeldedContract: p.hasMeldedContract,
      cumulativeScore: p.cumulativeScore,
      resigned: eng.resignedSeats.includes(i),
    })),
    yourSeat: viewerSeat,
    yourHand: viewerSeat != null ? s.players[viewerSeat].hand : [],
    currentSeat: s.currentPlayerIndex,
    currentUserId:
      s.gameOver || s.roundOver ? null : userIdForSeat(s.currentPlayerIndex) ?? null,
    yourTurn:
      viewerSeat != null &&
      s.currentPlayerIndex === viewerSeat &&
      !s.roundOver &&
      !s.gameOver &&
      !eng.resignedSeats.includes(viewerSeat),
    youHaveDrawn: eng.turnDrawn,
    drawPileCount: s.drawPile.length,
    discardPile: s.discardPile,
    discardTop: s.discardPile[s.discardPile.length - 1] ?? null,
    melds: s.melds,
    discardHistory: s.discardHistory,
    pickupHistory: s.pickupHistory,
    roundOver: s.roundOver,
    gameOver: s.gameOver,
    winnerSeat: s.winnerId ? seatFromId(s.winnerId) : null,
    roundResults: eng.roundResults,
  };
}

function seatFromId(id: string): number {
  const n = Number(id.replace("seat-", ""));
  return Number.isFinite(n) ? n : 0;
}

/** Public, non-secret projection for the mp_games row (what clients read via
 * RLS and subscribe to). */
export function publicColumns(eng: MpEngine, config: MpConfig) {
  const s = eng.state;
  const currentIsHuman = seatIsHuman(config, s.currentPlayerIndex) && !s.gameOver && !s.roundOver;
  return {
    round: s.round,
    turn_seat: s.currentPlayerIndex,
    turn_user_id: currentIsHuman ? userId(config, s.currentPlayerIndex) : null,
    hand_counts: Object.fromEntries(s.players.map((p, i) => [i, p.hand.length])),
    cumulative_scores: Object.fromEntries(s.players.map((p, i) => [i, p.cumulativeScore])),
    status: s.gameOver ? "complete" : "active",
    winner_user_id: s.gameOver && s.winnerId ? userId(config, seatFromId(s.winnerId)) : null,
  };
}

function userId(config: MpConfig, seat: number): string | null {
  const m = config.seats.find((x) => x.seat === seat);
  return m && m.kind === "human" ? m.userId : null;
}
