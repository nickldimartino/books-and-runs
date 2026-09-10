"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateManualGroup } from "@/meld";
import type { Card, ContractRequirement } from "@/types";
import type { RedactedView } from "@/mp/types";
import {
  getMpState,
  MpError,
  MpStateResponse,
  resignMpGame,
  submitMpMove,
} from "./mpStore";
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

  visibleHand: Card[]; // your hand minus anything staged
  selectedIds: string[];
  draft: Draft;
  groupError: string | null;

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
}

/**
 * Drives one multiplayer game screen. The Edge Function is the authority —
 * this holds the last redacted view, a purely-local "turn draft" (staged
 * melds / lay-offs / the chosen discard, all reversible before you commit),
 * and a Realtime subscription that refetches when the game changes.
 */
export function useMpGame(gameId: string | null): UseMpGame {
  const [state, setState] = useState<MpStateResponse | null>(null);
  const [status, setStatus] = useState<UseMpGame["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [groupError, setGroupError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const view = state?.view ?? null;

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

  async function run(fn: () => Promise<MpStateResponse | { view: RedactedView; status: string }>) {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if ("view" in res && res.view) {
        setState((prev) => ({ ...(prev ?? {}), status: res.status as MpStateResponse["status"], view: res.view }));
        setStatus(res.status as MpStateResponse["status"]);
      }
    } catch (err) {
      const msg = err instanceof MpError ? err.message : "Something went wrong.";
      setError(msg);
      refresh(); // reconcile with the server on any failure
    } finally {
      setBusy(false);
    }
  }

  const draw = useCallback(
    async (from: "stock" | "discard") => {
      if (!supabase || !gameId) return;
      await run(() => submitMpMove(supabase!, gameId, { type: "draw", from }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId]
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
    if (!supabase || !gameId) return;
    await run(() =>
      submitMpMove(supabase!, gameId, {
        type: "commit",
        groups: draft.groups.length ? draft.groups.map((g) => g.cardIds) : undefined,
        preferredRunStarts: draft.groups.length ? draft.groups.map((g) => g.runStartIndex) : undefined,
        layoffs: draft.layoffs.length ? draft.layoffs : undefined,
        discardCardId: draft.discardCardId ?? undefined,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, draft]);

  const resign = useCallback(async () => {
    if (!supabase || !gameId) return;
    await run(() => resignMpGame(supabase!, gameId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return {
    status,
    view,
    pending: status === "pending" ? state : null,
    error,
    busy,
    myTurn: !!view?.yourTurn,
    youHaveDrawn: !!view?.youHaveDrawn,
    contract,
    visibleHand,
    selectedIds,
    draft,
    groupError,
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
  };
}
