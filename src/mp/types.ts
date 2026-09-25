import { Card, DiscardEvent, Difficulty, GameState, Meld } from "../types";

/**
 * Multiplayer adapter types. The adapter (adapter.ts) is pure, like the rest
 * of src/ — it wraps the existing engine into the few operations the
 * server-side game needs: deal, draw, meld / lay off / discard as separate actions, resign, run the
 * AI seats, and redact the state down to one player's view. The Supabase
 * Edge Function is a thin shell over these; all the real logic and all the
 * tests live here.
 */

/** One seat at an MP table. `seat` is a 0-based, contiguous index — seat i is
 * always players[i] in the underlying GameState. */
export type MpSeat =
  | { seat: number; kind: "human"; userId: string; name: string }
  | { seat: number; kind: "ai"; difficulty: Difficulty; name: string };

export interface MpConfig {
  seats: MpSeat[];
  /** 1-based positions into CONTRACTS, in play order — e.g. [1,2,3,4,5,6,7]
   * for a full game, or a Short / Custom subset. */
  contractRounds: number[];
}

/** The full authoritative game as stored in mp_game_state.engine. Never sent
 * to a client as-is — redactFor() is the only way it leaves the server. */
export interface MpEngine {
  state: GameState;
  /** Has the seat whose turn it is already taken its draw this turn? The
   * engine's GameState doesn't track this (the local client does, in
   * GameContext) — MP has to. */
  turnDrawn: boolean;
  /** Seats that have resigned. Their turns are skipped; their score carries a
   * flat penalty so they finish last. */
  resignedSeats: number[];
  /** Resigned seats whose flat RESIGN_PENALTY hasn't been added to their
   * cumulativeScore yet — it lands when the round in progress ends (or the
   * game is force-finished), so no score shown mid-round includes a penalty
   * that hasn't been "earned" by a round ending. Optional: engines stored
   * before this field existed applied the penalty at resign time and have
   * nothing pending. */
  pendingResignPenalty?: number[];
  /** One snapshot per completed round, for the round-summary UI. */
  roundResults: RoundResult[];
}

export interface RoundResult {
  round: number;
  label: string;
  /** `resignPenalty` is set (to RESIGN_PENALTY) on the seat whose flat
   * resign penalty was applied as part of this round ending — `penalty` stays
   * the seat's hand penalty, and `cumulative` includes both. */
  scores: { seat: number; penalty: number; cumulative: number; resignPenalty?: number }[];
}

export type MpAction =
  | { type: "draw"; from: "stock" | "discard" }
  /** Lay down this round's contract (solo's "Confirm Meld"). Immediate;
   * the turn stays open. */
  | { type: "meld"; groups: string[][]; preferredRunStarts?: (number | undefined)[] }
  /** Lay one card off onto a table meld. Immediate; the turn stays open. */
  | { type: "layoff"; cardId: string; meldId: string; position?: "low" | "high" }
  /** End the turn by discarding one card; omit the card to go out with an
   * already-empty hand (after melding / laying off everything). */
  | { type: "discard"; discardCardId?: string }
  /** Legacy all-in-one turn — the UI no longer sends this; the server keeps
   * accepting it for older clients. */
  | {
      type: "commit";
      /** Card-id groups to meld as this round's contract, one array per
       * book/run. Omit / empty for a turn with no meld. */
      groups?: string[][];
      /** Parallel to `groups` — an explicit runStartIndex for a run whose
       * wild placement is ambiguous (see validateManualGroup). */
      preferredRunStarts?: (number | undefined)[];
      /** Single-card lay-offs onto melds already on the table. */
      layoffs?: { cardId: string; meldId: string; position?: "low" | "high" }[];
      /** The card to discard to end the turn. Omitted only when melding /
       * laying off emptied the hand (going out). */
      discardCardId?: string;
    };

/** One player's allowed view of the game. Contains every hand *count* but
 * only the viewer's own cards, the public melds, and the full discard pile. */
export interface RedactedPlayer {
  seat: number;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty;
  userId?: string;
  handCount: number;
  hasMeldedContract: boolean;
  cumulativeScore: number;
  resigned: boolean;
  /** Flat resign penalty this (resigned) seat will be charged when the round
   * ends — NOT yet included in cumulativeScore. Absent once applied / for
   * seats that haven't resigned. */
  pendingResignPenalty?: number;
}

export interface RedactedView {
  round: number;
  roundLabel: string;
  totalRounds: number;
  /** 1-based CONTRACTS positions this game is playing, in order — so a
   * rematch can be dealt with the same round set. */
  contractRounds: number[];
  contract: {
    books: number;
    runs: number;
    bookSize: number;
    runSize: number;
    wholeHandMeld: boolean;
  };
  players: RedactedPlayer[];
  yourSeat: number | null;
  yourHand: Card[];
  currentSeat: number;
  /** The account whose turn it is, or null if the game is over / it's
   * (transiently) an AI seat. */
  currentUserId: string | null;
  yourTurn: boolean;
  youHaveDrawn: boolean;
  drawPileCount: number;
  discardPile: Card[];
  discardTop: Card | null;
  melds: Meld[];
  discardHistory: DiscardEvent[];
  pickupHistory: DiscardEvent[];
  roundOver: boolean;
  gameOver: boolean;
  winnerSeat: number | null;
  roundResults: RoundResult[];
}
