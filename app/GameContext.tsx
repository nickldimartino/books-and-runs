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
import { RoundHistoryEntry, YOU_PLAYER_ID } from "./lib/recordGameResult";
import { clearSavedGame, loadSavedGame, saveGame } from "./lib/localSave";
import { playCardSlide, playCardTap, playMeld } from "./lib/sound";
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
  /** Achievement counter deltas accumulated so far this game, for the
   * signed-in seat only — see recordAchievementProgress.ts, called from
   * GameOverScreen once the game actually ends. */
  getSessionCounters: () => Record<string, number>;
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
  const buyQueueRef = useRef<string[]>([]);
  const recordedRoundsRef = useRef<Set<number>>(new Set());

  // Refs mirror the persistence-relevant state synchronously, so commit()
  // can always write a consistent snapshot without waiting on React's
  // (possibly-batched, possibly-stale-by-a-tick) state updates.
  const hasDrawnRef = useRef(false);
  const roundStartScoresRef = useRef<Record<string, number>>({});
  const roundHistoryRef = useRef<RoundHistoryEntry[]>([]);

  // Achievement progress accumulated this game, for YOU_PLAYER_ID only.
  // Flushed to Supabase once, at game-over (see GameOverScreen.tsx) — same
  // "a finished game is what counts" rule recordGameResult already follows,
  // so quitting mid-game drops this session's counters, consistent with how
  // it already drops that game from games_played/games_won too.
  const sessionCountersRef = useRef<Record<string, number>>({});
  const bump = useCallback((key: string, amount = 1) => {
    sessionCountersRef.current[key] = (sessionCountersRef.current[key] ?? 0) + amount;
  }, []);
  const getSessionCounters = useCallback(() => sessionCountersRef.current, []);

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
      sessionCounters: sessionCountersRef.current,
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
    [runAiLoop, persist, setHasDrawnBoth, setRoundStartScoresBoth, bump]
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
    sessionCountersRef.current = saved.sessionCounters ?? {};

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
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;

      let card: Card;
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

      if (isYou) {
        bump("turns_taken");
        bump(actuallyFromDiscard ? "cards_drawn_from_discard" : "cards_drawn_blind");
        if (card.isWild) bump("wilds_drawn");
        if (card.rank === "JOKER") bump("jokers_drawn");
      }

      setLastDrawnCardId(card.id);
      setHasDrawnBoth(true);
      playCardTap();
      commit();
    },
    [hasDrawn, commit, setHasDrawnBoth, bump]
  );

  const sortHand = useCallback(
    (mode: SortMode) => {
      const s = stateRef.current;
      if (!s) return;
      const player = s.players[s.currentPlayerIndex];
      player.hand = [...player.hand].sort(mode === "rank" ? compareByRank : compareBySuit);
      playCardSlide();
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
      playCardSlide();
      commit();
    },
    [commit]
  );

  const confirmMeld = useCallback(
    (groups: string[][]) => {
      const s = stateRef.current;
      if (!s || !hasDrawn) return false;
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;
      const contract = s.selectedContracts[s.round - 1];
      const melds = meldChosenGroups(s, groups);
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

      const wentOut = finishIfWentOut(s);
      if (isYou && wentOut && s.winnerId === player.id) {
        bump("rounds_won");
        bump(contract.wholeHandMeld ? "rounds_won_final_round" : "rounds_won_no_discard");
      }
      playMeld();
      commit();
      return true;
    },
    [hasDrawn, commit, bump]
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

      const ok = layOffCard(s, cardId, meldId, position);
      if (ok) {
        if (isYou && card && meld) {
          bump("cards_laid_off");
          if (card.isWild) bump("wilds_laid_off");
          if (meld.ownerId !== player.id) bump("laid_off_onto_opponent");
          if (wasAmbiguous) bump("ambiguous_wild_choices_made");
        }
        const wentOut = finishIfWentOut(s);
        if (isYou && wentOut && s.winnerId === player.id) {
          const contract = s.selectedContracts[s.round - 1];
          bump("rounds_won");
          bump(contract.wholeHandMeld ? "rounds_won_final_round" : "rounds_won_no_discard");
        }
        playCardTap();
        commit();
      }
      return ok;
    },
    [hasDrawn, commit, bump]
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
      const player = s.players[s.currentPlayerIndex];
      const isYou = player.id === YOU_PLAYER_ID;

      const roundEnded = discardAndAdvance(s, cardId);
      if (isYou) {
        bump("cards_discarded");
        if (roundEnded && s.winnerId === player.id) {
          bump("rounds_won");
          bump("rounds_won_via_discard");
        }
      }
      playCardTap();
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
    [hasDrawn, commit, runAiLoop, setHasDrawnBoth, advanceBuyQueue, bump]
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
      getSessionCounters,
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
      getSessionCounters,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within a GameProvider");
  return ctx;
}
