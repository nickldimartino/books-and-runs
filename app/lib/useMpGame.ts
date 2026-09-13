"use client";

// The multiplayer play-screen hook — everything /multiplayer/play needs to
// render and drive one game. Fetches the redacted view, exposes a local
// turn draft (select cards, group them, stage lay-offs and a discard),
// and submits a turn as two calls: `draw` then `commitTurn`. At game-over
// it mirrors GameOverScreen's recording path for MP: flush the per-turn
// achievement counters it derived from each committed move, call
// recordMpGameResult (so the game counts toward normal stats/XP), and
// diff a progress snapshot (taken on first load, keyed by game id in
// localStorage) to surface any achievements this game unlocked.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateManualGroup } from "@/meld";
import type { Card, ContractRequirement } from "@/types";
import type { RedactedView } from "@/mp/types";
import { allAchievements, AchievementProgressState } from "@/achievements";
import { ACHIEVEMENT_TIER_XP, levelProgress } from "@/leveling";
import { useAuth } from "../AuthContext";
import type { AchievementUnlockItem } from "../components/AchievementUnlock";
import { AnyCosmeticOption, diffNewlyUnlockedCosmetics } from "./allCosmetics";
import { hapticLight, hapticMedium, hapticSuccess } from "../lib/haptics";
import { playCardTap, playGameWin, playMeld, playRoundWin } from "../lib/sound";
import {
  cancelMpGame,
  getMpState,
  MpError,
  MpMoveResponse,
  MpStateResponse,
  nudgeMpGame,
  rematchMpGame,
  resignMpGame,
  submitMpMove,
} from "./mpStore";
import { loadAchievementProgressState } from "./loadAchievementProgress";
import { parseRedactedView } from "./mpSchema";
import { recordAchievementProgress } from "./recordAchievementProgress";
import { recordMpGameResult } from "./recordMpGameResult";
import { supabase } from "./supabaseClient";

export interface StagedGroup {
  id: string;
  type: "book" | "run";
  cardIds: string[];
  runStartIndex?: number;
}

export interface StagedLayoff {
  cardId: string;
  meldId: string;
  position?: "low" | "high";
}

interface Draft {
  groups: StagedGroup[];
  layoffs: StagedLayoff[];
  discardCardId: string | null;
}

const EMPTY_DRAFT: Draft = { groups: [], layoffs: [], discardCardId: null };

export interface UseMpGame {
  status: MpStateResponse["status"] | "loading" | "error";
  view: RedactedView | null;
  pending: MpStateResponse | null; // populated while status === "pending"
  error: string | null;
  busy: boolean;

  myTurn: boolean;
  youHaveDrawn: boolean;
  contract: ContractRequirement | null;
  /** Whole days since the game last moved (from mp_games.updated_at), or
   * null. Lets the play screen flag a game that looks abandoned. */
  daysSinceMove: number | null;

  visibleHand: Card[]; // your hand minus anything staged
  selectedIds: string[];
  draft: Draft;
  groupError: string | null;
  /** Achievements this game unlocked — populated once, at game over. */
  unlockedAchievements: AchievementUnlockItem[];
  /** Any avatar emoji/frame/title/banner newly earned this game — see
   * allCosmetics.ts's diffNewlyUnlockedCosmetics. Populated once, at game
   * over, alongside unlockedAchievements above. */
  newlyUnlockedCosmetics: AnyCosmeticOption[];
  clearNewlyUnlockedCosmetics: () => void;

  refresh: () => void;
  draw: (from: "stock" | "discard") => Promise<void>;
  toggleCard: (id: string) => void;
  clearSelection: () => void;
  stageGroup: (preferredRunStart?: number) => void;
  unstageGroup: (id: string) => void;
  stageLayoff: (cardId: string, meldId: string, position?: "low" | "high") => void;
  unstageLayoff: (cardId: string) => void;
  setDiscard: (cardId: string | null) => void;
  commitTurn: () => Promise<void>;
  resign: () => Promise<void>;
  /** Withdraws a game you're hosting that's still waiting on invitees —
   * only meaningful while `status === "pending"` and you're the host.
   * Resolves true on success (the pending screen then shows "cancelled"). */
  cancelPending: () => Promise<boolean>;

  /** Bump the current-turn player's notification badge. `nudgeState`
   * reflects the last attempt. */
  nudge: () => Promise<void>;
  nudgeState: "idle" | "sent" | "error";
  /** Start a fresh game with the same players + rounds. Resolves to the new
   * game id, or null on failure. */
  rematch: () => Promise<string | null>;
}

/**
 * Drives one multiplayer game screen. The Edge Function is the authority —
 * this holds the last redacted view, a purely-local "turn draft" (staged
 * melds / lay-offs / the chosen discard, all reversible before you commit),
 * and a Realtime subscription that refetches when the game changes.
 */
export function useMpGame(gameId: string | null): UseMpGame {
  const { user } = useAuth();
  const [state, setState] = useState<MpStateResponse | null>(null);
  const [status, setStatus] = useState<UseMpGame["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementUnlockItem[]>([]);
  const [newlyUnlockedCosmetics, setNewlyUnlockedCosmetics] = useState<AnyCosmeticOption[]>([]);
  const clearNewlyUnlockedCosmetics = useCallback(() => setNewlyUnlockedCosmetics([]), []);
  const [nudgeState, setNudgeState] = useState<"idle" | "sent" | "error">("idle");
  const loadedFor = useRef<string | null>(null);

  // Validate the server view before any component reads it (defense in
  // depth — a malformed response becomes a clean error, not a deep crash).
  const view = useMemo(() => {
    if (!state?.view) return null;
    return parseRedactedView(state.view);
  }, [state?.view]);
  const viewMalformed = !!state?.view && view === null;
  const snapKey = gameId ? `mp:achv:${gameId}` : null;

  const refresh = useCallback(() => {
    if (!supabase || !gameId) return;
    getMpState(supabase, gameId)
      .then((res) => {
        setState(res);
        setStatus(res.status);
        setError(null);
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof MpError ? err.message : "Couldn't load the game.");
      });
  }, [gameId]);

  useEffect(() => {
    if (!gameId || loadedFor.current === gameId) return;
    loadedFor.current = gameId;
    refresh();
  }, [gameId, refresh]);

  // Whenever the server view advances, an in-progress local draft is stale.
  useEffect(() => {
    setDraft(EMPTY_DRAFT);
    setSelectedIds([]);
    setGroupError(null);
  }, [view?.currentSeat, view?.round, view?.youHaveDrawn, view?.roundOver]);

  // Snapshot this account's achievement progress the first time we see the
  // game live, so game-over can diff "since the game started" (per-turn
  // counter flushes mean progress trickles in, not all at the end).
  useEffect(() => {
    if (!supabase || !user || !snapKey || !view || view.gameOver) return;
    if (localStorage.getItem(snapKey)) return;
    loadAchievementProgressState(supabase, user.id)
      .then((before) => {
        try {
          localStorage.setItem(snapKey, JSON.stringify(before));
        } catch {
          /* storage full / unavailable — game-over just won't pop */
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, user, !!view, view?.gameOver]);

  // The round or game just ended — from either side's turn, not only the
  // local player's own move (a realtime refresh after the opponent goes out
  // flips these the exact same way). Mirrors app/game/page.tsx's identical
  // watcher for local play: plain booleans in the dep array fire exactly
  // once per false→true transition; gameOver takes priority since a
  // game-over round is also round-over, so only one chime plays.
  useEffect(() => {
    if (view?.gameOver) {
      playGameWin();
      hapticSuccess();
    } else if (view?.roundOver) {
      playRoundWin();
      hapticSuccess();
    }
  }, [view?.roundOver, view?.gameOver]);

  // Game over: flush the last counters, record the result against normal
  // stats + XP + achievements, then diff to list what unlocked.
  const finalizedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || !user || !gameId || !snapKey || !view?.gameOver) return;
    if (view.yourSeat == null || finalizedRef.current === gameId) return;
    finalizedRef.current = gameId;
    (async () => {
      await flushTurnCounters();
      await recordMpGameResult(supabase!, user.id, view, view.yourSeat!).catch((err) =>
        console.error("Failed to record MP game result:", err)
      );
      try {
        const raw = localStorage.getItem(snapKey);
        if (!raw) return;
        const before = JSON.parse(raw) as AchievementProgressState;
        const beforeSet = new Set(
          allAchievements(before)
            .filter((a) => a.unlocked)
            .map((a) => `${a.familyId}:${a.tier}`)
        );
        const after = await loadAchievementProgressState(supabase!, user.id);
        setUnlockedAchievements(
          allAchievements(after)
            .filter((a) => a.unlocked && !beforeSet.has(`${a.familyId}:${a.tier}`))
            .map((a) => ({ achievement: a, xp: ACHIEVEMENT_TIER_XP[a.tier] }))
        );
        setNewlyUnlockedCosmetics(
          diffNewlyUnlockedCosmetics(levelProgress(before).level, before, levelProgress(after).level, after)
        );
        localStorage.removeItem(snapKey);
      } catch (err) {
        console.error("Failed to diff MP achievements:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, snapKey, user, view?.gameOver, view?.yourSeat]);

  useEffect(() => {
    if (!supabase || !gameId) return;
    const channel = supabase
      .channel(`mp-game-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mp_games", filter: `id=eq.${gameId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [gameId, refresh]);

  const contract = useMemo<ContractRequirement | null>(
    () =>
      view
        ? {
            round: view.round,
            books: view.contract.books,
            runs: view.contract.runs,
            bookSize: view.contract.bookSize,
            runSize: view.contract.runSize,
            label: view.roundLabel,
            wholeHandMeld: view.contract.wholeHandMeld,
          }
        : null,
    [view]
  );

  const stagedCardIds = useMemo(() => {
    const s = new Set<string>();
    draft.groups.forEach((g) => g.cardIds.forEach((id) => s.add(id)));
    draft.layoffs.forEach((l) => s.add(l.cardId));
    if (draft.discardCardId) s.add(draft.discardCardId);
    return s;
  }, [draft]);

  const visibleHand = useMemo(
    () => (view?.yourHand ?? []).filter((c) => !stagedCardIds.has(c.id)),
    [view?.yourHand, stagedCardIds]
  );

  // Per-turn achievement counter deltas (the same keys GameContext.bump uses
  // in local play). Accumulated across a turn's draw + commit, then flushed
  // to achievement_counters once per commit — per-turn rather than at
  // game-over so closing the tab mid-game doesn't lose progress.
  const turnCountersRef = useRef<Record<string, number>>({});
  const bumpC = (key: string, n = 1) => {
    turnCountersRef.current[key] = (turnCountersRef.current[key] ?? 0) + n;
  };
  async function flushTurnCounters() {
    const deltas = turnCountersRef.current;
    turnCountersRef.current = {};
    if (!supabase || !user || Object.keys(deltas).length === 0) return;
    try {
      await recordAchievementProgress(supabase, user.id, deltas);
    } catch (err) {
      console.error("Failed to record MP achievement progress:", err);
    }
  }

  async function run<T extends MpStateResponse | MpMoveResponse | { view: RedactedView; status: string }>(
    fn: () => Promise<T>
  ): Promise<T | null> {
    if (!supabase || busy) return null;
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if ("view" in res && res.view) {
        setState((prev) => ({ ...(prev ?? {}), status: res.status as MpStateResponse["status"], view: res.view }));
        setStatus(res.status as MpStateResponse["status"]);
      }
      return res;
    } catch (err) {
      const msg = err instanceof MpError ? err.message : "Something went wrong.";
      setError(msg);
      refresh(); // reconcile with the server on any failure
      return null;
    } finally {
      setBusy(false);
    }
  }

  const draw = useCallback(
    async (from: "stock" | "discard") => {
      if (!supabase || !gameId) return;
      const res = await run(() => submitMpMove(supabase!, gameId, { type: "draw", from }));
      const drawnId = res && "drawnCard" in res ? res.drawnCard?.id : undefined;
      const drawn = drawnId ? res?.view.yourHand.find((c) => c.id === drawnId) : undefined;
      if (res) {
        playCardTap();
        hapticLight();
      }
      bumpC("turns_taken");
      if (drawn?.isWild) bumpC("wilds_drawn");
      if (drawn?.rank === "JOKER") bumpC("jokers_drawn");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId, user]
  );

  const toggleCard = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setGroupError(null);
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const stageGroup = useCallback(
    (preferredRunStart?: number) => {
      if (!view || !contract || selectedIds.length === 0) return;
      const cards = selectedIds
        .map((id) => view.yourHand.find((c) => c.id === id))
        .filter((c): c is Card => !!c);
      const result = validateManualGroup(cards, contract, preferredRunStart);
      if (result.needsRunStartChoice) {
        setGroupError(`This run's wild could sit at more than one spot — tap the card again after choosing.`);
        return;
      }
      if (!result.valid || !result.type) {
        setGroupError(result.reason ?? "Not a valid book or run.");
        return;
      }
      setDraft((prev) => ({
        ...prev,
        groups: [
          ...prev.groups,
          {
            id: `g-${Date.now()}-${prev.groups.length}`,
            type: result.type!,
            cardIds: [...selectedIds],
            runStartIndex: result.runStartIndex,
          },
        ],
      }));
      setSelectedIds([]);
      setGroupError(null);
    },
    [view, contract, selectedIds]
  );

  const unstageGroup = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, groups: prev.groups.filter((g) => g.id !== id) }));
  }, []);

  const stageLayoff = useCallback((cardId: string, meldId: string, position?: "low" | "high") => {
    setDraft((prev) => ({
      ...prev,
      layoffs: [...prev.layoffs.filter((l) => l.cardId !== cardId), { cardId, meldId, position }],
    }));
  }, []);

  const unstageLayoff = useCallback((cardId: string) => {
    setDraft((prev) => ({ ...prev, layoffs: prev.layoffs.filter((l) => l.cardId !== cardId) }));
  }, []);

  const setDiscard = useCallback((cardId: string | null) => {
    setDraft((prev) => ({ ...prev, discardCardId: cardId }));
  }, []);

  const commitTurn = useCallback(async () => {
    if (!supabase || !gameId || !view || !contract) return;
    const preView = view;
    const preDraft = draft;
    const mySeat = preView.yourSeat;
    const goingOut = (preView.yourHand ?? []).every((c) => stagedCardIds.has(c.id));

    const res = await run(() =>
      submitMpMove(supabase!, gameId, {
        type: "commit",
        groups: preDraft.groups.length ? preDraft.groups.map((g) => g.cardIds) : undefined,
        preferredRunStarts: preDraft.groups.length ? preDraft.groups.map((g) => g.runStartIndex) : undefined,
        layoffs: preDraft.layoffs.length ? preDraft.layoffs : undefined,
        discardCardId: preDraft.discardCardId ?? undefined,
      })
    );
    if (!res) return; // failed — nothing applied server-side

    // The round/game-over chime is handled by its own transition effect
    // above (it needs to fire from a realtime refresh too, not just your
    // own commit) — this is just the per-turn "you melded / played a card"
    // feedback, same split local play's confirmMeld/layOff/discard use.
    if (preDraft.groups.length > 0) {
      playMeld();
      hapticMedium();
    } else {
      playCardTap();
      hapticLight();
    }

    const cardById = (id: string) => preView.yourHand.find((c) => c.id === id);
    for (const grp of preDraft.groups) {
      const cards = grp.cardIds.map(cardById).filter((c): c is Card => !!c);
      const wilds = cards.filter((c) => c.isWild).length;
      if (grp.type === "book") {
        bumpC("books_melded");
        if (cards.length > contract.bookSize) bumpC("oversized_books_melded");
      } else {
        bumpC("runs_melded");
        if (cards.length > contract.runSize) bumpC("oversized_runs_melded");
      }
      if (wilds > 0) bumpC("wilds_used_in_melds", wilds);
      else bumpC("melds_with_zero_wilds");
    }
    for (const lo of preDraft.layoffs) {
      bumpC("cards_laid_off");
      if (cardById(lo.cardId)?.isWild) bumpC("wilds_laid_off");
      const meld = preView.melds.find((m) => m.id === lo.meldId);
      if (meld && mySeat != null && meld.ownerId !== `seat-${mySeat}`) bumpC("laid_off_onto_opponent");
    }
    if (preDraft.discardCardId) bumpC("cards_discarded");
    if (goingOut) {
      bumpC("rounds_won");
      if (preDraft.discardCardId) bumpC("rounds_won_via_discard");
    }
    await flushTurnCounters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, draft, view, contract, stagedCardIds, user]);

  const resign = useCallback(async () => {
    if (!supabase || !gameId) return;
    await run(() => resignMpGame(supabase!, gameId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const cancelPending = useCallback(async (): Promise<boolean> => {
    if (!supabase || !gameId) return false;
    setBusy(true);
    setError(null);
    try {
      await cancelMpGame(supabase, gameId);
      refresh(); // picks up the now-"cancelled" status from the server
      return true;
    } catch (err) {
      setError(err instanceof MpError ? err.message : "Couldn't cancel this game.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [gameId, refresh]);

  const nudge = useCallback(async () => {
    if (!supabase || !gameId) return;
    try {
      await nudgeMpGame(supabase, gameId);
      setNudgeState("sent");
      playCardTap();
      hapticLight();
    } catch {
      setNudgeState("error");
    }
    setTimeout(() => setNudgeState("idle"), 4000);
  }, [gameId]);

  const rematch = useCallback(async (): Promise<string | null> => {
    if (!supabase || !gameId || !view || !user) return null;
    try {
      const { game_id } = await rematchMpGame(
        supabase,
        view.players,
        user.id,
        view.contractRounds
      );
      return game_id;
    } catch (err) {
      setError(err instanceof MpError ? err.message : "Couldn't start a rematch.");
      return null;
    }
  }, [gameId, view, user]);

  const daysSinceMove =
    state?.updated_at != null
      ? (() => {
          const d = Math.floor((Date.now() - new Date(state.updated_at!).getTime()) / 86_400_000);
          return Number.isFinite(d) && d >= 0 ? d : null;
        })()
      : null;

  return {
    status: viewMalformed ? "error" : status,
    view,
    pending: status === "pending" ? state : null,
    error: viewMalformed ? "The game data looked wrong — try reloading." : error,
    busy,
    myTurn: !!view?.yourTurn,
    youHaveDrawn: !!view?.youHaveDrawn,
    contract,
    daysSinceMove,
    visibleHand,
    selectedIds,
    draft,
    groupError,
    unlockedAchievements,
    newlyUnlockedCosmetics,
    clearNewlyUnlockedCosmetics,
    refresh,
    draw,
    toggleCard,
    clearSelection,
    stageGroup,
    unstageGroup,
    stageLayoff,
    unstageLayoff,
    setDiscard,
    commitTurn,
    resign,
    cancelPending,
    nudge,
    nudgeState,
    rematch,
  };
}
