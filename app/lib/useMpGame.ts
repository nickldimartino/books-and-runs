"use client";

// The multiplayer play-screen hook — everything /multiplayer/play needs to
// render and drive one game. Fetches the redacted view, exposes a local
// draft of the group(s) being built (select cards, "Group selected cards"),
// and plays a turn as individual server actions that mirror solo:
// `draw`, `confirmMeld` (commits the staged groups — real immediately),
// `layOff` (one card, immediate), then `discard` / `goOut` (ends the turn).
// Each is validated by the real engine server-side. Stats and
// achievement-counter crediting both happen server-side now (mp/index.ts,
// derived from whatever it just verified — see its own doc for why this
// moved off the client) — this hook just diffs a progress snapshot (taken
// on first load, keyed by game id in localStorage) at game-over, to
// surface which achievements that already-applied server write unlocked.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateManualGroup } from "@/meld";
import type { Card, ContractRequirement } from "@/types";
import type { RedactedView } from "@/mp/types";
import { allAchievements, AchievementProgressState } from "@/achievements";
import { ACHIEVEMENT_TIER_XP, levelProgress } from "@/leveling";
import { useAuth } from "../AuthContext";
import type { AchievementUnlockItem } from "../components/AchievementUnlock";
import type { AnyCosmeticOption } from "./allCosmetics";
import { diffAchievementProgress } from "./achievementUnlockDiff";
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
  respondToMpGame,
  submitMpMove,
} from "./mpStore";
import { loadAchievementProgressState } from "./loadAchievementProgress";
import { parseRedactedView } from "./mpSchema";
import { shareStructure } from "./structuralShare";
import { supabase } from "./supabaseClient";
import { useT } from "./i18n/LocaleProvider";
import { translateError } from "./i18n/serverErrors";

export interface StagedGroup {
  id: string;
  type: "book" | "run";
  cardIds: string[];
  runStartIndex?: number;
}

/** Only the group(s) being built are local; a meld, lay-off or discard is a
 * real server action the moment it's confirmed. */
interface Draft {
  groups: StagedGroup[];
}

const EMPTY_DRAFT: Draft = { groups: [] };

/** A run whose wild could stand in at more than one spot — the player picks
 * (same prompt solo shows; see game/page.tsx's pendingGroupChoice). */
export interface PendingRunChoice {
  cards: Card[];
  cardIds: string[];
  options: number[];
}

/** A card-flight cue for the board (draw pile -> hand, hand -> discard,
 * hand -> table), mirroring GameContext's flightEvent for solo. Own moves
 * only; the page derives opponents' from view changes. */
export type MpFlightEvent =
  | { id: number; kind: "draw"; card: Card; fromDiscard: boolean }
  | { id: number; kind: "meld"; melded: Card[] }
  | { id: number; kind: "layoff"; card: Card; meldId: string }
  | { id: number; kind: "discard"; discard: Card | null };

/** What the server-held state looks like once reconciled: the raw response
 * plus its validated view, both structurally shared with the previous one so
 * an unchanged refresh is a no-op for React. */
interface Held {
  resp: MpStateResponse;
  view: RedactedView | null;
}

function reconcile(prev: Held | null, res: MpStateResponse): Held {
  const resp = shareStructure(prev?.resp, res);
  if (prev && resp === prev.resp) return prev;
  const parsed = resp.view ? parseRedactedView(resp.view) : null;
  return { resp, view: shareStructure(prev?.view ?? null, parsed) };
}

export interface UseMpGame {
  status: MpStateResponse["status"] | "loading" | "error";
  view: RedactedView | null;
  pending: MpStateResponse | null; // populated while status === "pending"
  error: string | null;
  /** Clears a surfaced action error (the play screen shows it inside the
   * hand drawer too, where the user is when a move is rejected). */
  dismissError: () => void;
  /** A background refresh failed while a game is on screen — the board keeps
   * showing the last known state; the screen shows a soft notice. */
  syncFailed: boolean;
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
  /** Set while a staged run needs the player to pick where its wild sits. */
  pendingRunChoice: PendingRunChoice | null;
  chooseRunStart: (start: number) => void;
  cancelRunChoice: () => void;
  /** Contract progress of the staged draft (books/runs staged, and whether
   * the draft is exactly this round's contract). */
  stagedBooks: number;
  stagedRuns: number;
  contractStaged: boolean;
  /** The card you just drew this turn (null before drawing / once staged). */
  lastDrawnCardId: string | null;
  flightEvent: MpFlightEvent | null;
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
  /** Commit the staged group(s) as this round's contract — immediate, the
   * turn stays open. Resolves true on success. */
  confirmMeld: () => Promise<boolean>;
  /** Lay one card off onto a table meld — immediate, the turn stays open. */
  layOff: (cardId: string, meldId: string, position?: "low" | "high") => Promise<boolean>;
  /** Discard one card — ends the turn. */
  discard: (cardId: string) => Promise<boolean>;
  /** Go out with an already-empty hand (after melding / laying off
   * everything) — ends the round. */
  goOut: () => Promise<boolean>;
  resign: () => Promise<void>;
  /** Withdraws a game you're hosting that's still waiting on invitees —
   * only meaningful while `status === "pending"` and you're the host.
   * Resolves true on success (the pending screen then shows "cancelled"). */
  cancelPending: () => Promise<boolean>;
  /** Accepts or declines a still-pending invite from this same screen —
   * only meaningful while `status === "pending"` and you're an invitee, not
   * the host. Resolves true on success (accept moves the game toward
   * dealing once everyone's in; decline cancels it for everyone). */
  respondPending: (accept: boolean) => Promise<boolean>;

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
  const { t } = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const tr = (m: string) => translateError(m, tRef.current);
  const [held, setHeld] = useState<Held | null>(null);
  const state = held?.resp ?? null;
  const [status, setStatus] = useState<UseMpGame["status"]>("loading");
  // Two kinds of error, deliberately separate: an *action* error (a move the
  // server rejected — cleared by the next action or dismissed) and a *sync*
  // error (a background refresh failed — cleared by the next successful
  // refresh). Previously one shared string meant the reconciling refresh
  // that follows a rejected move wiped the rejection reason a few ms after
  // it appeared, so a refused meld looked like nothing happened.
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const epochRef = useRef(0);
  const inflightRef = useRef(false);
  const dirtyRef = useRef(false);
  const refreshRef = useRef<() => void>(() => {});
  const [pendingRunChoice, setPendingRunChoice] = useState<PendingRunChoice | null>(null);
  const [drawnCardId, setDrawnCardId] = useState<string | null>(null);
  const [flightEvent, setFlightEvent] = useState<MpFlightEvent | null>(null);
  const flightSeq = useRef(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementUnlockItem[]>([]);
  const [newlyUnlockedCosmetics, setNewlyUnlockedCosmetics] = useState<AnyCosmeticOption[]>([]);
  const clearNewlyUnlockedCosmetics = useCallback(() => setNewlyUnlockedCosmetics([]), []);
  const [nudgeState, setNudgeState] = useState<"idle" | "sent" | "error">("idle");
  const loadedFor = useRef<string | null>(null);

  // The validated view (defense in depth — a malformed response becomes a
  // clean error, not a deep crash), already structurally shared by
  // reconcile() so its identity only changes when its content does.
  const view = held?.view ?? null;
  const viewMalformed = !!state?.view && view === null;
  const snapKey = gameId ? `mp:achv:${gameId}` : null;

  const applyResponse = useCallback((res: MpStateResponse) => {
    hasLoadedRef.current = true;
    setHeld((prev) => reconcile(prev, res));
    setStatus(res.status);
  }, []);

  // Background reconcile with the server. Three properties keep it from
  // fighting the UI:
  //  - coalesced: realtime delivers several events per move (state write,
  //    public-columns write, the opponent's own reply), so while one fetch is
  //    in flight further requests only mark it dirty and trigger one re-run;
  //  - ordered: a fetch that started before one of *your* moves completed may
  //    carry an older snapshot than the move's own response — it is dropped
  //    (and re-issued) rather than allowed to roll the board back a step;
  //  - non-destructive: a failed refresh with a game already on screen keeps
  //    showing it (with a soft sync error) instead of swapping in an error
  //    page and remounting every card when it recovers.
  const refresh = useCallback(() => {
    if (!supabase || !gameId) return;
    if (inflightRef.current) {
      dirtyRef.current = true;
      return;
    }
    inflightRef.current = true;
    const epoch = epochRef.current;
    getMpState(supabase, gameId)
      .then((res) => {
        if (epoch !== epochRef.current) {
          dirtyRef.current = true; // a move landed mid-flight — this may be older than it
          return;
        }
        applyResponse(res);
        setSyncError(null);
      })
      .catch((err) => {
        const msg = err instanceof MpError ? tr(err.message) : tr("Couldn't load the game.");
        if (hasLoadedRef.current) {
          setSyncError(msg);
        } else {
          setStatus("error");
          setActionError(msg);
        }
      })
      .finally(() => {
        inflightRef.current = false;
        if (dirtyRef.current) {
          dirtyRef.current = false;
          refreshRef.current();
        }
      });
  }, [gameId, applyResponse]);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

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
    setPendingRunChoice(null);
  }, [view?.currentSeat, view?.round, view?.youHaveDrawn, view?.roundOver]);

  // Belt and braces: if the hand ever stops containing a staged card (e.g. a
  // reconcile landed a newer snapshot), a draft pointing at cards you no
  // longer hold can only be sent as a guaranteed rejection — drop it.
  const yourHand = view?.yourHand;
  useEffect(() => {
    if (!yourHand) return;
    const ids = new Set(yourHand.map((c) => c.id));
    setDraft((prev) => {
      const ok = prev.groups.every((g) => g.cardIds.every((id) => ids.has(id)));
      return ok ? prev : EMPTY_DRAFT;
    });
    setSelectedIds((prev) => (prev.every((id) => ids.has(id)) ? prev : prev.filter((id) => ids.has(id))));
  }, [yourHand]);

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

  // Game over: the server already recorded stats/achievement counters for
  // every real move as it happened (see mp/index.ts's creditAchievementCounters
  // / recordMpGameOutcome, called from inside handleMove/handleResign — the
  // same response that flips `view.gameOver` true already reflects those
  // writes) — this just diffs the achievement snapshot to list what unlocked.
  const finalizedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || !user || !gameId || !snapKey || !view?.gameOver) return;
    if (view.yourSeat == null || finalizedRef.current === gameId) return;
    finalizedRef.current = gameId;
    (async () => {
      try {
        const raw = localStorage.getItem(snapKey);
        if (!raw) return;
        const before = JSON.parse(raw) as AchievementProgressState;
        const after = await loadAchievementProgressState(supabase!, user.id);
        const diff = diffAchievementProgress(before, after);
        setUnlockedAchievements(diff.newlyUnlocked);
        setNewlyUnlockedCosmetics(diff.newCosmetics);
        localStorage.removeItem(snapKey);
      } catch (err) {
        console.error("Failed to diff MP achievements:", err);
      }
    })();
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
    return s;
  }, [draft]);

  const stagedBooks = draft.groups.filter((g) => g.type === "book").length;
  const stagedRuns = draft.groups.filter((g) => g.type === "run").length;
  const meldedAlready = !!view?.players.find((p) => p.seat === view.yourSeat)?.hasMeldedContract;
  const contractStaged =
    !!view &&
    !meldedAlready &&
    draft.groups.length > 0 &&
    stagedBooks === view.contract.books &&
    stagedRuns === view.contract.runs;

  // Only meaningful while it's still in your hand and you're mid-turn.
  const lastDrawnCardId =
    view?.yourTurn && view.youHaveDrawn && drawnCardId && view.yourHand.some((c) => c.id === drawnCardId)
      ? drawnCardId
      : null;

  const visibleHand = useMemo(
    () => (view?.yourHand ?? []).filter((c) => !stagedCardIds.has(c.id)),
    [view?.yourHand, stagedCardIds]
  );

  // Runs one server action. `busyRef` (not the `busy` state) is the guard:
  // callbacks here are memoised and capture the render they were created in,
  // so a state-based check read a stale `false` and let a rapid double-tap
  // send two moves (the second then failed with "already drawn" / "isn't
  // your turn" and surfaced a bogus error). A successful response is the
  // authority for your own move: it bumps the epoch so any refresh that
  // started earlier can't overwrite it with an older snapshot.
  const run = useCallback(
    async <T extends MpStateResponse | MpMoveResponse | { view: RedactedView; status: string }>(
      fn: () => Promise<T>
    ): Promise<T | null> => {
      if (!supabase || busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setActionError(null);
      try {
        const res = await fn();
        epochRef.current++;
        if ("view" in res && res.view) {
          const view = res.view;
          const status = res.status as MpStateResponse["status"];
          hasLoadedRef.current = true;
          setHeld((prev) => reconcile(prev, { ...(prev?.resp ?? {}), status, view }));
          setStatus(status);
          setSyncError(null);
        }
        // Anything queued behind this move should now re-fetch on top of it.
        if (dirtyRef.current && !inflightRef.current) {
          dirtyRef.current = false;
          refreshRef.current();
        }
        return res;
      } catch (err) {
        setActionError(err instanceof MpError ? tr(err.message) : tr("Something went wrong."));
        refreshRef.current(); // reconcile with the server on any failure
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    []
  );

  const draw = useCallback(
    async (from: "stock" | "discard") => {
      if (!supabase || !gameId) return;
      const res = await run(() => submitMpMove(supabase!, gameId, { type: "draw", from }));
      if (res) {
        const drawnId = "drawnCard" in res ? res.drawnCard?.id ?? null : null;
        setDrawnCardId(drawnId);
        const card = drawnId && "view" in res ? res.view.yourHand.find((c) => c.id === drawnId) : undefined;
        if (card) setFlightEvent({ id: ++flightSeq.current, kind: "draw", card, fromDiscard: from === "discard" });
        playCardTap();
        hapticLight();
      }
    },
    [gameId, run]
  );

  const toggleCard = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setGroupError(null);
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const stageCards = useCallback(
    (cardIds: string[], type: "book" | "run", runStartIndex: number | undefined) => {
      setDraft((prev) => ({
        ...prev,
        groups: [
          ...prev.groups,
          { id: `g-${Date.now()}-${prev.groups.length}`, type, cardIds: [...cardIds], runStartIndex },
        ],
      }));
      setSelectedIds([]);
      setGroupError(null);
      setPendingRunChoice(null);
    },
    []
  );

  const stageGroup = useCallback(
    (preferredRunStart?: number) => {
      if (!view || !contract || selectedIds.length === 0) return;
      const cards = selectedIds
        .map((id) => view.yourHand.find((c) => c.id === id))
        .filter((c): c is Card => !!c);
      const result = validateManualGroup(cards, contract, preferredRunStart);
      if (result.needsRunStartChoice) {
        // Same as solo: ask where the wild sits, then stage (see chooseRunStart).
        setPendingRunChoice({ cards, cardIds: [...selectedIds], options: result.needsRunStartChoice });
        setGroupError(null);
        return;
      }
      if (!result.valid || !result.type) {
        setGroupError(result.reason ? tr(result.reason) : tRef.current("game.buildMeld.invalidGroup"));
        return;
      }
      stageCards(selectedIds, result.type, result.runStartIndex);
    },
    [view, contract, selectedIds, stageCards]
  );

  const chooseRunStart = useCallback(
    (start: number) => {
      if (!pendingRunChoice || !contract) return;
      const result = validateManualGroup(pendingRunChoice.cards, contract, start);
      if (!result.valid || !result.type) {
        setGroupError(result.reason ? tr(result.reason) : tRef.current("game.buildMeld.invalidGroup"));
        setPendingRunChoice(null);
        return;
      }
      stageCards(pendingRunChoice.cardIds, result.type, result.runStartIndex);
    },
    [pendingRunChoice, contract, stageCards]
  );

  const cancelRunChoice = useCallback(() => setPendingRunChoice(null), []);

  const unstageGroup = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, groups: prev.groups.filter((g) => g.id !== id) }));
  }, []);

  const cardOf = useCallback((id: string) => view?.yourHand.find((c) => c.id === id), [view?.yourHand]);

  const confirmMeld = useCallback(async (): Promise<boolean> => {
    if (!supabase || !gameId || !view || draft.groups.length === 0) return false;
    const melded = draft.groups.flatMap((g) => g.cardIds).map(cardOf).filter((c): c is Card => !!c);
    const res = await run(() =>
      submitMpMove(supabase!, gameId, {
        type: "meld",
        groups: draft.groups.map((g) => g.cardIds),
        // JSON has no `undefined`: an unset entry arrives server-side as
        // null (the server normalises that back to "no preference").
        preferredRunStarts: draft.groups.map((g) => g.runStartIndex),
      })
    );
    if (!res) return false; // rejected — nothing applied server-side; the staged group stays so it can be fixed
    setDraft(EMPTY_DRAFT);
    setSelectedIds([]);
    setGroupError(null);
    setFlightEvent({ id: ++flightSeq.current, kind: "meld", melded });
    playMeld();
    hapticMedium();
    return true;
  }, [gameId, view, draft.groups, cardOf, run]);

  const layOff = useCallback(
    async (cardId: string, meldId: string, position?: "low" | "high"): Promise<boolean> => {
      if (!supabase || !gameId) return false;
      const card = cardOf(cardId);
      const res = await run(() => submitMpMove(supabase!, gameId, { type: "layoff", cardId, meldId, position }));
      if (!res) return false;
      setSelectedIds((prev) => prev.filter((id) => id !== cardId));
      if (card) setFlightEvent({ id: ++flightSeq.current, kind: "layoff", card, meldId });
      playCardTap();
      hapticLight();
      return true;
    },
    [gameId, cardOf, run]
  );

  const discard = useCallback(
    async (cardId: string): Promise<boolean> => {
      if (!supabase || !gameId) return false;
      const card = cardOf(cardId) ?? null;
      const res = await run(() => submitMpMove(supabase!, gameId, { type: "discard", discardCardId: cardId }));
      if (!res) return false;
      setSelectedIds([]);
      setDrawnCardId(null);
      setFlightEvent({ id: ++flightSeq.current, kind: "discard", discard: card });
      playCardTap();
      hapticLight();
      return true;
    },
    [gameId, cardOf, run]
  );

  const goOut = useCallback(async (): Promise<boolean> => {
    if (!supabase || !gameId) return false;
    const res = await run(() => submitMpMove(supabase!, gameId, { type: "discard" }));
    if (!res) return false;
    setSelectedIds([]);
    setDrawnCardId(null);
    // The round/game-over chime is handled by its own transition effect
    // above (it must also fire from a realtime refresh after an opponent
    // goes out), so there is nothing more to play here.
    return true;
  }, [gameId, run]);

  const resign = useCallback(async () => {
    if (!supabase || !gameId) return;
    await run(() => resignMpGame(supabase!, gameId));
  }, [gameId, run]);

  const cancelPending = useCallback(async (): Promise<boolean> => {
    if (!supabase || !gameId) return false;
    setBusy(true);
    setActionError(null);
    try {
      await cancelMpGame(supabase, gameId);
      refresh(); // picks up the now-"cancelled" status from the server
      return true;
    } catch (err) {
      setActionError(err instanceof MpError ? tr(err.message) : tr("Couldn't cancel this game."));
      return false;
    } finally {
      setBusy(false);
    }
  }, [gameId, refresh]);

  // Accept/decline a still-pending invite from this same screen — the
  // Home page's invite cards already call respondToMpGame directly, but a
  // push notification deep-links straight to /multiplayer/play?g=<id> (see
  // mp/index.ts's sendPushForEvent), which previously stranded the invitee
  // on the "waiting for players" list with no way to act on their own
  // invite, only Home had Accept/Decline buttons.
  const respondPending = useCallback(
    async (accept: boolean): Promise<boolean> => {
      if (!supabase || !gameId) return false;
      setBusy(true);
      setActionError(null);
      try {
        await respondToMpGame(supabase, gameId, accept);
        refresh(); // picks up the now-active (or, on decline, cancelled) status
        return true;
      } catch (err) {
        setActionError(err instanceof MpError ? tr(err.message) : tr("Couldn't respond to this invite."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [gameId, refresh]
  );

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
      setActionError(err instanceof MpError ? tr(err.message) : tr("Couldn't start a rematch."));
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
    error: viewMalformed ? "The game data looked wrong — try reloading." : actionError,
    syncFailed: !!syncError && !viewMalformed,
    dismissError: () => {
      setActionError(null);
      setSyncError(null);
    },
    busy,
    myTurn: !!view?.yourTurn,
    youHaveDrawn: !!view?.youHaveDrawn,
    contract,
    daysSinceMove,
    visibleHand,
    selectedIds,
    draft,
    groupError,
    pendingRunChoice,
    chooseRunStart,
    cancelRunChoice,
    stagedBooks,
    stagedRuns,
    contractStaged,
    lastDrawnCardId,
    flightEvent,
    unlockedAchievements,
    newlyUnlockedCosmetics,
    clearNewlyUnlockedCosmetics,
    refresh,
    draw,
    toggleCard,
    clearSelection,
    stageGroup,
    unstageGroup,
    confirmMeld,
    layOff,
    discard,
    goOut,
    resign,
    cancelPending,
    respondPending,
    nudge,
    nudgeState,
    rematch,
  };
}
