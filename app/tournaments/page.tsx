"use client";

// Tournaments — a round-robin series among the same players (see
// tournamentsStore.ts's own doc for why this isn't a true elimination
// bracket). One page handles both the list (no `?id=`) and a single
// tournament's detail (`?id=<tournamentId>`), same query-param-routing
// pattern as /player and /clubs.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { getClub } from "../lib/clubsStore";
import { nameOf, playerProfileHref } from "../lib/leaderboardStore";
import { rematchMpGame, MpError } from "../lib/mpStore";
import { supabase } from "../lib/supabaseClient";
import {
  addTournamentRound,
  cancelTournament,
  getMyTournaments,
  getTournament,
  getTournamentRounds,
  getTournamentStandings,
  TournamentRound,
  TournamentStanding,
  TournamentSummary,
} from "../lib/tournamentsStore";
import { Difficulty } from "@/types";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

function useTournamentId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  return id;
}

const STATUS_LABEL: Record<TournamentRound["status"], string> = {
  pending: "Waiting for invites",
  active: "In progress",
  complete: "Finished",
  cancelled: "Cancelled",
};

export default function TournamentsPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const tournamentId = useTournamentId();

  if (!authLoading && !configured) {
    return (
      <CenteredMessage title="Tournaments aren't set up yet" body="This app doesn't have a Supabase project connected yet." />
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <CenteredMessage
        title="Sign in for tournaments"
        body="A tournament series is tied to your account, like any multiplayer game."
        signIn
      />
    );
  }

  if (authLoading || tournamentId === undefined) {
    return (
      <Shell>
        <LoadingSpinner />
      </Shell>
    );
  }

  return tournamentId ? <TournamentDetail tournamentId={tournamentId} /> : <TournamentList />;
}

function TournamentList() {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    getMyTournaments(supabase)
      .then(setTournaments)
      .catch((err) => {
        console.error("Failed to load tournaments:", err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/" />

      <h1 className="text-2xl font-bold text-[var(--heading)]">Tournaments</h1>

      <PageTip id="tournaments" title="A round-robin series">
        The same roster plays a fixed number of games back-to-back — no elimination, nobody sits
        out. Lowest total score across the whole series wins.
      </PageTip>

      <Link
        href="/tournaments/new"
        className="rounded-lg bg-[var(--accent)] px-6 py-3.5 text-center text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
      >
        Start a tournament
      </Link>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">Couldn&apos;t load your tournaments — check your connection and try again.</p>
      ) : tournaments.length === 0 ? (
        <EmptyState icon="🏆">No tournaments yet — start one above with a few friends.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {tournaments.map((t) => (
            <li key={t.tournamentId}>
              <Link
                href={`/tournaments?id=${t.tournamentId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 transition hover:bg-[var(--panel-soft)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--heading)]">{t.name}</span>
                  <span className="block text-xs text-[var(--faint)]">
                    {t.cancelled ? "Cancelled" : `Round ${Math.min(t.roundsPlayed + 1, t.totalRounds)} of ${t.totalRounds}`}
                  </span>
                </span>
                {!t.cancelled && t.roundsPlayed >= t.totalRounds && (
                  <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                    Complete
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// mp_games.seats is stored exactly as src/mp/types.ts's MpSeat shapes it
// (handleCreate in the mp Edge Function writes it verbatim) — userId
// (camelCase), not user_id. This previously read the wrong key, which
// silently dropped every human seat when starting a tournament's next
// round (see handleStartNextRound below): rematchMpGame filters out the
// host by matching userId === myUserId, and separately drops any "human"
// entry whose userId is falsy — with the wrong key, every human seat's
// userId read as undefined, so the host-filter never matched anyone *and*
// the human seats it should have kept all got dropped anyway, leaving no
// invited players at all and the mp function's own "invite at least one
// friend" rejection.
interface MpGameSeatRow {
  seats: (
    | { seat: number; kind: "human"; userId: string; name: string }
    | { seat: number; kind: "ai"; difficulty: string; name: string }
  )[];
  contract_rounds: number[];
}

function TournamentDetail({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [tournament, setTournament] = useState<
    { id: string; name: string; hostId: string; clubId: string | null; totalRounds: number; cancelled: boolean } | null | undefined
  >(undefined);
  const [clubName, setClubName] = useState<string | null>(null);
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const t = await getTournament(supabase, tournamentId);
      setTournament(t);
      if (!t) return;
      const [r, s] = await Promise.all([
        getTournamentRounds(supabase, tournamentId),
        getTournamentStandings(supabase, tournamentId),
      ]);
      setRounds(r);
      setStandings(s);
      if (t.clubId) {
        getClub(supabase, t.clubId)
          .then((c) => setClubName(c?.name ?? null))
          .catch(() => setClubName(null));
      }
      setLoadError(false);
    } catch (err) {
      console.error("Failed to load tournament:", err);
      setLoadError(true);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <CenteredMessage
        title="Tournament not found"
        body="Couldn't load it — check your connection and try again."
        backHref="/tournaments"
        backLabel="← Tournaments"
      />
    );
  }

  if (tournament === undefined) {
    return (
      <Shell>
        <LoadingSpinner />
      </Shell>
    );
  }

  if (tournament === null) {
    return (
      <CenteredMessage
        title="Tournament not found"
        body="It may have been deleted, or you're not a participant."
        backHref="/tournaments"
        backLabel="← Tournaments"
      />
    );
  }

  const isHost = tournament.hostId === user?.id;
  const lastRound = rounds[rounds.length - 1] ?? null;
  const seriesComplete = rounds.length >= tournament.totalRounds && lastRound?.status === "complete";
  const canStartNextRound = isHost && !tournament.cancelled && !seriesComplete && (lastRound === null || lastRound.status === "complete");

  async function handleStartNextRound() {
    if (!supabase || !lastRound || !user) return;
    setBusy(true);
    setActionError(null);
    try {
      // The last round's own seats are the authoritative roster — same
      // shape rematchMpGame's `players` param needs, just reshaped from
      // mp_games' own {kind:'human'|'ai'} into {isAI}.
      const { data, error } = await supabase
        .from("mp_games")
        .select("seats, contract_rounds")
        .eq("id", lastRound.gameId)
        .maybeSingle<MpGameSeatRow>();
      if (error) throw error;
      if (!data) throw new Error("Couldn't read the last round's line-up.");
      const players = data.seats.map((s) => ({
        seat: s.seat,
        isAI: s.kind === "ai",
        difficulty: s.kind === "ai" ? (s.difficulty as Difficulty) : undefined,
        name: s.name,
        userId: s.kind === "human" ? s.userId : undefined,
      }));
      const { game_id } = await rematchMpGame(supabase, players, user.id, data.contract_rounds);
      await addTournamentRound(supabase, tournamentId, game_id);
      router.push(`/multiplayer/play?g=${game_id}`);
    } catch (err) {
      console.error("Failed to start the next round:", err);
      setActionError(err instanceof MpError ? err.message : "Couldn't start the next round — try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/tournaments" label="Tournaments" />

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{tournament.name}</h1>
        <p className="mt-1 text-xs text-[var(--faint)]">
          {tournament.cancelled ? "Cancelled" : seriesComplete ? "Complete" : `Round ${rounds.length} of ${tournament.totalRounds}`}
          {clubName && ` · from ${clubName}`}
        </p>
      </div>

      {actionError && <p className="text-xs text-[var(--danger)]">{actionError}</p>}

      {seriesComplete && (
        <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-center">
          <p className="text-3xl" aria-hidden="true">
            🏆
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--heading)]">
            {standings[0] ? (standings[0].userId === user?.id ? "You won the series!" : `${nameOf(standings[0].userId, standings[0].displayName)} won the series!`) : "Series complete"}
          </p>
        </section>
      )}

      {canStartNextRound && (
        <button
          onClick={handleStartNextRound}
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? "Setting up…" : `Start round ${rounds.length + 1} of ${tournament.totalRounds}`}
        </button>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Standings</h2>
        <ol className="flex flex-col gap-2">
          {standings.map((s, i) => (
            <li key={s.userId} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
              <Link href={playerProfileHref(s.userId)} className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--faint)]">{i + 1}.</span>
                <span className="truncate font-medium text-[var(--heading)]">
                  {s.userId === user?.id ? "You" : nameOf(s.userId, s.displayName)}
                </span>
              </Link>
              <span className="shrink-0 text-right text-xs text-[var(--muted)]">
                {s.totalScore} pts <span className="text-[var(--faint)]">· {s.gamesWon}W</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Rounds</h2>
        <ul className="flex flex-col gap-2">
          {rounds.map((r) => (
            <li key={r.roundNumber}>
              <Link
                href={`/multiplayer/play?g=${r.gameId}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel-soft)] px-4 py-2.5 text-sm transition hover:bg-[var(--panel)]"
              >
                <span className="text-[var(--text)]">Round {r.roundNumber}</span>
                <span className="text-xs text-[var(--faint)]">{STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {isHost && !tournament.cancelled && (
        <button
          onClick={async () => {
            if (!confirm("Cancel this tournament? Games already played keep their results.")) return;
            if (!supabase) return;
            setBusy(true);
            try {
              await cancelTournament(supabase, tournamentId);
              await load();
            } catch (err) {
              console.error("Failed to cancel tournament:", err);
              setActionError("Couldn't cancel it — try again.");
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="self-start text-xs text-[var(--danger)] underline hover:opacity-80 disabled:opacity-50"
        >
          Cancel tournament
        </button>
      )}
    </main>
  );
}
