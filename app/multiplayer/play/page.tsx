"use client";

// The multiplayer game screen (`?g=<id>`). Driven by `useMpGame`, which
// talks to the Edge Function and only ever holds this player's redacted
// view. A turn is two round trips: draw (server returns the card), stage
// the whole turn locally in the meld builder, then commit (groups +
// lay-offs + discard, atomic). Shows "waiting for X" when it's not your
// turn, the round summary between rounds, and standings + achievement
// unlocks at game over. Manual resign only.
//
// The board (piles, table melds, and the hand drawer — DraggableHand plus
// Sort by suit/rank) mirrors solo/pass-and-play's game screen (see
// game/page.tsx) as closely as this mode's different turn model allows: a
// turn here is staged then committed as one atomic move, so the drawer's
// meld-builder panel reflects useMpGame's draft/commitTurn instead of
// GameContext's immediate confirmMeld/layOff/discard. Hand sort/reorder is
// purely local display order (see handSort.ts) — there's no MP move to
// persist it as, and the server's own card order isn't meaningful here.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../AuthContext";
import { usePlayerLevel } from "../../PlayerLevelContext";
import { BackLink } from "../../components/BackLink";
import { DraggableHand } from "../../components/DraggableHand";
import { HandPreviewBar } from "../../components/HandPreviewBar";
import { HandSortButtons } from "../../components/HandSortButtons";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { OpponentStrip } from "../../components/OpponentStrip";
import { PageTip } from "../../components/PageTip";
import { SoundQuickToggle } from "../../components/SoundQuickToggle";
import { DiscardPile, DrawPile } from "../../components/Piles";
import { PlayingCard } from "../../components/PlayingCard";
import { AchievementUnlockCard } from "../../components/AchievementUnlock";
import { UnlockToast } from "../../components/UnlockToast";
import { useMpGame } from "../../lib/useMpGame";
import { AI_THEORETICAL_LEVEL } from "../../lib/aiPersonas";
import { startAmbience, stopAmbience } from "../../lib/ambience";
import { contractNeedLabel } from "../../lib/contractDisplay";
import { applyHandOrder, compareByMode, SortMode } from "../../lib/handSort";
import { fetchBiosFor, fetchDisplayNamesFor } from "../../lib/leaderboardStore";
import { getMpParticipantUserIds } from "../../lib/mpStore";
import { loadLocalSettings } from "../../lib/settingsStore";
import { supabase } from "../../lib/supabaseClient";
import { getTournamentForGame } from "../../lib/tournamentsStore";
import { useFocusTrap } from "../../lib/useFocusTrap";
import type { MpSeatMeta } from "../../lib/mpStore";
import { groupMeldsByOwner, layOffOptions } from "@/meld";
import { handPenalty } from "@/scorer";
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
const label = (c: Card) => `${c.rank === "JOKER" ? "Jkr" : c.rank}${c.suit === "joker" ? "" : RANK_SUIT[c.suit]}`;

export default function MultiplayerPlayPage() {
  const router = useRouter();
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
    if (!handDrawerOpen) return;
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
  }, [handDrawerOpen]);
  useFocusTrap(handDrawerRef, handDrawerOpen);

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
        <h1 className="text-xl font-bold text-[var(--heading)]">Sign in to play</h1>
        <Link href="/sign-in" className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow">
          Sign in
        </Link>
        <BackLink />
      </Center>
    );
  }

  if (!gameId || authLoading || g.status === "loading") return <Center><LoadingSpinner /></Center>;

  if (g.status === "error") {
    return (
      <Center>
        <p className="text-sm text-[var(--danger)]">{g.error ?? "Couldn't load this game."}</p>
        <BackLink />
      </Center>
    );
  }

  if (g.status === "cancelled") {
    return (
      <Center>
        <h1 className="text-xl font-bold text-[var(--heading)]">Game cancelled</h1>
        <p className="text-sm text-[var(--muted)]">Someone declined the invite before it started.</p>
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
          {g.status === "dealing" ? "Dealing…" : "Waiting for players"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {g.status === "dealing"
            ? "The game is being set up — this page will update."
            : "The game starts once everyone you invited accepts."}
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
                  <span className="min-w-0 truncate text-[var(--heading)]">{seat?.name ?? "Someone"}</span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      accepted ? "text-[var(--accent)]" : "text-[var(--faint)]"
                    }`}
                  >
                    {accepted ? "Accepted" : "Waiting"}
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
              {respondBusy === "accept" ? "Accepting…" : "Accept"}
            </button>
            <button
              onClick={() => handleRespondPending(false)}
              disabled={respondBusy !== null}
              className="flex-1 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
            >
              {respondBusy === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
        )}

        <button
          onClick={g.refresh}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Refresh
        </button>

        {/* Only the host can withdraw a still-pending invite — an invitee
            declines instead, above (or from Home — same respondToMpGame). */}
        {g.status === "pending" && isHost && (
          <button
            onClick={handleCancelPending}
            disabled={cancelBusy}
            className="text-sm text-[var(--danger)] underline hover:opacity-80 disabled:opacity-50"
          >
            {cancelBusy ? "Cancelling…" : "Cancel this game"}
          </button>
        )}

        <BackLink />
      </Center>
    );
  }

  if (!view) return <Center><LoadingSpinner /></Center>;

  const me = view.players.find((p) => p.userId === user?.id) ?? null;
  const currentName = view.players.find((p) => p.seat === view.currentSeat)?.name ?? "someone";

  if (view.gameOver) {
    const iWon = view.winnerSeat != null && view.players[view.winnerSeat]?.userId === user?.id;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
        <UnlockToast items={g.newlyUnlockedCosmetics} onDismiss={g.clearNewlyUnlockedCosmetics} />
        <BackLink />
        <h1 className="text-2xl font-bold text-[var(--heading)]">
          {iWon ? "You won!" : `${view.winnerSeat != null ? view.players[view.winnerSeat].name : "Nobody"} won`}
        </h1>
        <ol className="flex flex-col gap-2">
          {scores.map((p, i) => (
            <li key={p.seat} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="text-sm font-medium text-[var(--heading)]">
                {i + 1}. {p.name}
                {p.resigned && <span className="ml-2 text-xs text-[var(--faint)]">(left)</span>}
              </span>
              <span className="text-sm font-semibold text-[var(--muted)]">{p.cumulativeScore}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-[var(--faint)]">
          Recorded to your stats and multiplayer record.
        </p>

        {g.unlockedAchievements.length > 0 && (
          <AchievementUnlockCard
            items={g.unlockedAchievements}
            heading={g.unlockedAchievements.length === 1 ? "Achievement unlocked" : "Achievements unlocked"}
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
            Round {tournamentLink.roundNumber} of a tournament — view standings →
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
          {rematchBusy ? "Setting up…" : "Rematch — same players"}
        </button>
        {g.error && <p className="text-xs text-[var(--danger)]">{g.error}</p>}
      </main>
    );
  }

  const isMyTurn = g.myTurn;
  const drawn = g.youHaveDrawn;
  const acting = isMyTurn && drawn;
  const alreadyMelded = !!me?.hasMeldedContract;
  const canLayOff = alreadyMelded || g.draft.groups.length > 0;

  const stagedBooks = g.draft.groups.filter((x) => x.type === "book").length;
  const stagedRuns = g.draft.groups.filter((x) => x.type === "run").length;
  const contractStaged =
    !alreadyMelded && g.draft.groups.length > 0 && stagedBooks === view.contract.books && stagedRuns === view.contract.runs;
  const goingOut = g.visibleHand.length === 0 && (alreadyMelded || contractStaged);
  // The only remaining caller of this is the "Go out" button — a normal
  // turn now ends through the discard-confirm dialog's own commitTurn call
  // (see the drawer below), which sends its discard straight to commitTurn
  // instead of staging it via g.setDiscard first.
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

  // Same purely-local sort/reorder as game/page.tsx's hand drawer — see
  // handOrder's own doc for why this never reaches the server.
  const orderedVisibleHand = applyHandOrder(g.visibleHand, handOrder);

  function sortHand(mode: SortMode) {
    setHandOrder([...g.visibleHand].sort(compareByMode(mode)).map((c) => c.id));
  }

  function onMeldClick(meld: Meld) {
    if (!layoffArmed || !selectedCard) return;
    const opts = layOffOptions(selectedCard, meld);
    if (opts.length === 0) return;
    g.stageLayoff(selectedCard.id, meld.id, opts.length === 1 ? opts[0] : "low");
    g.clearSelection();
    setLayoffArmed(false);
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

  return (
    <main data-no-text-scale className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <BackLink />
        <div className="flex items-center gap-2">
          <Link
            href={`/how-to-play?from=mp&g=${gameId ?? ""}`}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            How to play
          </Link>
          <SoundQuickToggle />
          <button
            onClick={() => {
              if (confirm("Leave this game? You forfeit it.")) g.resign();
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            Leave
          </button>
        </div>
      </div>

      <PageTip id="multiplayer-play" title="Playing async">
        You don&apos;t need to be online at the same time. Take your turn, then it&apos;s the next
        player&apos;s — check back from Home, or turn on notifications in Settings to know when
        it&apos;s yours again.
      </PageTip>

      <header className="panel-elevated flex items-center justify-between gap-3 rounded-xl bg-[var(--panel)] px-4 py-3">
        <div className="shrink-0 text-left">
          <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
            Round {view.round} of {view.totalRounds}
          </p>
          <p className="text-lg font-bold leading-tight text-[var(--heading)]">{view.roundLabel}</p>
        </div>
        <div className="min-w-0 px-1 text-center">
          <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Your hand</p>
          <p className="text-lg font-bold leading-tight text-[var(--heading)]">
            {handPenalty(view.yourHand)} pts
          </p>
        </div>
        <ul className="shrink-0 space-y-1 text-right text-xs text-[var(--muted)]">
          {scores.map((p) => (
            <li key={p.seat} className="flex items-center justify-end gap-1">
              {p.userId === user?.id && level && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--accent)]">
                  Lv{level.level}
                </span>
              )}
              {p.isAI && p.difficulty && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--muted)]">
                  Lv{AI_THEORETICAL_LEVEL[p.difficulty]}
                </span>
              )}
              <span className="truncate">
                {p.name}: <span className="font-semibold text-[var(--heading)]">{p.cumulativeScore}</span>
              </span>
            </li>
          ))}
        </ul>
      </header>

      <OpponentStrip
        players={stripPlayers(view)}
        currentPlayerIndex={view.currentSeat}
        discardHistory={view.discardHistory}
        pickupHistory={view.pickupHistory}
        aiStatus={null}
        aiThinking={false}
        bios={bioBySeatId}
      />

      {g.error && <p className="text-sm text-[var(--danger)]">{g.error}</p>}

      {roundSummaryFor != null &&
        (() => {
          const rr = view.roundResults.find((r) => r.round === roundSummaryFor);
          if (!rr) return null;
          const ranked = [...rr.scores].sort((a, b) => a.penalty - b.penalty);
          return (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--heading)]">
                  Round {rr.round} · {rr.label}
                </h2>
                <button
                  onClick={() => setRoundSummaryFor(null)}
                  className="rounded p-0.5 text-sm text-[var(--faint)] hover:text-[var(--muted)]"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {ranked.map((s) => (
                  <li key={s.seat} className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">
                      {view.players.find((p) => p.seat === s.seat)?.name ?? `Seat ${s.seat}`}
                    </span>
                    <span className="text-[var(--heading)]">
                      +{s.penalty} <span className="text-[var(--faint)]">({s.cumulative})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--faint)]">
                Round {rr.round + 1} is underway — take your turn below when it&apos;s yours.
              </p>
            </section>
          );
        })()}

      {!isMyTurn ? (
        <div className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-center text-sm text-[var(--muted)]">
          <p>
            Waiting for <strong className="text-[var(--heading)]">{currentName}</strong> to take their turn.
          </p>
          {view.currentUserId && view.currentUserId !== user?.id && (
            <button
              onClick={() => g.nudge()}
              disabled={g.nudgeState !== "idle"}
              className="mt-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel)] disabled:opacity-60"
            >
              {g.nudgeState === "sent"
                ? "Nudged 👍"
                : g.nudgeState === "error"
                  ? "Can't nudge yet"
                  : `Nudge ${currentName}`}
            </button>
          )}
          {g.daysSinceMove != null && g.daysSinceMove >= 14 && (
            <p className="mt-1 text-xs text-[var(--faint)]">
              No moves in {g.daysSinceMove} days. If this game&apos;s been abandoned, use “Resign” above
              to end it.
            </p>
          )}
        </div>
      ) : !drawn ? (
        <p className="rounded-lg bg-[var(--accent)]/10 px-4 py-3 text-center text-sm font-medium text-[var(--accent)]">
          Your turn — draw a card to start.
        </p>
      ) : null}

      <section className="flex items-start justify-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <button
            disabled={!isMyTurn || drawn || g.busy}
            onClick={() => g.draw("stock")}
            className="disabled:opacity-50"
            aria-label="Draw from the pile"
          >
            <DrawPile count={view.drawPileCount} />
          </button>
          <span className="text-xs text-[var(--faint)]">Draw ({view.drawPileCount})</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            disabled={!isMyTurn || drawn || g.busy || !view.discardTop}
            onClick={() => g.draw("discard")}
            className="disabled:opacity-50"
            aria-label="Take the top of the discard pile"
          >
            <DiscardPile cards={view.discardPile} canLayOff={discardTopCanLayOff} />
          </button>
          <span className="text-xs text-[var(--faint)]">Discard pile</span>
        </div>
      </section>

      <section ref={tableMeldsElRef} className="rounded-xl bg-[var(--panel-soft)] p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Table melds</h2>
        {view.melds.length === 0 ? (
          <p className="text-sm text-[var(--faint)]">Nothing melded yet this round.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {meldsByOwner.map(([ownerId, melds]) => (
              <div key={ownerId}>
                <p className="mb-1 text-[10px] text-[var(--faint)]">
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
      <HandPreviewBar cards={orderedVisibleHand} onTap={() => setHandDrawerOpen(true)} />
      {handDrawerOpen && (
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
            aria-label="Manage your hand"
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-[46] mx-auto flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg)] p-4 shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--heading)]">Manage your hand</h2>
              <button
                onClick={() => setHandDrawerOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
              >
                Done
              </button>
            </div>

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
                itself. The one structural difference this mode can't drop —
                see this file's own top-of-file comment — is that nothing
                here is real until commitTurn: "Group selected cards" only
                stages a group (solo's matching button does too, but solo
                also has a separate "Confirm Meld" that immediately commits
                it — there's no atomic-turn model to wait for), and
                "Discard selected card" 's confirm step below sends the
                whole staged turn (groups + lay-offs + the chosen discard)
                in the one commit that ends it, rather than solo's discard
                alone (solo's meld/lay-offs are already real by that point). */}
            {isMyTurn && !alreadyMelded && (
              <section
                data-tutorial="build-meld"
                className="panel-elevated flex flex-col items-center gap-3 rounded-xl bg-[var(--panel-soft)] p-4 text-center"
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                  Build your meld — this round needs {contractNeedLabel(view.contract.books, view.contract.runs)}
                </h2>

                {!drawn && (
                  <p className="text-xs text-[var(--accent)]">Draw a card first to start your turn.</p>
                )}

                {g.draft.groups.length > 0 && (
                  <div className="flex w-full flex-col gap-2 text-left">
                    {g.draft.groups.map((grp) => (
                      <div
                        key={grp.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--panel)] p-2"
                      >
                        <span className="w-12 shrink-0 text-xs font-semibold capitalize text-[var(--accent)]">
                          {grp.type}
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
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {g.groupError && <p className="text-xs text-[var(--danger)]">{g.groupError}</p>}

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => g.stageGroup()}
                    disabled={!drawn || g.selectedIds.length === 0}
                    className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Group selected cards
                  </button>
                </div>
              </section>
            )}

            {isMyTurn && (
              <section data-tutorial="discard-btn" className="flex flex-col items-center gap-3">
                {!alreadyMelded && g.draft.groups.length > 0 && (
                  <p className="text-xs text-[var(--faint)]">
                    <span className={contractStaged ? "text-[var(--accent)]" : undefined}>
                      Contract: {stagedBooks}/{view.contract.books} books · {stagedRuns}/{view.contract.runs} runs
                      {contractStaged ? " ✓" : ""}
                    </span>
                  </p>
                )}
                {g.draft.layoffs.length > 0 && (
                  <ul className="flex flex-wrap justify-center gap-2">
                    {g.draft.layoffs.map((lo) => {
                      const c = view.yourHand.find((x) => x.id === lo.cardId);
                      return (
                        <li key={lo.cardId}>
                          <button
                            onClick={() => g.unstageLayoff(lo.cardId)}
                            className="rounded-md border border-[var(--accent)]/50 px-2 py-1 text-xs text-[var(--accent)]"
                          >
                            {c ? label(c) : "card"} ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {confirmingDiscard ? (
                  <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg bg-[var(--panel-soft)] px-4 py-2">
                    <span className="text-sm text-[var(--muted)]">
                      Discard the {label(view.yourHand.find((c) => c.id === confirmingDiscard)!)} and end your
                      turn?
                    </span>
                    <button
                      onClick={async () => {
                        const cardId = confirmingDiscard;
                        if (!cardId) return;
                        await g.commitTurn({ discardCardId: cardId });
                        setConfirmingDiscard(null);
                        g.clearSelection();
                      }}
                      disabled={g.busy}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-40"
                    >
                      {g.busy ? "…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmingDiscard(null)}
                      className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel)]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {canLayOff && (
                      <button
                        onClick={armLayoffFromDrawer}
                        disabled={!drawn || !oneSelected || layoffTargets.length === 0}
                        className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Lay off card
                      </button>
                    )}
                    {!goingOut && (
                      <button
                        onClick={() => oneSelected && setConfirmingDiscard(g.selectedIds[0])}
                        disabled={!drawn || !oneSelected}
                        className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Discard selected card
                      </button>
                    )}
                    {goingOut && (
                      <button
                        onClick={() => g.commitTurn()}
                        disabled={!canEndTurn}
                        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {g.busy ? "…" : "Go out"}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            <section data-tutorial="hand">
              <div className="mb-2 flex flex-col items-center gap-2 text-center">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                  Your hand
                  <span className="ml-2 font-normal normal-case text-[var(--muted)]">
                    ({handPenalty(orderedVisibleHand)} pts)
                  </span>
                  {alreadyMelded && <span className="ml-2 text-[var(--accent)]">— contract melded</span>}
                </h2>
                <HandSortButtons onSort={sortHand} />
              </div>
              {orderedVisibleHand.length === 0 ? (
                <p className="text-sm text-[var(--faint)]">Your hand is empty — end your turn to go out.</p>
              ) : (
                <DraggableHand
                  key={`${view.round}-${view.yourSeat}`}
                  cards={orderedVisibleHand}
                  selectedCardIds={g.selectedIds}
                  lastDrawnCardId={null}
                  onCardClick={acting ? (card) => g.toggleCard(card.id) : () => {}}
                  onReorder={setHandOrder}
                  layoffEligibleIds={
                    canLayOff
                      ? new Set(orderedVisibleHand.filter((c) => view.melds.some((m) => layOffOptions(c, m).length > 0)).map((c) => c.id))
                      : undefined
                  }
                />
              )}
              <p className="mt-1 text-center text-xs text-[var(--faint)]">Drag a card to reorder your hand.</p>
            </section>
          </div>
        </>
      )}
      <div aria-hidden="true" className="h-20 md:h-28" />
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

