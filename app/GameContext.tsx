"use client";

import {
  attemptMeldContract,
  createGame,
  discardAndAdvance,
  drawFromDiscard,
  drawFromPile,
  layOffCard,
  PlayerConfig,
  startNextRound,
} from "@/gameEngine";
import { playAITurn } from "@/ai/index";
import { Card, GameState } from "@/types";
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

interface GameContextValue {
  state: GameState | null;
  hasDrawn: boolean;
  awaitingReveal: boolean;
  aiThinking: boolean;
  hasSavedGame: boolean;
  roundStartScores: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
  lastDrawnCardId: string | null;
  startNewGame: (configs: PlayerConfig[]) => void;
  continueGame: () => void;
  revealHand: () => void;
  draw: (fromDiscard: boolean) => void;
  attemptMeld: () => void;
  layOff: (cardId: string, meldId: string) => void;
  discard: (cardId: string) => void;
  sortHand: () => void;
  advanceRound: () => void;
  quitToHome: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const AI_TURN_DELAY_MS = 550;

const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "JOKER"];
const SUIT_ORDER = ["hearts", "diamonds", "clubs", "spades", "joker"];

function compareCards(a: Card, b: Card): number {
  if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
  const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
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
    (configs: PlayerConfig[]) => {
      const state = createGame(configs);
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

  const sortHand = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const player = s.players[s.currentPlayerIndex];
    player.hand = [...player.hand].sort(compareCards);
    commit();
  }, [commit]);

  const attemptMeld = useCallback(() => {
    const s = stateRef.current;
    if (!s || !hasDrawn) return;
    attemptMeldContract(s);
    commit();
  }, [hasDrawn, commit]);

  const layOff = useCallback(
    (cardId: string, meldId: string) => {
      const s = stateRef.current;
      if (!s || !hasDrawn) return;
      layOffCard(s, cardId, meldId);
      commit();
    },
    [hasDrawn, commit]
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
        runAiLoop();
      }
    },
    [hasDrawn, commit, runAiLoop, setHasDrawnBoth]
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
      startNewGame,
      continueGame,
      revealHand,
      draw,
      attemptMeld,
      layOff,
      discard,
      sortHand,
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
      startNewGame,
      continueGame,
      revealHand,
      draw,
      attemptMeld,
      layOff,
      discard,
      sortHand,
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
