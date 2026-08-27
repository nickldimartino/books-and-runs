"use client";

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
import { Card, ContractRequirement, GameState } from "@/types";
import { createTutorialGame } from "@/tutorial";
import { RoundHistoryEntry, YOU_PLAYER_ID } from "./lib/recordGameResult";
import { clearSavedGame, loadSavedGame, saveGame } from "./lib/localSave";
import { playCardSlide, playCardTap, playMeld, setTutorialSoundOverride } from "./lib/sound";
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

interface GameContextValue {
  state: GameState | null;
  hasDrawn: boolean;
  awaitingReveal: boolean;
  aiThinking: boolean;
  hasSavedGame: boolean;
  roundStartScores: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
  lastDrawnCardId: string | null;
  buyOffer: BuyOffer | null;
  startNewGame: (configs: PlayerConfig[], contracts?: ContractRequirement[]) => void;
  /** A fixed, scripted 1-vs-1 practice round (see src/tutorial.ts) — never
   * touches the real saved-game slot, Supabase stats, or achievements. */
  startTutorialGame: () => void;
  isTutorial: boolean;
  continueGame: () => void;
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

const AI_TURN_DELAY_MS = 550;

// How long a confirmMeld/layOff stays undoable before the grace window
// silently expires — long enough to catch an immediate "oops, wrong meld"
// without turning into a real move-history/redo feature.
const UNDO_GRACE_MS = 6000;

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
}

// Ace sorts high (after King), never low — wilds (2s and jokers) are always
// bucketed to the end separately below, so their position here is moot; this
// only governs where a natural Ace lands, and low would put it awkwardly
// next to the wild bucket (since natural "2"s don't exist to sit between).
const RANK_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "JOKER"];
// Alternates red/black so adjacent suits never share a color — easier to
// scan than grouping both reds together, then both blacks.
const SUIT_ORDER = ["hearts", "spades", "diamonds", "clubs", "joker"];

export type SortMode = "suit" | "rank";

/** Groups same-suit cards together, in sequence — good for spotting runs. */
function compareBySuit(a: Card, b: Card): number {
  if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
  const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
}

/** Groups same-rank cards together — good for spotting books. */
function compareByRank(a: Card, b: Card): number {
  if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
  const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  if (rankDiff !== 0) return rankDiff;
  return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
}

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
  const [buyOffer, setBuyOffer] = useState<BuyOffer | null>(null);
  const [isTutorial, setIsTutorial] = useState(false);
  // Mirrors isTutorial for use inside stable callbacks (persist, quitToHome)
  // that can't take a reactive dependency on it without breaking memoization.
  const isTutorialRef = useRef(false);
  const buyQueueRef = useRef<string[]>([]);
  const recordedRoundsRef = useRef<Set<number>>(new Set());

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
  const getSessionCounters = useCallback(() => sessionCountersRef.current, []);

  // See UndoSnapshot's own comment for exactly what this does and doesn't
  // cover. canUndo is the only piece of this that needs to be reactive (for
  // the UI to show/hide the Undo control) — the snapshot and its expiry
  // timer live in refs, mutated directly, same as every other ref in this
  // provider that a callback needs to read/write outside a render.
  const [canUndo, setCanUndo] = useState(false);
  const undoSnapshotRef = useRef<UndoSnapshot | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHasSavedGame(loadSavedGame() !== null);
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
    // the real saved-game slot, in either direction. Whatever real save
    // existed before the tutorial started is left completely alone.
    if (isTutorialRef.current) return;
    const s = stateRef.current;
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
  }, []);

  const armUndo = useCallback(
    (snapshot: UndoSnapshot) => {
      undoSnapshotRef.current = snapshot;
      setCanUndo(true);
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
    clearUndoState();
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
      playAITurn(live);
      commit();
      runAiLoop();
    }, AI_TURN_DELAY_MS);
  }, [commit, setHasDrawnBoth]);

  const startNewGame = useCallback(
    (configs: PlayerConfig[], contracts?: ContractRequirement[]) => {
      isTutorialRef.current = false;
      setIsTutorial(false);
      setTutorialSoundOverride(false);
      clearUndoState();
      const state = createGame(configs, contracts);
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
        const humanCount = configs.filter((c) => !c.isAI).length;
        if (humanCount >= 2) bump("pass_and_play_games");
        if (humanCount === 1) bump("solo_vs_ai_games");
        if (configs.length >= 6) bump("large_table_games");
      }

      persist();
      if (state.players[state.currentPlayerIndex].isAI) {
        runAiLoop();
      }
    },
    [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth, bump, clearUndoState]
  );

  const startTutorialGame = useCallback(() => {
    isTutorialRef.current = true;
    setIsTutorial(true);
    setTutorialSoundOverride(true);
    clearUndoState();
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
    // No persist() — see the isTutorialRef guard at the top of persist().
  }, [setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState]);

  const continueGame = useCallback(() => {
    const saved = loadSavedGame();
    if (!saved) return;
    // Defensive: a saved game is always real (persist() never runs during a
    // tutorial), so make sure no stale tutorial flag survives from an
    // earlier tutorial that got abandoned without going through
    // quitToHome/startNewGame.
    isTutorialRef.current = false;
    setIsTutorial(false);
    setTutorialSoundOverride(false);
    clearUndoState();
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
  }, [runAiLoop, setHasDrawnBoth, setRoundStartScoresBoth, clearUndoState]);

  const revealHand = useCallback(() => setAwaitingReveal(false), []);

  const draw = useCallback(
    (fromDiscard: boolean) => {
      const s = stateRef.current;
      if (!s || hasDrawn) return;
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

      // Null means the draw/discard piles were truly both exhausted —
      // drawFromPile already ended the round itself (see gameEngine.ts).
      // Nothing left to draw, so nothing to react to here except syncing
      // the now-ended round to the UI.
      if (!card) {
        commit();
        return;
      }

      if (isYou) {
        bump("turns_taken");
        bump(actuallyFromDiscard ? "cards_drawn_from_discard" : "cards_drawn_blind");
        if (card.isWild) bump("wilds_drawn");
        if (card.rank === "JOKER") bump("jokers_drawn");
      }

      setLastDrawnCardId(card.id);
      setHasDrawnBoth(true);
      playCardTap();
      hapticLight();
      commit();
    },
    [hasDrawn, commit, setHasDrawnBoth, bump, clearUndoState]
  );

  const sortHand = useCallback(
    (mode: SortMode) => {
      const s = stateRef.current;
      if (!s) return;
      clearUndoState();
      const player = s.players[s.currentPlayerIndex];
      player.hand = [...player.hand].sort(mode === "rank" ? compareByRank : compareBySuit);
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
      const orderIndex = new Map(cardIdsInOrder.map((id, i) => [id, i]));
      const reordered = player.hand
        .filter((c) => orderIndex.has(c.id))
        .sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);
      let i = 0;
      player.hand = player.hand.map((c) => (orderIndex.has(c.id) ? reordered[i++] : c));
      playCardSlide();
      hapticLight();
      commit();
    },
    [commit, clearUndoState]
  );

  const confirmMeld = useCallback(
    (groups: string[][], preferredRunStarts?: (number | undefined)[]) => {
      const s = stateRef.current;
      if (!s || !hasDrawn) return false;
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;
      const contract = s.selectedContracts[s.round - 1];
      // Snapshot before mutating — armed as an undo option below only if
      // this meld doesn't also end the round (see UndoSnapshot's comment).
      const preActionState = structuredClone(s);
      const preActionCounters = { ...sessionCountersRef.current };
      const melds = meldChosenGroups(s, groups, preferredRunStarts);
      if (!melds) return false;

      if (isYou) {
        bump(`completed_round_${contract.round}`);
        for (const m of melds) {
          const wildCount = m.cards.filter((c) => c.isWild).length;
          if (m.type === "book") {
            bump("books_melded");
            if (m.cards.length > contract.bookSize) bump("oversized_books_melded");
          } else {
            bump("runs_melded");
            if (m.cards.length > contract.runSize) bump("oversized_runs_melded");
          }
          if (wildCount > 0) bump("wilds_used_in_melds", wildCount);
          else bump("melds_with_zero_wilds");
        }
      }

      // finishIfWentOut only ever ends the round by declaring *this* current
      // player the round's winner (see endRound(state, player.id) inside
      // it) — wentOut being true already means "you just won this round."
      // state.winnerId is a different thing entirely: the whole *game's*
      // winner, which endRound only ever sets on the final round (see its
      // own comment) — checking it here meant these counters could only
      // ever bump on whichever round happened to be the game's last one.
      const wentOut = finishIfWentOut(s);
      if (isYou && wentOut) {
        bump("rounds_won");
        bump(contract.wholeHandMeld ? "rounds_won_final_round" : "rounds_won_no_discard");
      }
      playMeld();
      hapticMedium();
      if (!wentOut) armUndo({ state: preActionState, sessionCounters: preActionCounters });
      commit();
      return true;
    },
    [hasDrawn, commit, bump, armUndo]
  );

  const layOff = useCallback(
    (cardId: string, meldId: string, position?: "low" | "high") => {
      const s = stateRef.current;
      if (!s || !hasDrawn) return false;
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;
      const card = player.hand.find((c) => c.id === cardId);
      const meld = s.melds.find((m) => m.id === meldId);
      const wasAmbiguous = !!(card && meld && layOffOptions(card, meld).length === 2);
      // See the identical snapshot in confirmMeld — same reasoning applies.
      const preActionState = structuredClone(s);
      const preActionCounters = { ...sessionCountersRef.current };

      const ok = layOffCard(s, cardId, meldId, position);
      if (ok) {
        if (isYou && card && meld) {
          bump("cards_laid_off");
          if (card.isWild) bump("wilds_laid_off");
          if (meld.ownerId !== player.id) bump("laid_off_onto_opponent");
          if (wasAmbiguous) bump("ambiguous_wild_choices_made");
        }
        // See the identical comment in confirmMeld — wentOut alone already
        // means you won this round; state.winnerId is the game's overall
        // winner, a different and unrelated thing.
        const wentOut = finishIfWentOut(s);
        if (isYou && wentOut) {
          const contract = s.selectedContracts[s.round - 1];
          bump("rounds_won");
          bump(contract.wholeHandMeld ? "rounds_won_final_round" : "rounds_won_no_discard");
        }
        playCardTap();
        hapticLight();
        if (!wentOut) armUndo({ state: preActionState, sessionCounters: preActionCounters });
        commit();
      }
      return ok;
    },
    [hasDrawn, commit, bump, armUndo]
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
      if (!s || !hasDrawn) return;
      clearUndoState();
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;

      const roundEnded = discardAndAdvance(s, cardId);
      if (isYou) {
        bump("cards_discarded");
        // discardAndAdvance only ever ends the round for the player whose
        // turn it currently is (endRound(state, player.id) inside it) — see
        // the identical comment in confirmMeld/layOff for why this used to
        // check state.winnerId (the game's overall winner) instead, which
        // meant this could only ever fire on a game's actual last round —
        // impossible for "Just in Time" specifically, since the real final
        // round (3 Runs) never has a discard to trigger it with at all.
        if (roundEnded) {
          bump("rounds_won");
          bump("rounds_won_via_discard");
        }
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
    [hasDrawn, commit, runAiLoop, setHasDrawnBoth, advanceBuyQueue, bump, clearUndoState]
  );

  const advanceRound = useCallback(() => {
    const s = stateRef.current;
    if (!s || !s.roundOver) return;
    clearUndoState();
    const next = startNextRound(s);
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
    stateRef.current = null;
    setSnapshot(null);
    setHasDrawnBoth(false);
    setAwaitingReveal(false);
    setAiThinking(false);
    setBuyOffer(null);
    buyQueueRef.current = [];
    isTutorialRef.current = false;
    setIsTutorial(false);
    setTutorialSoundOverride(false);
    if (wasTutorial) {
      // The tutorial never touched the real saved-game slot (persist() no-ops
      // during it) — restore whatever was really there instead of wiping it.
      setHasSavedGame(loadSavedGame() !== null);
    } else {
      clearSavedGame();
      setHasSavedGame(false);
    }
  }, [setHasDrawnBoth, clearUndoState]);

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
      buyOffer,
      startNewGame,
      startTutorialGame,
      isTutorial,
      continueGame,
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
      canUndo,
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
      buyOffer,
      startNewGame,
      startTutorialGame,
      isTutorial,
      continueGame,
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
      canUndo,
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
