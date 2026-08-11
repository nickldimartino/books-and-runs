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
import { Card, ContractRequirement, GameState } from "@/types";
import { RoundHistoryEntry } from "./lib/recordGameResult";
import { clearSavedGame, loadSavedGame, saveGame } from "./lib/localSave";
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
  continueGame: () => void;
  revealHand: () => void;
  draw: (fromDiscard: boolean) => void;
  confirmMeld: (groups: string[][]) => boolean;
  layOff: (cardId: string, meldId: string, position?: "low" | "high") => boolean;
  discard: (cardId: string) => void;
  sortHand: (mode: SortMode) => void;
  reorderHand: (cardIdsInOrder: string[]) => void;
  respondToBuy: (accept: boolean) => void;
  advanceRound: () => void;
  quitToHome: () => void;
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

// Ace sorts high (after King), never low — wilds (2s and jokers) are always
// bucketed to the end separately below, so their position here is moot; this
// only governs where a natural Ace lands, and low would put it awkwardly
// next to the wild bucket (since natural "2"s don't exist to sit between).
const RANK_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "JOKER"];
const SUIT_ORDER = ["hearts", "diamonds", "clubs", "spades", "joker"];

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
 */
function finishIfWentOut(s: GameState) {
  const player = s.players[s.currentPlayerIndex];
  if (player.hasMeldedContract && player.hand.length === 0) {
    discardAndAdvance(s, "");
  }
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
  const buyQueueRef = useRef<string[]>([]);
  const recordedRoundsRef = useRef<Set<number>>(new Set());

  // Refs mirror the persistence-relevant state synchronously, so commit()
  // can always write a consistent snapshot without waiting on React's
  // (possibly-batched, possibly-stale-by-a-tick) state updates.
  const hasDrawnRef = useRef(false);
  const roundStartScoresRef = useRef<Record<string, number>>({});
  const roundHistoryRef = useRef<RoundHistoryEntry[]>([]);

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
    });
    setHasSavedGame(true);
  }, []);

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
      persist();
      if (state.players[state.currentPlayerIndex].isAI) {
        runAiLoop();
      }
    },
    [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth]
  );

  const continueGame = useCallback(() => {
    const saved = loadSavedGame();
    if (!saved) return;
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

    const current = saved.state.players[saved.state.currentPlayerIndex];
    if (!saved.state.roundOver && !saved.state.gameOver && current.isAI) {
      runAiLoop();
    } else {
      setAwaitingReveal(true);
    }
  }, [runAiLoop, setHasDrawnBoth, setRoundStartScoresBoth]);

  const revealHand = useCallback(() => setAwaitingReveal(false), []);

  const draw = useCallback(
    (fromDiscard: boolean) => {
      const s = stateRef.current;
      if (!s || hasDrawn) return;
      let card;
      if (fromDiscard) {
        card = drawFromDiscard(s) ?? drawFromPile(s);
      } else {
        card = drawFromPile(s);
      }
      setLastDrawnCardId(card.id);
      setHasDrawnBoth(true);
      commit();
    },
    [hasDrawn, commit, setHasDrawnBoth]
  );

  const sortHand = useCallback(
    (mode: SortMode) => {
      const s = stateRef.current;
      if (!s) return;
      const player = s.players[s.currentPlayerIndex];
      player.hand = [...player.hand].sort(mode === "rank" ? compareByRank : compareBySuit);
      commit();
    },
    [commit]
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
      const player = s.players[s.currentPlayerIndex];
      const orderIndex = new Map(cardIdsInOrder.map((id, i) => [id, i]));
      const reordered = player.hand
        .filter((c) => orderIndex.has(c.id))
        .sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);
      let i = 0;
      player.hand = player.hand.map((c) => (orderIndex.has(c.id) ? reordered[i++] : c));
      commit();
    },
    [commit]
  );

  const confirmMeld = useCallback(
    (groups: string[][]) => {
      const s = stateRef.current;
      if (!s || !hasDrawn) return false;
      const melds = meldChosenGroups(s, groups);
      if (!melds) return false;
      finishIfWentOut(s);
      commit();
      return true;
    },
    [hasDrawn, commit]
  );

  const layOff = useCallback(
    (cardId: string, meldId: string, position?: "low" | "high") => {
      const s = stateRef.current;
      if (!s || !hasDrawn) return false;
      const ok = layOffCard(s, cardId, meldId, position);
      if (ok) {
        finishIfWentOut(s);
        commit();
      }
      return ok;
    },
    [hasDrawn, commit]
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
      discardAndAdvance(s, cardId);
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
    [hasDrawn, commit, runAiLoop, setHasDrawnBoth, advanceBuyQueue]
  );

  const advanceRound = useCallback(() => {
    const s = stateRef.current;
    if (!s || !s.roundOver) return;
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
  }, [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth]);

  const quitToHome = useCallback(() => {
    stateRef.current = null;
    setSnapshot(null);
    setHasDrawnBoth(false);
    setAwaitingReveal(false);
    setAiThinking(false);
    setBuyOffer(null);
    buyQueueRef.current = [];
    clearSavedGame();
    setHasSavedGame(false);
  }, [setHasDrawnBoth]);

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
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within a GameProvider");
  return ctx;
}
