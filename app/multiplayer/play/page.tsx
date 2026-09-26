"use client";

// The multiplayer game screen (`?g=<id>`). Driven by `useMpGame`, which
// talks to the Edge Function and only ever holds this player's redacted
// view. A turn is a sequence of individual server actions that mirror solo:
// draw, then (optionally) "Group selected cards" + "Confirm Meld" (real and
// visible to everyone immediately), lay-offs (each immediate), and finally
// "Discard selected card" (or "Go out") which ends the turn. Shows "waiting for X" when it's not your
// turn, the round summary between rounds, and standings + achievement
// unlocks at game over. Manual resign only.
//
// The board (piles, table melds, and the hand drawer — DraggableHand plus
// Sort by suit/rank) mirrors solo/pass-and-play's game screen (see
// game/page.tsx): the drawer's meld-builder panel reflects useMpGame's
// staged group(s) and its confirmMeld/layOff/discard/goOut, the server-backed
// equivalents of GameContext's actions of the same names. Hand sort/reorder is
// purely local display order (see handSort.ts) — there's no MP move to
// persist it as, and the server's own card order isn't meaningful here.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../AuthContext";
import { usePlayerLevel } from "../../PlayerLevelContext";
import { BackLink } from "../../components/BackLink";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { KeyboardHelp } from "../../components/KeyboardHelp";
import { CardFlightLayer, type CardFlightHandle } from "../../components/CardFlightLayer";
import { DraggableHand } from "../../components/DraggableHand";
import { HandPreviewBar } from "../../components/HandPreviewBar";
import { HandSortButtons } from "../../components/HandSortButtons";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { OpponentStrip } from "../../components/OpponentStrip";
import { PageTip } from "../../components/PageTip";
import { MpTableExtras } from "../../components/MpTableExtras";
import { TurnTimerBadge } from "../../components/TurnTimerBadge";
import { SoundQuickToggle } from "../../components/SoundQuickToggle";
import { DiscardPile, DrawPile } from "../../components/Piles";
import { PlayingCard } from "../../components/PlayingCard";
import { AchievementUnlockCard } from "../../components/AchievementUnlock";
import { UnlockToast } from "../../components/UnlockToast";
import { useMpGame } from "../../lib/useMpGame";
import { AI_THEORETICAL_LEVEL } from "../../lib/aiPersonas";
import { startAmbience, stopAmbience } from "../../lib/ambience";
import { contractNeedLabel, wildStandInLabel } from "../../lib/contractDisplay";
import { applyHandOrder, compareByMode, mergeVisibleOrder, SortMode } from "../../lib/handSort";
import { useT } from "../../lib/i18n/LocaleProvider";
import { fetchBiosFor, fetchDisplayNamesFor } from "../../lib/leaderboardStore";
import { getMpParticipantUserIds } from "../../lib/mpStore";
import { loadLocalSettings } from "../../lib/settingsStore";
import { supabase } from "../../lib/supabaseClient";
import { getTournamentForGame } from "../../lib/tournamentsStore";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { useGameShortcuts, type ShortcutHandlers } from "../../lib/useGameShortcuts";
import { useMediaQuery, WIDE_TABLE_QUERY } from "../../lib/useMediaQuery";
import { contractProgress, type ContractProgress } from "../../lib/contractProgress";
import { playError } from "../../lib/sound";
import { speedFactor } from "../../lib/motion";
import { hapticError } from "../../lib/haptics";
import type { TranslationKey } from "../../lib/i18n/keys";
import type { MpSeatMeta } from "../../lib/mpStore";
import { groupMeldsByOwner, layOffOptions } from "@/meld";
import { handPenalty } from "@/scorer";
import { CONTRACTS } from "@/types";
import type { Card, Meld, Player } from "@/types";
import type { RedactedView } from "@/mp/types";

function useGameId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("g"));
  }, []);
  return id;
}

// OpponentStrip wants Player[] with a `.hand` array; a redacted view only has
// counts, so pad the hand to the right length.
function stripPlayers(view: RedactedView): Player[] {
  return view.players.map((p) => ({
    id: `seat-${p.seat}`,
    name: p.name,
    isAI: p.isAI,
    hand: new Array(p.handCount).fill(null) as unknown as Card[],
    hasMeldedContract: p.hasMeldedContract,
    cumulativeScore: p.cumulativeScore,
  }));
}

const RANK_SUIT: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
  joker: "★",
};
const label = (c: Card, jokerAbbr: string) => `${c.rank === "JOKER" ? jokerAbbr : c.rank}${c.suit === "joker" ? "" : RANK_SUIT[c.suit]}`;

/** Mounts the global keyboard shortcuts — a component (not a hook call in the
 * page) because the page returns early before its handlers exist. */
function GameShortcuts({ handlers }: { handlers: ShortcutHandlers }) {
  useGameShortcuts(handlers);
  return null;
}

export default function MultiplayerPlayPage() {
  const router = useRouter();
  const { t, tPlural } = useT();
  const gameId = useGameId();
  const { loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const g = useMpGame(user ? gameId : null);
  const { view: rawView } = g;

  const [rematchBusy, setRematchBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [respondBusy, setRespondBusy] = useState<"accept" | "decline" | null>(null);
  const [layoffArmed, setLayoffArmed] = useState(false);
  const [roundSummaryFor, setRoundSummaryFor] = useState<number | null>(null);
  // Same hand-drawer treatment as solo/pass-and-play's game screen (see
  // game/page.tsx) — a bottom-sheet modal holding the hand + meld builder,
  // reachable via HandPreviewBar, instead of a permanently-inline hand.
  const [handDrawerOpen, setHandDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  // ≥1024px: the hand is a permanent dock beside the table (as in solo).
  const isWide = useMediaQuery(WIDE_TABLE_QUERY);
  const drawerVisible = handDrawerOpen && !isWide;
  // Same confirm-before-you-can't-take-it-back step as solo/pass-and-play's
  // discardSection (see game/page.tsx's confirmingDiscard) — holds the
  // card id, not the Card itself, since MP's own redacted view is what
  // resolves ids to cards (there's no local `player.hand` to look one up
  // in ahead of time the way solo has).
  const [confirmingDiscard, setConfirmingDiscard] = useState<string | null>(null);
  const handDrawerRef = useRef<HTMLDivElement | null>(null);
  const tableMeldsElRef = useRef<HTMLElement | null>(null);
  // A purely local display order for your own hand — "Sort by suit/rank"
  // and dragging a card both just set this, same UI as solo's sortHand/
  // reorderHand (see handSort.ts), but this never reaches the server: the
  // server's own hand order isn't meaningful here (a fresh poll can't tell
  // "you sorted it" from "nothing changed"), and there's no equivalent MP
  // move to persist it as. Reset only when a new round deals a genuinely
  // different hand of cards (see the effect below, keyed on view.round) —
  // not on every turn, since applyHandOrder already leaves a newly drawn
  // card in its natural slot without needing the sort thrown out.
  const [handOrder, setHandOrder] = useState<string[] | null>(null);
  // Seat id ("seat-N", matching stripPlayers' Player.id below) → that
  // opponent's bio, for OpponentStrip's popover. Fetched once the game is
  // dealt (mp_participants has real seat assignments by then) — a pending
  // game has no OpponentStrip on screen yet anyway.
  const [bioBySeatId, setBioBySeatId] = useState<Record<string, string>>({});
  // user_id -> current display name. mp_games.seats bakes in whatever each
  // player's name was AT INVITE TIME and never updates it, so without this
  // override, changing your display name after the invite went out leaves
  // both the pending "waiting for players" list and the active game itself
  // showing the stale one for that game's whole lifetime. Fetched for
  // pending games too (unlike bios above), since that's exactly the screen
  // this was reported stale on.
  const [namesByUserId, setNamesByUserId] = useState<Record<string, string>>({});
  // Whether this finished game is part of a tracked tournament series (see
  // tournamentsStore.ts) — looked up once the game's actually over, purely
  // to show a link to the series' standings/next-round page. The play
  // screen itself knows nothing else about tournaments; all of that lives
  // on /tournaments.
  const [tournamentLink, setTournamentLink] = useState<{ tournamentId: string; roundNumber: number } | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client || !gameId) return;
    let cancelled = false;
    getMpParticipantUserIds(client, gameId)
      .then(async (seatToUserId) => {
        const names = await fetchDisplayNamesFor(client, Object.values(seatToUserId));
        if (!cancelled) setNamesByUserId(names);
      })
      .catch((err) => console.error("Failed to load current display names:", err));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // Every downstream read of a player's name — standings, "X's turn",
  // table melds, the win banner — goes through view.players, so overriding
  // names once here (same technique game/page.tsx's stateForDisplay uses
  // for the solo game) fixes all of them at once instead of patching each
  // call site. Only ever touches .name; ids/scores/hand counts are
  // untouched, so every existing seat-keyed lookup still works.
  const view = useMemo(() => {
    if (!rawView) return rawView;
    return {
      ...rawView,
      players: rawView.players.map((p) =>
        p.userId && namesByUserId[p.userId] ? { ...p, name: namesByUserId[p.userId] } : p
      ),
    };
  }, [rawView, namesByUserId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !gameId || !view?.gameOver) return;
    getTournamentForGame(client, gameId)
      .then(setTournamentLink)
      .catch((err) => console.error("Failed to check tournament linkage:", err));
  }, [gameId, view?.gameOver]);

  useEffect(() => {
    const client = supabase;
    if (!client || !gameId || !view) return;
    let cancelled = false;
    getMpParticipantUserIds(client, gameId)
      .then(async (seatToUserId) => {
        const userIds = Object.values(seatToUserId);
        const bios = await fetchBiosFor(client, userIds);
        if (cancelled) return;
        const bySeat: Record<string, string> = {};
        for (const [seat, userId] of Object.entries(seatToUserId)) {
          if (bios[userId]) bySeat[`seat-${seat}`] = bios[userId];
        }
        setBioBySeatId(bySeat);
      })
      .catch((err) => console.error("Failed to load opponent bios:", err));
    return () => {
      cancelled = true;
    };
    // Only needs the game's identity, not every view update — participants
    // and bios don't change mid-game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, !!view]);

  const scores = useMemo(
    () => (view ? [...view.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore) : []),
    [view]
  );

  // Everything derived from the view below is memoised on the (now
  // structurally shared — see useMpGame's reconcile) view/hand identities, so
  // a refresh that changed nothing re-renders nothing of substance: no new
  // arrays for OpponentStrip/DraggableHand to diff, no new Set for the
  // lay-off badges.
  const opponentPlayers = useMemo(() => (view ? stripPlayers(view) : []), [view]);
  const visibleHandCards = g.visibleHand;
  const orderedVisibleHand = useMemo(
    () => applyHandOrder(visibleHandCards, handOrder),
    [visibleHandCards, handOrder]
  );
  const yourMelds = view?.melds;
  const meldedAlready = !!view?.players.find((p) => p.userId === user?.id)?.hasMeldedContract;
  const canLayOffNow = meldedAlready;
  const layoffEligibleIds = useMemo(() => {
    if (!canLayOffNow || !yourMelds) return undefined;
    return new Set(
      orderedVisibleHand.filter((c) => yourMelds.some((m) => layOffOptions(c, m).length > 0)).map((c) => c.id)
    );
  }, [canLayOffNow, orderedVisibleHand, yourMelds]);
  const { toggleCard } = g;
  const onCardTap = useCallback((card: Card) => toggleCard(card.id), [toggleCard]);
  const noopTap = useCallback(() => {}, []);

  // Card-flight overlay — the same draw / discard / meld cues solo has (see
  // game/page.tsx). Your own moves come from useMpGame's flightEvent; an
  // opponent's discard is inferred below from the discard pile's top card
  // changing under you. Purely cosmetic and best-effort (a missing anchor or
  // reduced-motion just means no flight).
  const cardFlightRef = useRef<CardFlightHandle>(null);
  const drawPileElRef = useRef<HTMLElement | null>(null);
  const discardPileElRef = useRef<HTMLElement | null>(null);
  const opponentAnchorRef = useRef<HTMLDivElement | null>(null);
  const lastFlightIdRef = useRef(0);
  const ownDiscardIdRef = useRef<string | null>(null);
  const { flightEvent } = g;
  useEffect(() => {
    if (!flightEvent || flightEvent.id === lastFlightIdRef.current) return;
    lastFlightIdRef.current = flightEvent.id;
    const fl = cardFlightRef.current;
    const handTarget: HTMLElement | null = handDrawerOpen || isWide
      ? document.querySelector('[data-tutorial="hand"]')
      : document.querySelector('[data-tutorial="hand-bar"]');
    if (flightEvent.kind === "draw") {
      fl?.fly([
        {
          card: flightEvent.card,
          from: flightEvent.fromDiscard ? discardPileElRef.current : drawPileElRef.current,
          to: handTarget,
          faceDown: !flightEvent.fromDiscard,
        },
      ]);
      return;
    }
    if (flightEvent.kind === "discard") {
      ownDiscardIdRef.current = flightEvent.discard?.id ?? null;
      if (flightEvent.discard) {
        fl?.fly([{ card: flightEvent.discard, from: handTarget, to: discardPileElRef.current }]);
      }
      return;
    }
    if (flightEvent.kind === "layoff") {
      const meldEl = document.querySelector<HTMLElement>(`[data-meld-id="${flightEvent.meldId}"]`) ?? tableMeldsElRef.current;
      fl?.fly([{ card: flightEvent.card, from: handTarget, to: meldEl }]);
      return;
    }
    // kind === "meld": same as solo — close the drawer so the fresh melds
    // are visible, then fly the cards onto Table melds once that layout has
    // settled.
    const handRect = document.querySelector('[data-tutorial="hand"]')?.getBoundingClientRect() ?? null;
    if (flightEvent.melded.length > 0) {
      setHandDrawerOpen(false);
      const cards = flightEvent.melded;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const section = tableMeldsElRef.current;
          let dest: HTMLElement | DOMRect | null = section;
          if (section && window.innerWidth < 640) {
            const r = section.getBoundingClientRect();
            const y = Math.max(90, Math.min(r.top + 24, window.innerHeight - 130));
            dest = new DOMRect(r.left, y, r.width, 44);
          }
          cardFlightRef.current?.fly(cards.map((c, i) => ({ card: c, from: handRect, to: dest, delay: i * 55 })));
        })
      );
    }
  }, [flightEvent, handDrawerOpen, isWide]);

  const discardTopId = view?.discardTop?.id ?? null;
  const prevDiscardTopRef = useRef<{ id: string | null; round: number | null } | null>(null);
  const opponentDiscardTop = view?.discardTop ?? null;
  const currentRound = view?.round ?? null;
  useEffect(() => {
    const prev = prevDiscardTopRef.current;
    prevDiscardTopRef.current = { id: discardTopId, round: currentRound };
    // Skip the first paint, an unchanged top, and a fresh deal's new pile.
    if (!prev || prev.id === null || prev.round !== currentRound) return;
    if (!opponentDiscardTop || prev.id === discardTopId) return;
    if (ownDiscardIdRef.current === discardTopId) {
      ownDiscardIdRef.current = null; // already animated as your own discard
      return;
    }
    cardFlightRef.current?.fly([
      { card: opponentDiscardTop, from: opponentAnchorRef.current, to: discardPileElRef.current },
    ]);
    // `opponentDiscardTop` is derived from discardTopId — keyed on the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discardTopId, currentRound]);

  // Reset the armed-layoff mode and any pending discard confirmation
  // whenever the turn context changes — both are per-turn transient UI
  // states that shouldn't linger into a new turn.
  useEffect(() => {
    setLayoffArmed(false);
    setConfirmingDiscard(null);
  }, [view?.currentSeat, view?.round, view?.youHaveDrawn]);

  // handOrder gets its own effect, keyed on round alone — the round is the
  // only one of the three above that actually means "this is a different
  // hand of cards" (a fresh deal). currentSeat/youHaveDrawn change every
  // single turn (an opponent's turn passing, or just drawing your own
  // card), and applyHandOrder already handles a newly drawn card fine on
  // its own — a card not yet named in `order` just keeps its existing
  // slot rather than needing the whole sort thrown out — so resetting on
  // those too was wiping a player's chosen sort after literally every
  // turn, not just when their hand was genuinely new.
  useEffect(() => {
    setHandOrder(null);
  }, [view?.round]);

  // Same guard as solo/pass-and-play's own effect (see game/page.tsx) —
  // drop a stale confirmation rather than let it reference a card that's no
  // longer selected.
  useEffect(() => {
    if (confirmingDiscard && !g.selectedIds.includes(confirmingDiscard)) {
      setConfirmingDiscard(null);
    }
  }, [g.selectedIds, confirmingDiscard]);

  // Same modal treatment as solo/pass-and-play's hand drawer (see
  // game/page.tsx's identical effect): stop the page behind it from
  // scrolling, close on Escape.
  useEffect(() => {
    if (!drawerVisible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setHandDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerVisible]);
  useFocusTrap(handDrawerRef, drawerVisible);

  // A rejected move gets a buzz + thud on top of the written error, like solo.
  useEffect(() => {
    if (g.error || g.groupError) {
      playError();
      hapticError();
    }
  }, [g.error, g.groupError]);

  // Same ambient-pad treatment as local play's game screen — see its own
  // comment for why this only reads the setting once, on mount.
  useEffect(() => {
    if (loadLocalSettings().ambientMusicEnabled) startAmbience();
    return () => stopAmbience();
  }, []);

  // Surface the "Round N results" beat when the server has advanced the round
  // since we last looked. seenRoundsRef starts at the count we mounted with so
  // an already-in-progress game doesn't flash an old round's summary.
  const seenRoundsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!view) return;
    const count = view.roundResults.length;
    if (seenRoundsRef.current === null) {
      seenRoundsRef.current = count;
      return;
    }
    if (count > seenRoundsRef.current && !view.gameOver) {
      setRoundSummaryFor(view.roundResults[count - 1].round);
    }
    seenRoundsRef.current = count;
  }, [view]);


  if (!authLoading && !user) {
    return (
      <Center>
        <h1 className="text-xl font-bold text-[var(--heading)]">{t("multiplayer.signInToPlay")}</h1>
        <Link href="/sign-in" className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow">
          {t("signIn.title")}
        </Link>
        <BackLink />
      </Center>
    );
  }

  if (!gameId || authLoading || g.status === "loading") return <Center><LoadingSpinner /></Center>;

  if (g.status === "error") {
    return (
      <Center>
        <p className="text-sm text-[var(--danger)]">{g.error ?? t("multiplayer.loadError")}</p>
        <BackLink />
      </Center>
    );
  }

  if (g.status === "cancelled") {
    return (
      <Center>
        <h1 className="text-xl font-bold text-[var(--heading)]">{t("multiplayer.cancelled.title")}</h1>
        <p className="text-sm text-[var(--muted)]">{t("multiplayer.cancelled.body")}</p>
        <BackLink />
      </Center>
    );
  }

  if (g.status === "pending" || g.status === "dealing") {
    const pendingSeats = ((g.pending?.seats ?? []) as MpSeatMeta[]).map((s) =>
      s.userId && namesByUserId[s.userId] ? { ...s, name: namesByUserId[s.userId] } : s
    );
    const pendingParticipants = g.pending?.participants ?? [];
    const isHost = !!user && g.pending?.host_id === user.id;
    // A push notification for a new invite (mp/index.ts's sendPushForEvent)
    // deep-links straight here rather than to Home — without this, an
    // invitee who arrived that way could only ever see everyone else's
    // status, with no way to act on their own invite short of backing out
    // to Home, where the exact same accept/decline exists (see
    // page.tsx's HomeGames).
    const myParticipant = pendingParticipants.find((p) => p.user_id === user?.id);
    const needsMyResponse = !isHost && myParticipant?.invite_status === "invited";

    async function handleCancelPending() {
      setCancelBusy(true);
      await g.cancelPending();
      setCancelBusy(false);
    }

    async function handleRespondPending(accept: boolean) {
      setRespondBusy(accept ? "accept" : "decline");
      await g.respondPending(accept);
      setRespondBusy(null);
    }

    return (
      <Center>
        <h1 className="text-xl font-bold text-[var(--heading)]">
          {g.status === "dealing" ? t("multiplayer.dealing") : t("multiplayer.waitingForPlayers")}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {g.status === "dealing" ? t("multiplayer.dealingBody") : t("multiplayer.waitingForPlayersBody")}
        </p>

        {g.status === "pending" && pendingParticipants.length > 0 && (
          <ul className="flex w-full flex-col gap-1.5 text-left">
            {pendingParticipants.map((p) => {
              const seat = pendingSeats.find((s) => s.userId === p.user_id);
              const accepted = p.invite_status === "accepted";
              return (
                <li
                  key={p.user_id}
                  className="flex items-center justify-between gap-3 rounded-md bg-[var(--panel-soft)] px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-[var(--heading)]">{seat?.name ?? t("multiplayer.someone")}</span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      accepted ? "text-[var(--accent)]" : "text-[var(--faint)]"
                    }`}
                  >
                    {accepted ? t("multiplayer.accepted") : t("multiplayer.waiting")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {g.error && <p className="text-xs text-[var(--danger)]">{g.error}</p>}

        {needsMyResponse && (
          <div className="flex w-full gap-2">
            <button
              onClick={() => handleRespondPending(true)}
              disabled={respondBusy !== null}
              className="flex-1 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {respondBusy === "accept" ? t("multiplayer.accepting") : t("multiplayer.accept")}
            </button>
            <button
              onClick={() => handleRespondPending(false)}
              disabled={respondBusy !== null}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
            >
              {respondBusy === "decline" ? t("multiplayer.declining") : t("multiplayer.decline")}
            </button>
          </div>
        )}

        <button
          onClick={g.refresh}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("common.refresh")}
        </button>

        {/* Only the host can withdraw a still-pending invite — an invitee
            declines instead, above (or from Home — same respondToMpGame). */}
        {g.status === "pending" && isHost && (
          <button
            onClick={handleCancelPending}
            disabled={cancelBusy}
            className="text-sm text-[var(--danger)] underline hover:opacity-80 disabled:opacity-50"
          >
            {cancelBusy ? t("multiplayer.cancelling") : t("multiplayer.cancelThisGame")}
          </button>
        )}

        <BackLink />
      </Center>
    );
  }

  if (!view) return <Center><LoadingSpinner /></Center>;

  const me = view.players.find((p) => p.userId === user?.id) ?? null;
  const currentName = view.players.find((p) => p.seat === view.currentSeat)?.name ?? t("multiplayer.someoneLower");

  if (view.gameOver) {
    const iWon = view.winnerSeat != null && view.players[view.winnerSeat]?.userId === user?.id;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
        <UnlockToast items={g.newlyUnlockedCosmetics} onDismiss={g.clearNewlyUnlockedCosmetics} />
        <BackLink />
        <h1 className="text-2xl font-bold text-[var(--heading)]">
          {iWon
            ? t("multiplayer.youWon")
            : t("multiplayer.playerWon", { name: view.winnerSeat != null ? view.players[view.winnerSeat].name : t("multiplayer.nobody") })}
        </h1>
        <ol className="flex flex-col gap-2">
          {scores.map((p, i) => (
            <li key={p.seat} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="text-sm font-medium text-[var(--heading)]">
                {i + 1}. {p.name}
                {p.resigned && <span className="ml-2 text-xs text-[var(--faint)]">{t("multiplayer.left")}</span>}
              </span>
              <span className="text-sm font-semibold text-[var(--muted)]">{p.cumulativeScore}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-[var(--faint)]">{t("multiplayer.recordedToStats")}</p>

        {g.unlockedAchievements.length > 0 && (
          <AchievementUnlockCard
            items={g.unlockedAchievements}
            heading={tPlural("multiplayer.achievementUnlocked", g.unlockedAchievements.length)}
          />
        )}

        {/* This "Rematch" button is a plain one-off — the tracked way to
            continue a tournament series is the tournament page's own
            "Start next round" (see tournamentsStore.ts's own doc), which
            also records the new game as the series' next round. Someone
            could still tap this instead, but it wouldn't be linked to the
            series. */}
        {tournamentLink && (
          <Link
            href={`/tournaments?id=${tournamentLink.tournamentId}`}
            className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-center text-sm font-medium text-[var(--heading)] hover:bg-[var(--accent)]/15"
          >
            {t("multiplayer.tournamentRound", { round: tournamentLink.roundNumber })}
          </Link>
        )}

        <button
          onClick={async () => {
            setRematchBusy(true);
            const id = await g.rematch();
            setRematchBusy(false);
            if (id) router.push(`/multiplayer/play?g=${id}`);
          }}
          disabled={rematchBusy}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
        >
          {rematchBusy ? t("multiplayer.settingUp") : t("multiplayer.rematch")}
        </button>
        {g.error && <p className="text-xs text-[var(--danger)]">{g.error}</p>}
      </main>
    );
  }

  const isMyTurn = g.myTurn;
  const drawn = g.youHaveDrawn;
  const acting = isMyTurn && drawn;
  const alreadyMelded = !!me?.hasMeldedContract;
  const canLayOff = canLayOffNow;

  const { stagedBooks, stagedRuns, contractStaged } = g;
  // Hand emptied by melding / laying off: nothing to discard, so the turn
  // ends with an explicit "Go out" (solo does the same once the hand is empty).
  const goingOut = view.yourHand.length === 0 && alreadyMelded;
  const canEndTurn = acting && goingOut && !g.busy;
  const oneSelected = g.selectedIds.length === 1;

  const selectedCard = oneSelected ? view.yourHand.find((c) => c.id === g.selectedIds[0]) ?? null : null;
  const layoffTargets = selectedCard
    ? view.melds.filter((m) => layOffOptions(selectedCard, m).length > 0).map((m) => m.id)
    : [];
  // Same badge solo's DiscardPile shows (see game/page.tsx's
  // discardTopCanLayOff) — was missing here even though the pieces
  // (layOffOptions, the same canLayOff gate the hand cards already use)
  // were already in place.
  const discardTopCanLayOff = canLayOff && !!view.discardTop && view.melds.some((m) => layOffOptions(view.discardTop!, m).length > 0);

  const meldsByOwner = groupMeldsByOwner(view.melds);

  // Assist + confirm settings (same meanings as solo — see settingsStore.ts).
  const savedSettings = loadLocalSettings();
  const showLegalMoves = savedSettings.showLegalMoves;
  const confirmDiscardSetting = savedSettings.confirmDiscard;
  const progress = showLegalMoves && isMyTurn && !alreadyMelded ? contractProgress(view.yourHand, { ...view.contract, round: view.round, label: view.roundLabel }) : null;
  const progressLine = progress ? progressLineFor(progress) : null;

  function progressLineFor(p: ContractProgress): string {
    if (p.booksReady >= p.booksNeeded && p.runsReady >= p.runsNeeded) return t("game.progress.ready");
    const parts: string[] = [];
    if (p.booksNeeded > 0) {
      let part = t("game.progress.books", { ready: p.booksReady, need: p.booksNeeded });
      if (p.booksReady < p.booksNeeded && p.nextBook) {
        part += ` — ${t("game.progress.closestBook", { rank: p.nextBook.rank, have: p.nextBook.have, need: p.nextBook.need })}`;
      }
      parts.push(part);
    }
    if (p.runsNeeded > 0) {
      let part = t("game.progress.runs", { ready: p.runsReady, need: p.runsNeeded });
      if (p.runsReady < p.runsNeeded && p.nextRun) {
        part += ` — ${t("game.progress.closestRun", { suit: t(`card.suit.${p.nextRun.suit}` as TranslationKey), have: p.nextRun.have, need: p.nextRun.need })}`;
      }
      parts.push(part);
    }
    return parts.join(" · ");
  }

  // Why an action is greyed out, in words (Show legal moves assist).
  let whyMeld: string | null = null;
  if (!drawn) whyMeld = t("game.why.drawFirst");
  else if (g.pendingRunChoice) whyMeld = t("game.why.finishWildChoice");
  else if (!contractStaged) {
    if (stagedBooks > view.contract.books || stagedRuns > view.contract.runs) whyMeld = t("game.why.tooManyGroups");
    else {
      whyMeld = t("game.why.groupMore", {
        need: contractNeedLabel(
          Math.max(0, view.contract.books - stagedBooks),
          Math.max(0, view.contract.runs - stagedRuns),
          tPlural
        ),
      });
    }
  }
  let whyDiscard: string | null = null;
  if (!drawn) whyDiscard = t("game.why.drawFirst");
  else if (g.selectedIds.length === 0) whyDiscard = t("game.why.selectToDiscard");
  else if (g.selectedIds.length > 1) whyDiscard = t("game.why.selectOneToDiscard");

  // One-tap discard when Settings → Confirm before discarding is off.
  function requestDiscard() {
    if (!oneSelected || !drawn || g.busy) return;
    if (confirmDiscardSetting) setConfirmingDiscard(g.selectedIds[0]);
    else void g.discard(g.selectedIds[0]);
  }

  const shortcutHandlers: ShortcutHandlers = {
    draw: () => {
      if (isMyTurn && !drawn && !g.busy) void g.draw("stock");
    },
    drawDiscard: () => {
      if (isMyTurn && !drawn && !g.busy && view.discardTop) void g.draw("discard");
    },
    sortRank: () => sortHand("rank"),
    sortSuit: () => sortHand("suit"),
    group: () => {
      if (!isMyTurn) return;
      if (!drawn) return;
      if (!alreadyMelded) {
        if (g.selectedIds.length > 0) g.stageGroup();
        else if (contractStaged && !g.busy) void g.confirmMeld();
      } else if (oneSelected && layoffTargets.length === 1 && selectedCard) {
        const meld = view.melds.find((m) => m.id === layoffTargets[0]);
        const opts = meld ? layOffOptions(selectedCard, meld) : [];
        if (meld && opts.length > 0) void g.layOff(selectedCard.id, meld.id, opts.length === 1 ? opts[0] : "low");
      }
    },
    discard: () => {
      if (isMyTurn && !goingOut) requestDiscard();
    },
    focusHand: () => {
      const focus = () =>
        document.querySelector<HTMLElement>('[data-nav-zone="hand"] [role="button"][tabindex="0"]')?.focus();
      if (isWide || handDrawerOpen) focus();
      else {
        setHandDrawerOpen(true);
        setTimeout(focus, 60);
      }
    },
    help: () => setHelpOpen((o) => !o),
    escape: () => {
      if (helpOpen) setHelpOpen(false);
      else if (confirmingDiscard) setConfirmingDiscard(null);
    },
  };

  // Same purely-local sort/reorder as game/page.tsx's hand drawer — see
  // handOrder's own doc for why this never reaches the server. Both work on
  // the *whole* hand's order, not just what's visible: cards staged into a
  // meld are hidden right now but must come back into their sorted /
  // dragged-to slot when unstaged, not jump to the server's ordering.
  function sortHand(mode: SortMode) {
    setHandOrder([...view!.yourHand].sort(compareByMode(mode)).map((c) => c.id));
  }

  function reorderHand(visibleOrder: string[]) {
    const fullIds = applyHandOrder(view!.yourHand, handOrder).map((c) => c.id);
    setHandOrder(mergeVisibleOrder(fullIds, visibleOrder));
  }

  function onMeldClick(meld: Meld) {
    if (!layoffArmed || !selectedCard) return;
    const opts = layOffOptions(selectedCard, meld);
    if (opts.length === 0) return;
    setLayoffArmed(false);
    void g.layOff(selectedCard.id, meld.id, opts.length === 1 ? opts[0] : "low");
  }

  // Arming a lay-off means tapping a meld on the page *behind* the drawer's
  // own backdrop, which blocks that tap outright while the drawer's open —
  // same reasoning as game/page.tsx's handleLayOffFromDrawer, and the same
  // fix: close the drawer and scroll Table melds into view so the
  // now-highlighted meld is actually reachable.
  function armLayoffFromDrawer() {
    setLayoffArmed((v) => {
      const next = !v;
      if (next) {
        setHandDrawerOpen(false);
        tableMeldsElRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return next;
    });
  }

  // The hand + meld builder + discard controls — the modal drawer on phones,
  // the always-visible dock beside the table on wide screens.
  const drawerBody = (
    <>
            {g.error && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--danger)]/50 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
              >
                <span>{g.error}</span>
                <button onClick={g.dismissError} aria-label={t("common.dismiss")} className="shrink-0 text-xs opacity-80 hover:opacity-100">
                  ✕
                </button>
              </div>
            )}

            {/* Always rendered whenever it's your turn — matching solo's
                buildMeldSection/discardSection (see game/page.tsx), which
                stay mounted and only disable individual buttons rather than
                disappearing outright. Previously this whole section was
                gated on `acting` (isMyTurn && drawn), so opening "Manage
                your hand" before drawing — entirely possible, since the
                draw buttons live outside this drawer — showed no meld/
                discard controls at all. */}
            {/* Same three-part shape as solo/pass-and-play's drawer (see
                game/page.tsx's buildMeldSection/discardSection/handSection):
                a build-meld card, a lay-off/discard row, then the hand
                itself. Every button is its own server action, like solo's:
                Confirm Meld lays the contract down for everyone at once,
                lay-offs are immediate, Discard/Go out ends the turn. */}
            {isMyTurn && !alreadyMelded && (
              <section
                data-tutorial="build-meld"
                className="panel-elevated flex flex-col items-center gap-3 rounded-xl bg-[var(--panel-soft)] p-4 text-center"
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                  {t("game.buildMeld.heading", { need: contractNeedLabel(view.contract.books, view.contract.runs, tPlural) })}
                </h2>

                {!drawn && (
                  <p className="text-xs text-[var(--accent)]">{t("multiplayer.drawFirst")}</p>
                )}

                {g.draft.groups.length > 0 && (
                  <div className="flex w-full flex-col gap-2 text-left">
                    {g.draft.groups.map((grp) => (
                      <div
                        key={grp.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--panel)] p-2"
                      >
                        <span className="w-12 shrink-0 text-xs font-semibold capitalize text-[var(--accent)]">
                          {grp.type === "book" ? t("game.meld.book") : t("game.meld.run")}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {grp.cardIds
                            .map((id) => view.yourHand.find((c) => c.id === id))
                            .filter((c): c is Card => !!c)
                            .map((c) => <PlayingCard key={c.id} card={c} small />)}
                        </div>
                        <button
                          onClick={() => g.unstageGroup(grp.id)}
                          className="ml-auto text-xs text-[var(--danger)] hover:opacity-80"
                        >
                          {t("common.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {g.pendingRunChoice && (
                  <div className="flex w-full flex-col items-center gap-2 rounded-lg border border-[var(--accent)]/60 bg-[var(--panel)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                      {t("game.buildMeld.wildPrompt")}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {g.pendingRunChoice.options.map((start) => (
                        <button
                          key={start}
                          onClick={() => g.chooseRunStart(start)}
                          className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] hover:bg-[var(--panel-soft)]"
                        >
                          {wildStandInLabel(g.pendingRunChoice!.cards, g.contract!, start, t("card.jokerAbbr"))}
                        </button>
                      ))}
                      <button
                        onClick={g.cancelRunChoice}
                        className="text-sm text-[var(--faint)] hover:text-[var(--muted)]"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {g.groupError && (
                  <p role="alert" className="text-xs text-[var(--danger)]">
                    {g.groupError}
                  </p>
                )}
                {progressLine && drawn && !isWide && (
                  <p className="text-xs font-medium text-[var(--accent)]">{progressLine}</p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => g.stageGroup()}
                    disabled={!drawn || g.selectedIds.length === 0 || !!g.pendingRunChoice}
                    className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("game.buildMeld.groupSelected")}
                  </button>
                  <button
                    data-tutorial="confirm-meld"
                    onClick={() => void g.confirmMeld()}
                    disabled={!drawn || !contractStaged || !!g.pendingRunChoice || g.busy}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("game.buildMeld.confirmMeld")}
                  </button>
                </div>
                {showLegalMoves && whyMeld && (
                  <p role="status" aria-live="polite" className="text-xs text-[var(--faint)]">
                    {whyMeld}
                  </p>
                )}
              </section>
            )}

            {isMyTurn && (
              <section data-tutorial="discard-btn" className="flex flex-col items-center gap-3">
                {!alreadyMelded && g.draft.groups.length > 0 && (
                  <p className="text-xs text-[var(--faint)]">
                    <span className={contractStaged ? "text-[var(--accent)]" : undefined}>
                      {t("multiplayer.contractStatus", {
                        stagedBooks,
                        books: view.contract.books,
                        stagedRuns,
                        runs: view.contract.runs,
                      })}
                      {contractStaged ? " ✓" : ""}
                    </span>
                  </p>
                )}
                {confirmingDiscard ? (
                  <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg bg-[var(--panel-soft)] px-4 py-2">
                    <span className="text-sm text-[var(--muted)]">
                      {t("game.discard.confirmPrompt", {
                        card: label(view.yourHand.find((c) => c.id === confirmingDiscard)!, t("card.jokerAbbr")),
                      })}
                    </span>
                    <button
                      onClick={async () => {
                        const cardId = confirmingDiscard;
                        if (!cardId) return;
                        const ok = await g.discard(cardId);
                        if (ok) setConfirmingDiscard(null);
                      }}
                      disabled={g.busy}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-40"
                    >
                      {g.busy ? "…" : t("common.confirm")}
                    </button>
                    <button
                      onClick={() => setConfirmingDiscard(null)}
                      className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel)]"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {canLayOff && (
                      <button
                        onClick={armLayoffFromDrawer}
                        disabled={!drawn || !oneSelected || layoffTargets.length === 0}
                        className={`rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40 ${
                          isWide ? "hidden" : ""
                        }`}
                      >
                        {tPlural("game.discard.layOffCard", 1)}
                      </button>
                    )}
                    {!goingOut && (
                      <button
                        onClick={requestDiscard}
                        disabled={!drawn || !oneSelected || g.busy}
                        className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t("game.discard.discardSelected")}
                      </button>
                    )}
                    {showLegalMoves && !goingOut && whyDiscard && (
                      <p role="status" aria-live="polite" className="w-full text-center text-xs text-[var(--faint)]">
                        {whyDiscard}
                      </p>
                    )}
                    {goingOut && (
                      <button
                        onClick={() => void g.goOut()}
                        disabled={!canEndTurn}
                        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {g.busy ? "…" : t("multiplayer.goOut")}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            <section data-tutorial="hand">
              <div className="mb-2 flex flex-col items-center gap-2 text-center">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                  {t("game.hand.yourHand")}
                  <span className="ml-2 font-normal normal-case text-[var(--muted)]">
                    ({t("game.hand.pts", { count: handPenalty(orderedVisibleHand) })})
                  </span>
                  {alreadyMelded && <span className="ml-2 text-[var(--accent)]">{t("game.hand.contractMelded")}</span>}
                </h2>
                <HandSortButtons onSort={sortHand} />
              </div>
              {orderedVisibleHand.length === 0 ? (
                <p className="text-sm text-[var(--faint)]">{t("multiplayer.handEmpty")}</p>
              ) : (
                <DraggableHand
                  key={`${view.round}-${view.yourSeat}`}
                  cards={orderedVisibleHand}
                  selectedCardIds={g.selectedIds}
                  lastDrawnCardId={g.lastDrawnCardId}
                  onCardClick={acting ? onCardTap : noopTap}
                  onReorder={reorderHand}
                  layoffEligibleIds={layoffEligibleIds}
                  hintIds={progress?.hintCardIds}
                />
              )}
              <p className="mt-1 text-center text-xs text-[var(--faint)]">{t("game.hand.dragToReorder")}</p>
            </section>
    </>
  );

  return (
    <main
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-6xl xl:max-w-7xl"
      style={{ "--motion-scale": speedFactor() } as React.CSSProperties}
    >
      <GameShortcuts handlers={shortcutHandlers} />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConfirmDialog
        open={resignOpen}
        danger
        title={t("multiplayer.resignTitle")}
        body={t("multiplayer.resignBody")}
        confirmLabel={t("multiplayer.resignConfirm")}
        onCancel={() => setResignOpen(false)}
        onConfirm={() => {
          setResignOpen(false);
          g.resign();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <BackLink />
        <div className="flex items-center gap-2">
          <Link
            href={`/how-to-play?from=mp&g=${gameId ?? ""}`}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {t("common.howToPlay")}
          </Link>
          <button
            onClick={() => setHelpOpen(true)}
            aria-label={t("shortcuts.openHelp")}
            title={t("shortcuts.openHelp")}
            className="hidden rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--panel-soft)] sm:inline-block"
          >
            ?
          </button>
          <SoundQuickToggle />
          <button
            onClick={() => setResignOpen(true)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {t("multiplayer.leave")}
          </button>
        </div>
      </div>

      <PageTip id="multiplayer-play" title={t("multiplayer.playingAsync")}>
        {t("multiplayer.playingAsyncBody")}
      </PageTip>

      <header className="panel-elevated flex items-center justify-between gap-3 rounded-xl bg-[var(--panel)] px-4 py-3">
        <div className="shrink-0 text-left">
          <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
            {t("game.roundOf", { round: view.round, total: view.totalRounds })}
          </p>
          <p className="text-lg font-bold leading-tight text-[var(--heading)]">
            {(() => {
              const found = CONTRACTS.find((c) => c.round === view.round);
              return found ? contractNeedLabel(found.books, found.runs, tPlural) : view.roundLabel;
            })()}
          </p>
        </div>
        <div className="min-w-0 px-1 text-center">
          <p className="text-xs uppercase tracking-wide text-[var(--faint)]">{t("game.hand.yourHand")}</p>
          <p className="text-lg font-bold leading-tight text-[var(--heading)]">
            {t("game.hand.pts", { count: handPenalty(view.yourHand) })}
          </p>
        </div>
        <ul className="shrink-0 space-y-1 text-right text-xs text-[var(--muted)]">
          {scores.map((p) => (
            <li key={p.seat} className="flex items-center justify-end gap-1">
              {p.userId === user?.id && level && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[var(--accent)]">
                  {t("game.levelBadge", { level: level.level })}
                </span>
              )}
              {p.isAI && p.difficulty && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[var(--muted)]">
                  {t("game.levelBadge", { level: AI_THEORETICAL_LEVEL[p.difficulty] })}
                </span>
              )}
              <span className="truncate">
                {p.name}: <span className="font-semibold text-[var(--heading)]">{p.cumulativeScore}</span>
                {p.resigned && p.pendingResignPenalty != null && (
                  <span className="ml-1 text-[11px] text-[var(--faint)]">
                    {t("multiplayer.leftPending", { penalty: p.pendingResignPenalty })}
                  </span>
                )}
                {p.resigned && p.pendingResignPenalty == null && (
                  <span className="ml-1 text-[11px] text-[var(--faint)]">{t("multiplayer.left")}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </header>

      <div ref={opponentAnchorRef}>
        <OpponentStrip
          players={opponentPlayers}
          currentPlayerIndex={view.currentSeat}
          discardHistory={view.discardHistory}
          pickupHistory={view.pickupHistory}
          aiStatus={null}
          aiThinking={false}
          bios={bioBySeatId}
        />
      </div>

      {g.syncFailed && (
        <p className="text-center text-xs text-[var(--faint)]">{t("multiplayer.syncError")}</p>
      )}

      {/* While the hand drawer is open its own copy of this (below) is the
          one you can actually see — this one sits behind the drawer's
          backdrop, which is where a rejected meld used to vanish. */}
      {g.error && !handDrawerOpen && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {g.error}
        </p>
      )}

      {roundSummaryFor != null &&
        (() => {
          const rr = view.roundResults.find((r) => r.round === roundSummaryFor);
          if (!rr) return null;
          const ranked = [...rr.scores].sort((a, b) => a.penalty - b.penalty);
          return (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--heading)]">
                  {t("multiplayer.roundSummary.heading", {
                    round: rr.round,
                    label: (() => {
                      const found = CONTRACTS.find((c) => c.round === rr.round);
                      return found ? contractNeedLabel(found.books, found.runs, tPlural) : rr.label;
                    })(),
                  })}
                </h2>
                <button
                  onClick={() => setRoundSummaryFor(null)}
                  className="rounded p-0.5 text-sm text-[var(--faint)] hover:text-[var(--muted)]"
                  aria-label={t("common.dismiss")}
                >
                  ✕
                </button>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {ranked.map((s) => (
                  <li key={s.seat} className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">
                      {view.players.find((p) => p.seat === s.seat)?.name ?? t("multiplayer.seatN", { seat: s.seat })}
                    </span>
                    <span className="text-[var(--heading)]">
                      {s.resignPenalty != null
                        ? t("multiplayer.roundSummary.leftPenalty", { penalty: s.resignPenalty })
                        : `+${s.penalty}`}{" "}
                      <span className="text-[var(--faint)]">({s.cumulative})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--faint)]">
                {t("multiplayer.roundSummary.nextRound", { round: rr.round + 1 })}
              </p>
            </section>
          );
        })()}

      {!view.gameOver && g.turnLimitHours > 0 && (
        <div className="flex justify-center">
          <TurnTimerBadge
            turnLimitHours={g.turnLimitHours}
            turnStartedAt={g.turnStartedAt}
            isMine={isMyTurn}
            missedTurns={isMyTurn ? g.yourMissedTurns : 0}
          />
        </div>
      )}

      {/* Wide: piles + status form a centered band across the full width,
          above the melds | hand pair (piles first, as in solo). Narrow:
          display:contents, DOM order unchanged. */}
      <div className={isWide ? "flex flex-col gap-6" : "contents"}>
      <div className={isWide ? "mx-auto flex w-full max-w-xl flex-col items-stretch gap-6" : "contents"}>
      <div className={isWide ? "order-2 flex flex-col gap-3" : "contents"}>
      {!isMyTurn ? (
        <div className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-center text-sm text-[var(--muted)]">
          <p>
            {t("multiplayer.waitingForTurn.prefix")}{" "}
            <strong className="text-[var(--heading)]">{currentName}</strong>{" "}
            {t("multiplayer.waitingForTurn.suffix")}
          </p>
          {view.currentUserId && view.currentUserId !== user?.id && (
            <button
              onClick={() => g.nudge()}
              disabled={g.nudgeState !== "idle"}
              className="mt-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel)] disabled:opacity-60"
            >
              {g.nudgeState === "sent"
                ? t("multiplayer.nudged")
                : g.nudgeState === "error"
                  ? t("multiplayer.cantNudgeYet")
                  : t("multiplayer.nudgeName", { name: currentName })}
            </button>
          )}
          {g.daysSinceMove != null && g.daysSinceMove >= 14 && (
            <p className="mt-1 text-xs text-[var(--faint)]">
              {t("multiplayer.abandonedNotice", { days: g.daysSinceMove })}
            </p>
          )}
        </div>
      ) : (
        // Same fixed-height slot whether or not you've drawn, so drawing
        // doesn't shift the table (see solo's turn-status slot).
        <p
          role="status"
          aria-live="polite"
          className="flex min-h-[3.25rem] items-center justify-center rounded-lg bg-[var(--accent)]/10 px-4 py-3 text-center text-sm font-medium text-[var(--accent)]"
        >
          {!drawn
            ? t("multiplayer.yourTurnDraw")
            : (progressLine ?? (alreadyMelded ? t("game.turnHint.melded") : t("game.turnHint.drawn")))}
        </p>
      )}

      </div>
      <section data-nav-zone="piles" className={`flex items-start justify-center gap-8 ${isWide ? "order-1" : ""}`}>
        <div className="flex flex-col items-center gap-1">
          <button
            ref={(el) => {
              drawPileElRef.current = el;
            }}
            disabled={!isMyTurn || drawn || g.busy}
            onClick={() => g.draw("stock")}
            className={`rounded-lg disabled:opacity-50 ${showLegalMoves && isMyTurn && !drawn ? "legal-pulse" : ""}`}
            title={`${t("game.drawFromPile")} (D)`}
            aria-label={t("game.drawFromPile")}
          >
            <DrawPile count={view.drawPileCount} />
          </button>
          <span className="text-xs text-[var(--faint)]">{t("game.draw", { count: view.drawPileCount })}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            ref={(el) => {
              discardPileElRef.current = el;
            }}
            disabled={!isMyTurn || drawn || g.busy || !view.discardTop}
            onClick={() => g.draw("discard")}
            className={`rounded-lg disabled:opacity-50 ${
              showLegalMoves && isMyTurn && !drawn && view.discardTop ? "legal-pulse" : ""
            }`}
            title={`${t("multiplayer.takeDiscardTop")} (Shift+D)`}
            aria-label={t("multiplayer.takeDiscardTop")}
          >
            <DiscardPile cards={view.discardPile} canLayOff={discardTopCanLayOff} />
          </button>
          <span className="text-xs text-[var(--faint)]">{t("game.discardPile")}</span>
        </div>
      </section>

      {gameId && (
        <div className={isWide ? "order-3" : "contents"}>
        <MpTableExtras
          gameId={gameId}
          players={view.players}
          myUserId={user?.id}
        />
        </div>
      )}
      </div>

      <div className={isWide ? "grid grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] items-stretch gap-6" : "contents"}>
      <section ref={tableMeldsElRef} data-nav-zone="melds" className="panel-elevated rounded-xl bg-[var(--panel-soft)] p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("game.tableMelds.heading")}</h2>
        {view.melds.length === 0 ? (
          <p className="text-sm text-[var(--faint)]">{t("multiplayer.noMeldsThisRound")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {meldsByOwner.map(([ownerId, melds]) => (
              <div key={ownerId}>
                <p className="mb-1 text-[11px] text-[var(--faint)]">
                  {view.players[Number(ownerId.replace("seat-", ""))]?.name ?? ownerId}
                </p>
                <div className="flex flex-wrap gap-2">
                  {melds.map((meld) => {
                    const armed = layoffArmed && layoffTargets.includes(meld.id);
                    return (
                      <button
                        key={meld.id}
                        data-meld-id={meld.id}
                        onClick={() => onMeldClick(meld)}
                        disabled={!armed}
                        className={`rounded-lg p-1 text-left transition ${armed ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : ""}`}
                      >
                        <span className="flex items-end gap-1">
                          {meld.cards.map((c) => (
                            <PlayingCard key={c.id} card={c} small />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Same hand-drawer pattern as solo/pass-and-play (see game/page.tsx):
          a permanent, fixed preview bar is the entry point, tapping it opens
          a bottom-sheet modal with the sortable hand and (while it's your
          actionable turn) the meld builder. Available any time the game's
          on screen, not just on your turn — unlike solo, this is always
          *your own* hand (opponents' are redacted), so there's no reason to
          hide it while waiting. */}
      {isWide && (
        // Wide screens: the hand is a permanent dock beside the melds (see
        // solo's game/page.tsx). Phones keep the modal drawer below.
        <div className="min-w-0">
        <aside
          data-tutorial="hand-bar"
          data-testid="hand-dock"
          aria-label={t("game.manageHand")}
          className="panel-elevated sticky top-28 flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto rounded-xl bg-[var(--panel-soft)] p-4"
        >
          {drawerBody}
        </aside>
        </div>
      )}
      </div>
      </div>

      {!isWide && <HandPreviewBar cards={orderedVisibleHand} onTap={() => setHandDrawerOpen(true)} />}
      {drawerVisible && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setHandDrawerOpen(false)}
            className="fixed inset-0 z-[45] bg-black/50"
          />
          <div
            ref={handDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("game.manageHand")}
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-[46] mx-auto flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg)] p-4 shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--heading)]">{t("game.manageHand")}</h2>
              <button
                onClick={() => setHandDrawerOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
              >
                {t("common.done")}
              </button>
            </div>
            {drawerBody}
          </div>
        </>
      )}
      {!isWide && <div aria-hidden="true" className="h-20 md:h-28" />}
      <CardFlightLayer ref={cardFlightRef} />
    </main>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

