"use client";

// The live local game. This context owns the one in-progress solo /
// pass-and-play / tutorial / Daily Deal game: it holds the `GameState`,
// wraps every engine mutation as an action the game screen can call
// (draw, meld, lay off, discard, next round, undo), drives the AI loop
// (`runAiLoop` — steps AI seats with pauses so a human can follow along),
// auto-saves to localStorage after every change (see localSave.ts), and
// publishes `flightEvent` hints so the board can animate card movement
// (see CardFlightLayer). Multiplayer games do NOT go through here — they
// have their own hook (`useMpGame`) talking to the Edge Function.
//
// `BUY_DISCARD_ENABLED` is the switch for the "buy the discard" house rule:
// the engine supports it (`eligibleBuyers` / `buyDiscard`) but it's off,
// because it needs a player watching for a discard worth buying, which
// doesn't work on one shared pass-and-play screen.

import {
  buyDiscard,
  createGame,
  discardAndAdvance,
  drawFromDiscard,
  drawFromPile,
  eligibleBuyers,
  layOffCard,
  meldChosenGroups,
  PlayerConfig,
  startNextRound,
} from "@/gameEngine";
import { aiWantsToBuyDiscard, playAITurn } from "@/ai/index";
import { layOffOptions } from "@/meld";
import { roundSeed, seededRng } from "@/deck";
import { MoveLogEntry } from "@/moveLog";
import {
  CounterDeltas,
  discardDeltas,
  drawDeltas,
  layOffDeltas,
  meldDeltas,
  roundWonDeltas,
  tableCompositionDeltas,
} from "@/replayStats";
import { Card, ContractRequirement, GameState } from "@/types";
import { createTutorialGame } from "@/tutorial";
import { createDailyDealGame, dateSeed, localDateKey } from "./lib/dailyDealStore";
import { createWeeklyChallengeGame, isoWeekKey, weekSeed } from "./lib/weeklyChallengeStore";
import { track } from "./lib/analytics";
import { applyHandOrder, compareByMode, SortMode } from "./lib/handSort";
import { RoundHistoryEntry, YOU_PLAYER_ID } from "./lib/recordGameResult";
import {
  clearDailyDealSave,
  clearSavedGame,
  clearWeeklyChallengeSave,
  loadDailyDealSave,
  loadSavedGame,
  loadWeeklyChallengeSave,
  saveDailyDealGame,
  saveGame,
  saveWeeklyChallengeGame,
} from "./lib/localSave";
import { playCardSlide, playCardTap, playMeld, playUndo, setTutorialSoundOverride } from "./lib/sound";
import { hapticLight, hapticMedium } from "./lib/haptics";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface BuyOffer {
  playerId: string;
  playerName: string;
  card: Card;
}

/**
 * The last card movement worth animating, published so the game board can
 * fly a clone from A to B (see CardFlightLayer). `id` bumps on every event
 * so the board's effect re-fires even for two events of the same kind in a
 * row. Purely a presentation hint — carries no game-state authority, and a
 * consumer that ignores it changes nothing.
 */
export type FlightInput =
  | { kind: "draw"; card: Card; fromDiscard: boolean; byId: string }
  | { kind: "discard"; card: Card; byId: string; isAI: boolean; note?: string }
  | { kind: "meld"; cards: Card[]; byId: string; isAI: boolean; note?: string }
  | { kind: "layoff"; card: Card; meldId: string; byId: string; isAI: boolean };

export type FlightEvent = FlightInput & { id: number };

interface GameContextValue {
  state: GameState | null;
  hasDrawn: boolean;
  awaitingReveal: boolean;
  aiThinking: boolean;
  hasSavedGame: boolean;
  roundStartScores: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
  lastDrawnCardId: string | null;
  /** See FlightEvent — a presentation hint for the card-flight overlay. */
  flightEvent: FlightEvent | null;
  buyOffer: BuyOffer | null;
  /** `trackStats` (default true) sets whether this game's results are
   * recorded to the signed-in account at all — see New Game's "Track stats
   * for this game" toggle. */
  startNewGame: (configs: PlayerConfig[], contracts?: ContractRequirement[], trackStats?: boolean) => void;
  /** A fixed, scripted 1-vs-1 practice round (see src/tutorial.ts) — never
   * touches the real saved-game slot, Supabase stats, or achievements. */
  startTutorialGame: () => void;
  isTutorial: boolean;
  /** Today's single-round, date-seeded challenge (see dailyDealStore.ts) —
   * never touches the real saved-game slot (that's the tutorial's own
   * treatment), but does get its own separate in-progress save so exiting
   * before it's over doesn't lose the one shot at today's deal — see
   * continueDailyDeal. Its own local streak is recorded separately, from
   * GameOverScreen. */
  startDailyDeal: () => void;
  isDailyDeal: boolean;
  /** The full-game, week-seeded sibling of Daily Deal (see
   * weeklyChallengeStore.ts) — same "own separate save slot, never the real
   * saved-game slot" treatment, own local streak recorded separately from
   * GameOverScreen. */
  startWeeklyChallenge: () => void;
  isWeeklyChallenge: boolean;
  /** Whether this game's results are being recorded to the signed-in
   * account — see startNewGame's own doc. Always true during a tutorial
   * (moot either way; isTutorial already gates every write on its own). */
  trackStats: boolean;
  continueGame: () => void;
  /** Resumes an in-progress Daily Deal saved by continueDailyDeal's own
   * persist() calls (see localSave.ts's DAILY_DEAL_SAVE_KEY) — a no-op if
   * there's nothing to resume. */
  continueDailyDeal: () => void;
  /** Same, for an in-progress Weekly Challenge. */
  continueWeeklyChallenge: () => void;
  revealHand: () => void;
  draw: (fromDiscard: boolean) => void;
  confirmMeld: (groups: string[][], preferredRunStarts?: (number | undefined)[]) => boolean;
  layOff: (cardId: string, meldId: string, position?: "low" | "high") => boolean;
  discard: (cardId: string) => void;
  sortHand: (mode: SortMode) => void;
  reorderHand: (cardIdsInOrder: string[]) => void;
  respondToBuy: (accept: boolean) => void;
  advanceRound: () => void;
  quitToHome: () => void;
  /** True for a few seconds right after confirmMeld/layOff succeeds (and
   * didn't also end the round — see undoLastAction), then auto-expires. */
  canUndo: boolean;
  /** The Date.now() timestamp the current grace window expires at, or null
   * when !canUndo — lets the UI show a live countdown (see UndoRing.tsx)
   * without needing to poll GameContext every tick itself. */
  undoExpiresAt: number | null;
  /** Reverts the most recent confirmMeld/layOff while canUndo is true; a
   * no-op otherwise. Any other action (draw, sort, reorder, discard, a new
   * meld/lay-off, advancing rounds, leaving the game) invalidates the grace
   * window immediately rather than waiting for it to time out. */
  undoLastAction: () => void;
  /** Achievement counter deltas accumulated since the last flush, for the
   * signed-in seat only — see recordAchievementProgress.ts, called from both
   * RoundSummary (round-end) and GameOverScreen (game-over). */
  getSessionCounters: () => Record<string, number>;
  /** Call right after a successful recordAchievementProgress flush. */
  clearSessionCounters: () => void;
  /** This game's seed and move log so far — together, everything a
   * server-side replay needs (see src/solo/replay.ts). Null seed means this
   * game can't be verified (a tutorial, or a save from before this field
   * existed) — callers building a verification payload should treat that as
   * "fall back to the old direct-write path," not an error. */
  getSeed: () => number | null;
  getMoveLog: () => MoveLogEntry[];
}

const GameContext = createContext<GameContextValue | null>(null);

/**
 * "Buy the discard" (see eligibleBuyers/buyDiscard in gameEngine.ts,
 * BuyOfferGate.tsx) needs a player other than the discarder or current
 * player to notice the discard and react before play moves on. That works
 * fine on separate devices, but not on one shared, pass-and-play screen or
 * with AI opponents rotating through automatically — nobody's actually
 * watching for it, so it either gets missed constantly or fires against
 * cards no human present chose to see. Disabled here rather than removed:
 * all the engine and UI plumbing stays intact for a possible future
 * multi-device mode, where each player has their own screen and buying back
 * in is actually watchable. Flip this back to true to re-enable it.
 *
 * A second feature, "Player!" (a player who spots a discard that fits
 * someone else's meld can call it, move that card onto the meld themselves,
 * and discard a card of their own as a reward) has the exact same
 * single-shared-screen problem and was never implemented for that reason —
 * no code for it exists yet. Worth reconsidering alongside Buy if this ever
 * becomes multi-device.
 */
const BUY_DISCARD_ENABLED = false;

// The "thinking…" beat before an AI acts, and the beat after it acts so the
// result (the discard landing, "Talon laid down 2 Books") is actually
// readable before play moves on — the board stays on screen during an AI
// turn now (see game/page.tsx), so there's something to watch.
const AI_TURN_DELAY_MS = 450;
const AI_RESULT_HOLD_MS = 900;

const RANK_WORD: Record<string, string> = { A: "Ace", K: "King", Q: "Queen", J: "Jack" };
/** "the 7 of diamonds", "the King of hearts", "a Joker" — for the opponent
 * strip's play-by-play line. */
function aiCardLabel(card: { rank: string; suit: string }): string {
  if (card.suit === "joker") return "a Joker";
  return `the ${RANK_WORD[card.rank] ?? card.rank} of ${card.suit}`;
}

// How long a confirmMeld/layOff stays undoable before the grace window
// silently expires — long enough to catch an immediate "oops, wrong meld"
// without turning into a real move-history/redo feature. Exported so
// UndoRing.tsx's countdown animation always matches the real timeout
// instead of a hand-copied duplicate that could drift out of sync.
export const UNDO_GRACE_MS = 6000;

/**
 * Everything undoLastAction needs to put back exactly as it was.
 * Deliberately does NOT include roundHistory/recordedRounds/hasDrawn/
 * lastDrawnCardId: confirmMeld/layOff only ever get armed as undoable when
 * they *didn't* also end the round (see the wentOut check at both call
 * sites) — a round-ending meld/lay-off is scoped out entirely, since
 * RoundSummary/GameOverScreen would immediately take over the whole screen
 * with no "Undo" control reachable there, and reverting a win would also
 * mean unwinding the achievement-flush bookkeeping those screens trigger.
 * That leaves state (for the meld/lay-off itself) and sessionCounters (for
 * the achievement-progress bump() calls confirmMeld/layOff make along the
 * way) as the only two things that can actually change on the path this
 * type covers.
 */
interface UndoSnapshot {
  state: GameState;
  sessionCounters: Record<string, number>;
  // The move log entry(ies) the undone action appended — undoLastAction
  // trims them back off, same as it reverts state/sessionCounters, so an
  // undone meld/lay-off never ends up in what's submitted for verification.
  moveLogLength: number;
}

// Re-exported so any existing `import { SortMode } from "./GameContext"`
// keeps working — the type itself now lives in handSort.ts, shared with
// useMpGame's own (purely local, non-persisted) hand sort.
export type { SortMode };

/**
 * If the current player has melded their contract and melding/laying off
 * just emptied their hand, they've gone out — end the round immediately
 * rather than leaving the UI waiting on a discard that's now impossible
 * with zero cards in hand. Mirrors what playAITurn already does for AI
 * turns; confirmMeld and layOff need the same check for human turns.
 * Returns whether this ended the round, so callers can attribute the win.
 */
function finishIfWentOut(s: GameState): boolean {
  const player = s.players[s.currentPlayerIndex];
  if (player.hasMeldedContract && player.hand.length === 0) {
    return discardAndAdvance(s, "");
  }
  return false;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<GameState | null>(null);
  const [snapshot, setSnapshot] = useState<GameState | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [awaitingReveal, setAwaitingReveal] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(false);
  const [roundStartScores, setRoundStartScores] = useState<Record<string, number>>({});
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);
  const [lastDrawnCardId, setLastDrawnCardId] = useState<string | null>(null);
  const [flightEvent, setFlightEvent] = useState<FlightEvent | null>(null);
  const flightIdRef = useRef(0);
  const emitFlight = useCallback((e: FlightInput) => {
    setFlightEvent({ ...e, id: ++flightIdRef.current });
  }, []);
  const [buyOffer, setBuyOffer] = useState<BuyOffer | null>(null);
  const [isTutorial, setIsTutorial] = useState(false);
  // Mirrors isTutorial for use inside stable callbacks (persist, quitToHome)
  // that can't take a reactive dependency on it without breaking memoization.
  const isTutorialRef = useRef(false);
  // Same pattern, same reason, for Daily Deal (see startDailyDeal below) —
  // gates persist() exactly like isTutorialRef does, so playing today's
  // deal can never clobber (or get resumed as) a real in-progress game.
  const [isDailyDeal, setIsDailyDeal] = useState(false);
  const isDailyDealRef = useRef(false);
  // Same pattern again, for the Weekly Challenge (see startWeeklyChallenge
  // below) — isDailyDeal and isWeeklyChallenge are never both true at once
  // (each start*/continue* function clears the other), so persist() can
  // check them in sequence unambiguously.
  const [isWeeklyChallenge, setIsWeeklyChallenge] = useState(false);
  const isWeeklyChallengeRef = useRef(false);
  // Whether this game's results should be recorded to the signed-in account
  // at all — set once at New Game (see its own "Track stats for this game"
  // toggle, offered for 3+ pass-and-play human players) and carried through
  // persist()/continueGame() so resuming a saved game later can't silently
  // revert an "off" choice back to tracking. Defaults to true; RoundSummary
  // and GameOverScreen both gate their Supabase writes on this the same way
  // they already gate on isTutorial.
  const [trackStats, setTrackStats] = useState(true);
  const trackStatsRef = useRef(true);
  const setTrackStatsBoth = useCallback((value: boolean) => {
    trackStatsRef.current = value;
    setTrackStats(value);
  }, []);
  const buyQueueRef = useRef<string[]>([]);
  const recordedRoundsRef = useRef<Set<number>>(new Set());

  // The one integer a solo/pass-and-play game's whole deal is reproducible
  // from — see deck.ts's roundSeed for why this is a plain seed rather than
  // a live rng stream (a save/resume can't persist a generator's internal
  // state). Null for a tutorial (never verified) or a pre-existing saved
  // game from before this field existed (see localSave.ts's SavedGame —
  // GameOverScreen's attemptSave just skips verifying/recording that one
  // game when this is null, same treatment as trackStats off). Daily Deal
  // keeps deriving its own from the calendar date (dateSeed/localDateKey)
  // rather than a random draw, but still gets stored here so it can ride
  // along in the same verification payload.
  const gameSeedRef = useRef<number | null>(null);
  // Every draw/meld/lay-off/discard this game has made, human or AI alike
  // — the other half (with gameSeedRef) of what a server-side replay needs
  // to independently reproduce this exact game and verify its outcome. See
  // moveLog.ts for why a round boundary needs no entry of its own.
  const moveLogRef = useRef<MoveLogEntry[]>([]);

  // Refs mirror the persistence-relevant state synchronously, so commit()
  // can always write a consistent snapshot without waiting on React's
  // (possibly-batched, possibly-stale-by-a-tick) state updates.
  const hasDrawnRef = useRef(false);
  const roundStartScoresRef = useRef<Record<string, number>>({});
  const roundHistoryRef = useRef<RoundHistoryEntry[]>([]);

  // Achievement progress accumulated this game, for YOU_PLAYER_ID only.
  // Flushed to Supabase at the end of every round (see RoundSummary.tsx) and
  // again at game-over (see GameOverScreen.tsx), each flush clearing what it
  // sent via clearSessionCounters below so nothing double-counts. Melds,
  // discards, turns, etc. are real the moment they happen, unlike
  // games_played/games_won — those stay gated on an actually-finished game
  // (recordGameResult), so quitting mid-round still drops that round's
  // partial action counts, but nothing from rounds already completed.
  const sessionCountersRef = useRef<Record<string, number>>({});
  const bump = useCallback((key: string, amount = 1) => {
    sessionCountersRef.current[key] = (sessionCountersRef.current[key] ?? 0) + amount;
  }, []);
  // Applies a whole replayStats.ts deltas object in one go — the usual way
  // bump() gets called now, so the exact same delta-computing functions a
  // server-side replay will eventually use are what credits live play too.
  const applyDeltas = useCallback(
    (deltas: CounterDeltas) => {
      for (const [key, amount] of Object.entries(deltas)) bump(key, amount);
    },
    [bump]
  );
  const getSessionCounters = useCallback(() => sessionCountersRef.current, []);
  const getSeed = useCallback(() => gameSeedRef.current, []);
  const getMoveLog = useCallback(() => moveLogRef.current, []);

  // See UndoSnapshot's own comment for exactly what this does and doesn't
  // cover. canUndo is the only piece of this that needs to be reactive (for
  // the UI to show/hide the Undo control) — the snapshot and its expiry
  // timer live in refs, mutated directly, same as every other ref in this
  // provider that a callback needs to read/write outside a render.
  const [canUndo, setCanUndo] = useState(false);
  const [undoExpiresAt, setUndoExpiresAt] = useState<number | null>(null);
  const undoSnapshotRef = useRef<UndoSnapshot | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const check = () => setHasSavedGame(loadSavedGame() !== null);
    check();
    // LocalSaveSync fires this after pulling a newer save down from the
    // account — re-read so Home's "Resume game" card reflects it.
    window.addEventListener("br:solo-synced", check);
    return () => window.removeEventListener("br:solo-synced", check);
  }, []);

  const setHasDrawnBoth = useCallback((value: boolean) => {
    hasDrawnRef.current = value;
    setHasDrawn(value);
  }, []);

  const setRoundStartScoresBoth = useCallback((value: Record<string, number>) => {
    roundStartScoresRef.current = value;
    setRoundStartScores(value);
  }, []);

  const persist = useCallback(() => {
    // Tutorial games are scripted practice, not a real game — never touch
    // any saved-game slot, in either direction.
    if (isTutorialRef.current) return;
    const s = stateRef.current;
    // Daily Deal gets its own separate slot (never the real SAVE_KEY,
    // "Continue Local Game" should never surface it or have it silently
    // replace a real in-progress game) — see localSave.ts's
    // DAILY_DEAL_SAVE_KEY doc for why exiting early still needs to be
    // resumable: it's a once-a-day challenge, not something to just restart.
    if (isDailyDealRef.current) {
      if (!s || s.gameOver) {
        clearDailyDealSave();
        return;
      }
      saveDailyDealGame({
        state: s,
        hasDrawn: hasDrawnRef.current,
        roundStartScores: roundStartScoresRef.current,
        roundHistory: roundHistoryRef.current,
        sessionCounters: sessionCountersRef.current,
        trackStats: trackStatsRef.current,
        seed: gameSeedRef.current,
        moveLog: moveLogRef.current,
      });
      return;
    }
    // Same treatment, the Weekly Challenge's own slot.
    if (isWeeklyChallengeRef.current) {
      if (!s || s.gameOver) {
        clearWeeklyChallengeSave();
        return;
      }
      saveWeeklyChallengeGame({
        state: s,
        hasDrawn: hasDrawnRef.current,
        roundStartScores: roundStartScoresRef.current,
        roundHistory: roundHistoryRef.current,
        sessionCounters: sessionCountersRef.current,
        trackStats: trackStatsRef.current,
        seed: gameSeedRef.current,
        moveLog: moveLogRef.current,
      });
      return;
    }
    if (!s || s.gameOver) {
      clearSavedGame();
      setHasSavedGame(false);
      return;
    }
    saveGame({
      state: s,
      hasDrawn: hasDrawnRef.current,
      roundStartScores: roundStartScoresRef.current,
      roundHistory: roundHistoryRef.current,
      sessionCounters: sessionCountersRef.current,
      seed: gameSeedRef.current,
      moveLog: moveLogRef.current,
      trackStats: trackStatsRef.current,
    });
    setHasSavedGame(true);
  }, []);

  // Called after a successful recordAchievementProgress flush (round-end or
  // game-over) so the same deltas never get sent twice — persisted right
  // away so a reload mid-round-summary can't resurrect already-flushed
  // counters from the saved game.
  const clearSessionCounters = useCallback(() => {
    sessionCountersRef.current = {};
    persist();
  }, [persist]);

  const commit = useCallback(() => {
    const s = stateRef.current;
    if (s && s.roundOver && !recordedRoundsRef.current.has(s.round)) {
      recordedRoundsRef.current.add(s.round);
      const totals = Object.fromEntries(s.players.map((p) => [p.name, p.cumulativeScore]));
      roundHistoryRef.current = [...roundHistoryRef.current, { round: s.round, totals }];
      setRoundHistory(roundHistoryRef.current);
    }
    setSnapshot(s ? { ...s } : null);
    persist();
  }, [persist]);

  // Invalidates a pending undo grace window outright — called at the top of
  // every action other than confirmMeld/layOff themselves (those instead
  // overwrite undoSnapshotRef with their own fresh snapshot, which already
  // supersedes whatever was there — see armUndo).
  const clearUndoState = useCallback(() => {
    undoSnapshotRef.current = null;
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setCanUndo(false);
    setUndoExpiresAt(null);
  }, []);

  const armUndo = useCallback(
    (snapshot: UndoSnapshot) => {
      undoSnapshotRef.current = snapshot;
      setCanUndo(true);
      setUndoExpiresAt(Date.now() + UNDO_GRACE_MS);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = setTimeout(clearUndoState, UNDO_GRACE_MS);
    },
    [clearUndoState]
  );

  const undoLastAction = useCallback(() => {
    const snapshot = undoSnapshotRef.current;
    if (!snapshot) return;
    stateRef.current = snapshot.state;
    sessionCountersRef.current = { ...snapshot.sessionCounters };
    moveLogRef.current = moveLogRef.current.slice(0, snapshot.moveLogLength);
    clearUndoState();
    playUndo();
    commit();
  }, [clearUndoState, commit]);

  /** Runs AI turns one at a time (with a small delay for visibility) until it's a
   * human's turn again, or the round/game ends. */
  const runAiLoop = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.roundOver || s.gameOver) {
      setAiThinking(false);
      if (s && !s.roundOver && !s.gameOver) {
        setAwaitingReveal(true);
      }
      return;
    }
    const current = s.players[s.currentPlayerIndex];
    if (!current.isAI) {
      setAiThinking(false);
      setHasDrawnBoth(false);
      setLastDrawnCardId(null);
      setAwaitingReveal(true);
      return;
    }
    setAiThinking(true);
    setTimeout(() => {
      const live = stateRef.current;
      if (!live || live.roundOver || live.gameOver) {
        commit();
        runAiLoop();
        return;
      }
      const aiId = live.players[live.currentPlayerIndex].id;
      const aiName = live.players[live.currentPlayerIndex].name;
      const meldsBefore = live.melds.length;
      const meldSizeBefore = new Map(live.melds.map((m) => [m.id, m.cards.length]));
      const discardBefore = live.discardPile.length;

      const aiEntries = playAITurn(live);
      if (aiEntries.length > 0) moveLogRef.current = [...moveLogRef.current, ...aiEntries];

      const nextIsHuman = !live.roundOver && !live.gameOver && !live.players[live.currentPlayerIndex].isAI;

      // Sum up what the turn did into one status note (multiple rapid
      // emitFlight calls collapse to the last one in a render batch, so the
      // note rides on the single discard event). One card slide for the
      // whole turn — the discard onto the pile — but only while another AI
      // is still up: once it's your turn the pass-and-play gate takes over
      // and there's no pile for it to land on.
      const newMelds = live.melds.slice(meldsBefore);
      const grown = live.melds.filter(
        (m) => meldSizeBefore.has(m.id) && m.cards.length > (meldSizeBefore.get(m.id) ?? 0)
      );
      const laidOff = grown.reduce((n, m) => n + (m.cards.length - (meldSizeBefore.get(m.id) ?? 0)), 0);
      const didDiscard = live.discardPile.length > discardBefore;

      // Prefer the headline: a meld, else a lay-off, else the routine
      // discard. Kept to one short clause so the strip line doesn't wrap.
      // The acting player's name is baked in — by the time the strip reads
      // this the turn has already advanced, so it can't attribute the note
      // by "whose turn is it" any more.
      let action: string;
      if (newMelds.length > 0) {
        const label = live.selectedContracts[live.round - 1]?.label ?? "their contract";
        action = laidOff > 0 ? `melded ${label} +${laidOff}` : `melded ${label}`;
      } else if (laidOff > 0) {
        action = `laid off ${laidOff} card${laidOff > 1 ? "s" : ""}`;
      } else if (didDiscard) {
        action = `discarded ${aiCardLabel(live.discardPile[live.discardPile.length - 1])}`;
      } else {
        action = "passed";
      }
      const note = `${aiName} ${action}`;

      if (!nextIsHuman) {
        if (didDiscard) {
          emitFlight({
            kind: "discard",
            card: live.discardPile[live.discardPile.length - 1],
            byId: aiId,
            isAI: true,
            note,
          });
        } else {
          // round 7: melded the whole hand, no discard to slide
          emitFlight({ kind: "meld", cards: [], byId: aiId, isAI: true, note });
        }
      }

      commit();

      if (live.roundOver || live.gameOver) {
        setTimeout(runAiLoop, 0);
      } else if (nextIsHuman) {
        // Straight to the pass-and-play gate — no lingering AI board
        // between the last AI's move and "it's your turn" (that in-between
        // beat read as awkward).
        setAiThinking(false);
        setHasDrawnBoth(false);
        setLastDrawnCardId(null);
        setAwaitingReveal(true);
      } else {
        // Hold on the finished turn so its result is legible before the
        // next AI's own "thinking…" beat.
        setTimeout(runAiLoop, AI_RESULT_HOLD_MS);
      }
    }, AI_TURN_DELAY_MS);
  }, [commit, setHasDrawnBoth, emitFlight]);

  const startNewGame = useCallback(
    (configs: PlayerConfig[], contracts?: ContractRequirement[], trackStats: boolean = true) => {
      isTutorialRef.current = false;
      setIsTutorial(false);
      isDailyDealRef.current = false;
      setIsDailyDeal(false);
      isWeeklyChallengeRef.current = false;
      setIsWeeklyChallenge(false);
      setTutorialSoundOverride(false);
      clearUndoState();
      setTrackStatsBoth(trackStats);
      // Doesn't need to be secret, only reproducible — a server-side replay
      // rebuilds the identical deal from this same integer (see deck.ts's
      // roundSeed and GameOverScreen's verification payload).
      const seed = Math.floor(Math.random() * 2 ** 31);
      gameSeedRef.current = seed;
      moveLogRef.current = [];
      const state = createGame(configs, contracts, seededRng(roundSeed(seed, 1)));
      stateRef.current = state;
      setSnapshot({ ...state });
      setHasDrawnBoth(false);
      setAwaitingReveal(!state.players[state.currentPlayerIndex].isAI);
      setAiThinking(false);
      setRoundStartScoresBoth(Object.fromEntries(state.players.map((p) => [p.id, p.cumulativeScore])));
      recordedRoundsRef.current = new Set();
      roundHistoryRef.current = [];
      setRoundHistory([]);
      setLastDrawnCardId(null);
      setBuyOffer(null);
      buyQueueRef.current = [];

      // Fresh game — reset achievement progress and record table composition
      // up front, since it's known now and won't change for the rest of the
      // game (only relevant if YOU are actually seated, per YOU_PLAYER_ID).
      sessionCountersRef.current = {};
      if (state.players.some((p) => p.id === YOU_PLAYER_ID)) {
        applyDeltas(tableCompositionDeltas(configs));
      }

      const humans = configs.filter((c) => !c.isAI).length;
      const aiConfigs = configs.filter((c) => c.isAI);
      track("game_started", {
        mode: humans > 1 ? "pass" : "solo",
        players: configs.length,
        ais: aiConfigs.length,
        difficulty: aiConfigs[0]?.difficulty ?? "none",
        rounds: (contracts ?? []).length || 7,
      });

      persist();
      if (state.players[state.currentPlayerIndex].isAI) {
        runAiLoop();
      }
    },
    [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth, applyDeltas, clearUndoState, setTrackStatsBoth]
  );

  const startTutorialGame = useCallback(() => {
    isTutorialRef.current = true;
    setIsTutorial(true);
    isDailyDealRef.current = false;
    setIsDailyDeal(false);
    isWeeklyChallengeRef.current = false;
    setIsWeeklyChallenge(false);
    setTutorialSoundOverride(true);
    clearUndoState();
    // Irrelevant either way — isTutorialRef alone already fully gates every
    // Supabase write RoundSummary/GameOverScreen make — but reset to the
    // default so nothing looks inconsistent if this were ever inspected
    // mid-tutorial.
    setTrackStatsBoth(true);
    gameSeedRef.current = null;
    moveLogRef.current = [];
    const state = createTutorialGame();
    stateRef.current = state;
    setSnapshot({ ...state });
    setHasDrawnBoth(false);
    setAwaitingReveal(false); // the tutorial narrates the pass-gate itself, see game/page.tsx
    setAiThinking(false);
    setRoundStartScoresBoth(Object.fromEntries(state.players.map((p) => [p.id, p.cumulativeScore])));
    recordedRoundsRef.current = new Set();
    roundHistoryRef.current = [];
    setRoundHistory([]);
    setLastDrawnCardId(null);
    setBuyOffer(null);
    buyQueueRef.current = [];
    sessionCountersRef.current = {};
    track("game_started", { mode: "tutorial", players: 2, ais: 1, difficulty: "beginner", rounds: 1 });
    // No persist() — see the isTutorialRef guard at the top of persist().
  }, [setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState, setTrackStatsBoth]);

  const startDailyDeal = useCallback(() => {
    isTutorialRef.current = false;
    setIsTutorial(false);
    isDailyDealRef.current = true;
    setIsDailyDeal(true);
    isWeeklyChallengeRef.current = false;
    setIsWeeklyChallenge(false);
    setTutorialSoundOverride(false);
    clearUndoState();
    // Irrelevant either way — isDailyDealRef alone already fully gates every
    // Supabase write RoundSummary/GameOverScreen make, same as isTutorialRef
    // — but reset to the default so nothing looks inconsistent if this were
    // ever inspected mid-game.
    setTrackStatsBoth(true);
    // Same date-derived seed createDailyDealGame already deals from
    // internally — recomputed here (not returned by that function) since
    // it's a pure function of today's date, cheap to redo, and this is the
    // only other place that needs it.
    gameSeedRef.current = dateSeed(localDateKey());
    moveLogRef.current = [];
    const state = createDailyDealGame();
    stateRef.current = state;
    setSnapshot({ ...state });
    setHasDrawnBoth(false);
    setAwaitingReveal(!state.players[state.currentPlayerIndex].isAI);
    setAiThinking(false);
    setRoundStartScoresBoth(Object.fromEntries(state.players.map((p) => [p.id, p.cumulativeScore])));
    recordedRoundsRef.current = new Set();
    roundHistoryRef.current = [];
    setRoundHistory([]);
    setLastDrawnCardId(null);
    setBuyOffer(null);
    buyQueueRef.current = [];
    sessionCountersRef.current = {};
    track("game_started", { mode: "daily", players: state.players.length, ais: state.players.length - 1, difficulty: "mixed", rounds: 1 });
    // A fresh deal always replaces whatever in-progress one was there —
    // this is a deliberate restart (see continueDailyDeal for resuming
    // instead), so any stale save shouldn't linger under it.
    persist();
    if (state.players[state.currentPlayerIndex].isAI) {
      runAiLoop();
    }
  }, [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState, setTrackStatsBoth]);

  const continueDailyDeal = useCallback(() => {
    const saved = loadDailyDealSave();
    if (!saved) return;
    isTutorialRef.current = false;
    setIsTutorial(false);
    isDailyDealRef.current = true;
    setIsDailyDeal(true);
    isWeeklyChallengeRef.current = false;
    setIsWeeklyChallenge(false);
    setTutorialSoundOverride(false);
    clearUndoState();
    setTrackStatsBoth(saved.trackStats ?? true);
    // A resumed Daily Deal is still today's deal (its save is same-day
    // only — see loadDailyDealSave/DAILY_DEAL_SAVE_KEY), so re-derive the
    // same date seed rather than trust a persisted one.
    gameSeedRef.current = dateSeed(localDateKey());
    moveLogRef.current = saved.moveLog ?? [];
    stateRef.current = saved.state;
    setSnapshot({ ...saved.state });
    setHasDrawnBoth(saved.hasDrawn);
    setAiThinking(false);
    setRoundStartScoresBoth(saved.roundStartScores);
    roundHistoryRef.current = saved.roundHistory;
    setRoundHistory(saved.roundHistory);
    recordedRoundsRef.current = new Set(saved.roundHistory.map((r) => r.round));
    setLastDrawnCardId(null);
    setBuyOffer(null);
    buyQueueRef.current = [];
    sessionCountersRef.current = saved.sessionCounters ?? {};

    const current = saved.state.players[saved.state.currentPlayerIndex];
    if (!saved.state.roundOver && !saved.state.gameOver && current.isAI) {
      runAiLoop();
    } else {
      setAwaitingReveal(true);
    }
  }, [runAiLoop, setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState, setTrackStatsBoth]);

  const startWeeklyChallenge = useCallback(() => {
    isTutorialRef.current = false;
    setIsTutorial(false);
    isDailyDealRef.current = false;
    setIsDailyDeal(false);
    isWeeklyChallengeRef.current = true;
    setIsWeeklyChallenge(true);
    setTutorialSoundOverride(false);
    clearUndoState();
    setTrackStatsBoth(true);
    // Same week-derived seed createWeeklyChallengeGame deals from
    // internally — recomputed here for the same reason startDailyDeal
    // recomputes its own date seed (cheap, pure, the only other place that
    // needs it).
    gameSeedRef.current = weekSeed(isoWeekKey());
    moveLogRef.current = [];
    const state = createWeeklyChallengeGame();
    stateRef.current = state;
    setSnapshot({ ...state });
    setHasDrawnBoth(false);
    setAwaitingReveal(!state.players[state.currentPlayerIndex].isAI);
    setAiThinking(false);
    setRoundStartScoresBoth(Object.fromEntries(state.players.map((p) => [p.id, p.cumulativeScore])));
    recordedRoundsRef.current = new Set();
    roundHistoryRef.current = [];
    setRoundHistory([]);
    setLastDrawnCardId(null);
    setBuyOffer(null);
    buyQueueRef.current = [];
    sessionCountersRef.current = {};
    track("game_started", {
      mode: "weekly",
      players: state.players.length,
      ais: state.players.length - 1,
      difficulty: "hard",
      rounds: state.selectedContracts.length,
    });
    // Same reasoning as startDailyDeal — a fresh deal is a deliberate
    // restart, so any stale save shouldn't linger under it.
    persist();
    if (state.players[state.currentPlayerIndex].isAI) {
      runAiLoop();
    }
  }, [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState, setTrackStatsBoth]);

  const continueWeeklyChallenge = useCallback(() => {
    const saved = loadWeeklyChallengeSave();
    if (!saved) return;
    isTutorialRef.current = false;
    setIsTutorial(false);
    isDailyDealRef.current = false;
    setIsDailyDeal(false);
    isWeeklyChallengeRef.current = true;
    setIsWeeklyChallenge(true);
    setTutorialSoundOverride(false);
    clearUndoState();
    setTrackStatsBoth(saved.trackStats ?? true);
    // A resumed Weekly Challenge is still this week's challenge (its save
    // is same-week only — see loadWeeklyChallengeSave), so re-derive the
    // same week seed rather than trust a persisted one.
    gameSeedRef.current = weekSeed(isoWeekKey());
    moveLogRef.current = saved.moveLog ?? [];
    stateRef.current = saved.state;
    setSnapshot({ ...saved.state });
    setHasDrawnBoth(saved.hasDrawn);
    setAiThinking(false);
    setRoundStartScoresBoth(saved.roundStartScores);
    roundHistoryRef.current = saved.roundHistory;
    setRoundHistory(saved.roundHistory);
    recordedRoundsRef.current = new Set(saved.roundHistory.map((r) => r.round));
    setLastDrawnCardId(null);
    setBuyOffer(null);
    buyQueueRef.current = [];
    sessionCountersRef.current = saved.sessionCounters ?? {};

    const current = saved.state.players[saved.state.currentPlayerIndex];
    if (!saved.state.roundOver && !saved.state.gameOver && current.isAI) {
      runAiLoop();
    } else {
      setAwaitingReveal(true);
    }
  }, [runAiLoop, setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState, setTrackStatsBoth]);

  const continueGame = useCallback(() => {
    const saved = loadSavedGame();
    if (!saved) return;
    // Defensive: a saved game is always real (persist() never runs during a
    // tutorial, Daily Deal, or Weekly Challenge), so make sure no stale flag
    // survives from one of those getting abandoned without going through
    // quitToHome/startNewGame.
    isTutorialRef.current = false;
    setIsTutorial(false);
    isDailyDealRef.current = false;
    setIsDailyDeal(false);
    isWeeklyChallengeRef.current = false;
    setIsWeeklyChallenge(false);
    setTutorialSoundOverride(false);
    clearUndoState();
    setTrackStatsBoth(saved.trackStats ?? true);
    // Absent on a pre-existing save from before this field shipped — that
    // one game just stays unverifiable and skips recording entirely at
    // game-over (see GameOverScreen's attemptSave), same as gameSeedRef
    // defaulting to null everywhere else.
    gameSeedRef.current = saved.seed ?? null;
    moveLogRef.current = saved.moveLog ?? [];
    stateRef.current = saved.state;
    setSnapshot({ ...saved.state });
    setHasDrawnBoth(saved.hasDrawn);
    setAiThinking(false);
    setRoundStartScoresBoth(saved.roundStartScores);
    roundHistoryRef.current = saved.roundHistory;
    setRoundHistory(saved.roundHistory);
    recordedRoundsRef.current = new Set(saved.roundHistory.map((r) => r.round));
    setLastDrawnCardId(null);
    setBuyOffer(null);
    buyQueueRef.current = [];
    sessionCountersRef.current = saved.sessionCounters ?? {};

    const current = saved.state.players[saved.state.currentPlayerIndex];
    if (!saved.state.roundOver && !saved.state.gameOver && current.isAI) {
      runAiLoop();
    } else {
      setAwaitingReveal(true);
    }
  }, [runAiLoop, setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState, setTrackStatsBoth]);

  // Tapping through the pass-and-play "your turn — tap to see your hand"
  // gate (or the solo game's own first reveal) fans the hand out — the same
  // sweep sound sortHand/reorderHand use, since it's literally the same
  // "cards spreading across the table" motion.
  const revealHand = useCallback(() => {
    setAwaitingReveal(false);
    playCardSlide();
    hapticLight();
  }, []);

  const draw = useCallback(
    (fromDiscard: boolean) => {
      const s = stateRef.current;
      // Guard on the ref, not the `hasDrawn` state: a burst of taps on the
      // draw pile fires several synchronous calls before React re-renders
      // (and before the button's `disabled={hasDrawn}` takes effect), and
      // the state closure is stale `false` for every one of them. The ref is
      // flipped synchronously by setHasDrawnBoth (line below, and it runs to
      // completion before the next tap's handler starts), so call 2+ bail.
      if (!s || hasDrawnRef.current) return;
      clearUndoState();
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;

      let card: Card | null;
      let actuallyFromDiscard = false;
      if (fromDiscard) {
        const got = drawFromDiscard(s);
        if (got) {
          card = got;
          actuallyFromDiscard = true;
        } else {
          card = drawFromPile(s);
        }
      } else {
        card = drawFromPile(s);
      }

      // Logged even when the draw comes back null below — a replay needs
      // to know a draw was attempted here at all, since that's the only
      // thing that tells it to call the same drawFromPile/drawFromDiscard
      // that (when the piles are truly exhausted) ends the round itself as
      // a side effect, with no further entry to signal it.
      moveLogRef.current = [
        ...moveLogRef.current,
        { seat: s.currentPlayerIndex, type: "draw", fromDiscard: actuallyFromDiscard },
      ];

      // Null means the draw/discard piles were truly both exhausted —
      // drawFromPile already ended the round itself (see gameEngine.ts).
      // Nothing left to draw, so nothing to react to here except syncing
      // the now-ended round to the UI.
      if (!card) {
        commit();
        return;
      }

      if (isYou) applyDeltas(drawDeltas(card, actuallyFromDiscard));

      setLastDrawnCardId(card.id);
      setHasDrawnBoth(true);
      emitFlight({ kind: "draw", card, fromDiscard: actuallyFromDiscard, byId: player.id });
      playCardTap();
      hapticLight();
      commit();
    },
    [commit, setHasDrawnBoth, applyDeltas, clearUndoState, emitFlight]
  );

  const sortHand = useCallback(
    (mode: SortMode) => {
      const s = stateRef.current;
      if (!s) return;
      clearUndoState();
      const player = s.players[s.currentPlayerIndex];
      player.hand = [...player.hand].sort(compareByMode(mode));
      playCardSlide();
      hapticLight();
      commit();
    },
    [commit, clearUndoState]
  );

  /**
   * Applies a player-chosen order to a subset of their hand (typically all
   * of it, but excludes cards currently staged into a pending meld group).
   * Cards not named in cardIdsInOrder keep their existing slot in the full
   * hand array — only the named cards' relative order changes.
   */
  const reorderHand = useCallback(
    (cardIdsInOrder: string[]) => {
      const s = stateRef.current;
      if (!s) return;
      clearUndoState();
      const player = s.players[s.currentPlayerIndex];
      player.hand = applyHandOrder(player.hand, cardIdsInOrder);
      playCardSlide();
      hapticLight();
      commit();
    },
    [commit, clearUndoState]
  );

  const confirmMeld = useCallback(
    (groups: string[][], preferredRunStarts?: (number | undefined)[]) => {
      const s = stateRef.current;
      if (!s || !hasDrawnRef.current) return false;
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;
      const contract = s.selectedContracts[s.round - 1];
      // Snapshot before mutating — armed as an undo option below only if
      // this meld doesn't also end the round (see UndoSnapshot's comment).
      const preActionState = structuredClone(s);
      const preActionCounters = { ...sessionCountersRef.current };
      const preActionMoveLogLength = moveLogRef.current.length;
      const melds = meldChosenGroups(s, groups, preferredRunStarts);
      if (!melds) return false;
      moveLogRef.current = [
        ...moveLogRef.current,
        { seat: s.currentPlayerIndex, type: "meldGroups", groups, preferredRunStarts },
      ];

      if (isYou) applyDeltas(meldDeltas(melds, contract));

      // finishIfWentOut only ever ends the round by declaring *this* current
      // player the round's winner (see endRound(state, player.id) inside
      // it) — wentOut being true already means "you just won this round."
      // state.winnerId is a different thing entirely: the whole *game's*
      // winner, which endRound only ever sets on the final round (see its
      // own comment) — checking it here meant these counters could only
      // ever bump on whichever round happened to be the game's last one.
      const wentOut = finishIfWentOut(s);
      // finishIfWentOut's own discardAndAdvance(s, "") call is a real state
      // change a replay must also make at exactly this point — same
      // "cardId: null" shape as playAITurn's round-7 auto-out entry.
      if (wentOut) {
        moveLogRef.current = [...moveLogRef.current, { seat: s.currentPlayerIndex, type: "discard", cardId: null }];
      }
      if (isYou && wentOut) applyDeltas(roundWonDeltas(contract, false));
      playMeld();
      hapticMedium();
      emitFlight({ kind: "meld", cards: melds.flatMap((m) => m.cards), byId: player.id, isAI: false });
      if (!wentOut) {
        armUndo({ state: preActionState, sessionCounters: preActionCounters, moveLogLength: preActionMoveLogLength });
      }
      commit();
      return true;
    },
    [commit, applyDeltas, armUndo, emitFlight]
  );

  const layOff = useCallback(
    (cardId: string, meldId: string, position?: "low" | "high") => {
      const s = stateRef.current;
      if (!s || !hasDrawnRef.current) return false;
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;
      const card = player.hand.find((c) => c.id === cardId);
      const meld = s.melds.find((m) => m.id === meldId);
      const wasAmbiguous = !!(card && meld && layOffOptions(card, meld).length === 2);
      // See the identical snapshot in confirmMeld — same reasoning applies.
      const preActionState = structuredClone(s);
      const preActionCounters = { ...sessionCountersRef.current };
      const preActionMoveLogLength = moveLogRef.current.length;

      const ok = layOffCard(s, cardId, meldId, position);
      if (ok) {
        moveLogRef.current = [...moveLogRef.current, { seat: s.currentPlayerIndex, type: "layOff", cardId, meldId, position }];
        if (isYou && card && meld) applyDeltas(layOffDeltas(card, meld, player.id, wasAmbiguous));
        // See the identical comment in confirmMeld — wentOut alone already
        // means you won this round; state.winnerId is the game's overall
        // winner, a different and unrelated thing.
        const wentOut = finishIfWentOut(s);
        // See the identical note in confirmMeld — finishIfWentOut's own
        // discardAndAdvance(s, "") call is a real state change a replay
        // must also make at exactly this point.
        if (wentOut) {
          moveLogRef.current = [...moveLogRef.current, { seat: s.currentPlayerIndex, type: "discard", cardId: null }];
        }
        if (isYou && wentOut) {
          const contract = s.selectedContracts[s.round - 1];
          applyDeltas(roundWonDeltas(contract, false));
        }
        playCardTap();
        hapticLight();
        if (card) emitFlight({ kind: "layoff", card, meldId, byId: player.id, isAI: false });
        if (!wentOut) {
          armUndo({ state: preActionState, sessionCounters: preActionCounters, moveLogLength: preActionMoveLogLength });
        }
        commit();
      }
      return ok;
    },
    [commit, applyDeltas, armUndo, emitFlight]
  );

  /**
   * Advances the pending "buy the discard" queue after a discard, in turn
   * order: AI candidates decide immediately via a quick heuristic and are
   * skipped over if they pass; the first human candidate reached pauses the
   * flow (via buyOffer) until they respond. Once the queue empties with no
   * takers, or someone buys, hands off to the normal next-player turn flow.
   */
  const advanceBuyQueue = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    while (buyQueueRef.current.length > 0) {
      const candidateId = buyQueueRef.current.shift()!;
      const candidate = s.players.find((p) => p.id === candidateId);
      if (!candidate) continue;
      if (candidate.isAI) {
        if (aiWantsToBuyDiscard(s, candidate)) {
          buyDiscard(s, candidate.id);
          commit();
          setBuyOffer(null);
          runAiLoop();
          return;
        }
        continue;
      }
      const topCard = s.discardPile[s.discardPile.length - 1];
      setBuyOffer({ playerId: candidate.id, playerName: candidate.name, card: topCard });
      return;
    }
    setBuyOffer(null);
    runAiLoop();
  }, [commit, runAiLoop]);

  const respondToBuy = useCallback(
    (accept: boolean) => {
      const s = stateRef.current;
      if (!s || !buyOffer) return;
      if (accept) {
        buyDiscard(s, buyOffer.playerId);
        commit();
        setBuyOffer(null);
        runAiLoop();
        return;
      }
      setBuyOffer(null);
      advanceBuyQueue();
    },
    [buyOffer, commit, runAiLoop, advanceBuyQueue]
  );

  const discard = useCallback(
    (cardId: string) => {
      const s = stateRef.current;
      // Ref, not state — same rapid-tap reasoning as draw(). After the first
      // discard flips it false (setHasDrawnBoth below), a second synchronous
      // call bails here instead of re-running discardAndAdvance / the AI loop.
      if (!s || !hasDrawnRef.current) return;
      clearUndoState();
      const seat = s.currentPlayerIndex;
      const player = s.players[seat];
      const isYou = player.id === YOU_PLAYER_ID;
      const discarded = player.hand.find((c) => c.id === cardId);
      // discardAndAdvance advances currentPlayerIndex to the next player
      // before returning (when the round doesn't end) — captured above so
      // the logged seat is always whoever actually discarded, not whoever's
      // turn it becomes next. wasAutoOut mirrors discardAndAdvance's own
      // "already empty-handed after melding" guard: that path ends the
      // round with no card found (`discarded` stays undefined) but still
      // did something real, unlike a genuinely invalid cardId.
      const wasAutoOut = player.hasMeldedContract && player.hand.length === 0;

      const roundEnded = discardAndAdvance(s, cardId);
      if (discarded || wasAutoOut) {
        moveLogRef.current = [...moveLogRef.current, { seat, type: "discard", cardId: discarded ? cardId : null }];
      }
      if (discarded) emitFlight({ kind: "discard", card: discarded, byId: player.id, isAI: false });
      if (isYou) {
        applyDeltas(discardDeltas());
        // discardAndAdvance only ever ends the round for the player whose
        // turn it currently is (endRound(state, player.id) inside it) — see
        // the identical comment in confirmMeld/layOff for why this used to
        // check state.winnerId (the game's overall winner) instead, which
        // meant this could only ever fire on a game's actual last round —
        // impossible for "Just in Time" specifically, since the real final
        // round (3 Runs) never has a discard to trigger it with at all.
        if (roundEnded) applyDeltas(roundWonDeltas(s.selectedContracts[s.round - 1], true));
      }
      playCardTap();
      hapticLight();
      commit();
      setHasDrawnBoth(false);
      setLastDrawnCardId(null);
      if (!s.roundOver && !s.gameOver) {
        setAwaitingReveal(false);
        const buyers = BUY_DISCARD_ENABLED ? eligibleBuyers(s) : [];
        if (buyers.length > 0) {
          buyQueueRef.current = buyers.map((p) => p.id);
          advanceBuyQueue();
        } else {
          runAiLoop();
        }
      }
    },
    [commit, runAiLoop, setHasDrawnBoth, advanceBuyQueue, applyDeltas, clearUndoState, emitFlight]
  );

  const advanceRound = useCallback(() => {
    const s = stateRef.current;
    if (!s || !s.roundOver) return;
    clearUndoState();
    const seed = gameSeedRef.current;
    const rng = seed != null ? seededRng(roundSeed(seed, s.round + 1)) : undefined;
    const next = startNextRound(s, rng);
    stateRef.current = next;
    setSnapshot({ ...next });
    setHasDrawnBoth(false);
    setAwaitingReveal(false);
    setLastDrawnCardId(null);
    setBuyOffer(null);
    buyQueueRef.current = [];
    setRoundStartScoresBoth(Object.fromEntries(next.players.map((p) => [p.id, p.cumulativeScore])));
    persist();
    if (next.players[next.currentPlayerIndex].isAI) {
      runAiLoop();
    } else {
      setAwaitingReveal(true);
    }
  }, [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState]);

  const quitToHome = useCallback(() => {
    clearUndoState();
    const wasTutorial = isTutorialRef.current;
    const wasDailyDeal = isDailyDealRef.current;
    const wasWeeklyChallenge = isWeeklyChallengeRef.current;
    stateRef.current = null;
    setSnapshot(null);
    setHasDrawnBoth(false);
    setAwaitingReveal(false);
    setAiThinking(false);
    setBuyOffer(null);
    buyQueueRef.current = [];
    isTutorialRef.current = false;
    setIsTutorial(false);
    isDailyDealRef.current = false;
    setIsDailyDeal(false);
    isWeeklyChallengeRef.current = false;
    setIsWeeklyChallenge(false);
    setTutorialSoundOverride(false);
    setTrackStatsBoth(true);
    if (wasTutorial || wasDailyDeal || wasWeeklyChallenge) {
      // None of the tutorial, a Daily Deal, or a Weekly Challenge ever
      // touched the real saved-game slot (persist() no-ops during all
      // three) — restore whatever was really there instead of wiping it.
      setHasSavedGame(loadSavedGame() !== null);
    } else {
      clearSavedGame();
      setHasSavedGame(false);
    }
  }, [setHasDrawnBoth, clearUndoState, setTrackStatsBoth]);

  const value = useMemo<GameContextValue>(
    () => ({
      state: snapshot,
      hasDrawn,
      awaitingReveal,
      aiThinking,
      hasSavedGame,
      roundStartScores,
      roundHistory,
      lastDrawnCardId,
      flightEvent,
      buyOffer,
      startNewGame,
      startTutorialGame,
      isTutorial,
      startDailyDeal,
      isDailyDeal,
      startWeeklyChallenge,
      isWeeklyChallenge,
      trackStats,
      continueGame,
      continueDailyDeal,
      continueWeeklyChallenge,
      revealHand,
      draw,
      confirmMeld,
      layOff,
      discard,
      sortHand,
      reorderHand,
      respondToBuy,
      advanceRound,
      quitToHome,
      getSessionCounters,
      clearSessionCounters,
      getSeed,
      getMoveLog,
      canUndo,
      undoExpiresAt,
      undoLastAction,
    }),
    [
      snapshot,
      hasDrawn,
      awaitingReveal,
      aiThinking,
      hasSavedGame,
      roundStartScores,
      roundHistory,
      lastDrawnCardId,
      flightEvent,
      buyOffer,
      startNewGame,
      startTutorialGame,
      isTutorial,
      startDailyDeal,
      isDailyDeal,
      startWeeklyChallenge,
      isWeeklyChallenge,
      trackStats,
      continueGame,
      continueDailyDeal,
      continueWeeklyChallenge,
      revealHand,
      draw,
      confirmMeld,
      layOff,
      discard,
      sortHand,
      reorderHand,
      respondToBuy,
      advanceRound,
      quitToHome,
      getSessionCounters,
      clearSessionCounters,
      getSeed,
      getMoveLog,
      canUndo,
      undoExpiresAt,
      undoLastAction,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within a GameProvider");
  return ctx;
}
