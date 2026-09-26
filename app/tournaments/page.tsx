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
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { getClub } from "../lib/clubsStore";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { nameOf, playerProfileHref } from "../lib/leaderboardStore";
import { rematchMpGame, MpError } from "../lib/mpStore";
import { supabase } from "../lib/supabaseClient";
import { SafetyMenu } from "../components/SafetyMenu";
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
import { translateError } from "../lib/i18n/serverErrors";

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

// Which key to translate a round's status with, resolved via
// t(STATUS_LABEL_KEYS[status]) inside the component — the actual English
// strings live only in the dictionary, not duplicated here.
const STATUS_LABEL_KEYS: Record<TournamentRound["status"], TranslationKey> = {
  pending: "tournaments.status.pending",
  active: "tournaments.status.active",
  complete: "tournaments.status.complete",
  cancelled: "tournaments.status.cancelled",
};

export default function TournamentsPage() {
  const { t } = useT();
  const { configured, loading: authLoading, user } = useAuth();
  const tournamentId = useTournamentId();

  if (!authLoading && !configured) {
    return <CenteredMessage title={t("tournaments.notSetUp.title")} body={t("tournaments.notSetUp.body")} />;
  }

  if (!authLoading && configured && !user) {
    return (
      <CenteredMessage
        title={t("tournaments.signInTitle")}
        body={t("tournaments.signInBody")}
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
  const { t } = useT();
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
      <BackLink href="/social" smart />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("tournaments.title")}</h1>

      <PageTip id="tournaments" title={t("tournaments.tip.title")}>
        {t("tournaments.tip.body")}
      </PageTip>

      <Link
        href="/tournaments/new"
        className="rounded-lg bg-[var(--accent)] px-6 py-3.5 text-center text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
      >
        {t("tournaments.startATournament")}
      </Link>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">{t("tournaments.loadError")}</p>
      ) : tournaments.length === 0 ? (
        <EmptyState icon="🏆">{t("tournaments.emptyState")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {tournaments.map((tr) => (
            <li key={tr.tournamentId}>
              <Link
                href={`/tournaments?id=${tr.tournamentId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 transition hover:bg-[var(--panel-soft)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--heading)]">{tr.name}</span>
                  <span className="block text-xs text-[var(--faint)]">
                    {tr.cancelled
                      ? t("tournaments.status.cancelled")
                      : t("game.roundOf", {
                          round: Math.min(tr.roundsPlayed + 1, tr.totalRounds),
                          total: tr.totalRounds,
                        })}
                  </span>
                </span>
                {!tr.cancelled && tr.roundsPlayed >= tr.totalRounds && (
                  <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                    {t("tournaments.complete")}
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
  const { t } = useT();
  const { user } = useAuth();
  const [tournament, setTournament] = useState<
    { id: string; name: string; hostId: string; clubId: string | null; totalRounds: number; cancelled: boolean } | null | undefined
  >(undefined);
  const [clubName, setClubName] = useState<string | null>(null);
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
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
        title={t("tournaments.notFound.title")}
        body={t("tournaments.notFound.loadErrorBody")}
        backHref="/tournaments"
        backLabel={t("tournaments.backToTournaments")}
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
        title={t("tournaments.notFound.title")}
        body={t("tournaments.notFound.body")}
        backHref="/tournaments"
        backLabel={t("tournaments.backToTournaments")}
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
      setActionError(err instanceof MpError ? translateError(err.message, t) : t("tournaments.startNextRoundError"));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/tournaments" label={t("tournaments.title")} />

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{tournament.name}</h1>
        <p className="mt-1 text-xs text-[var(--faint)]">
          {tournament.cancelled
            ? t("tournaments.status.cancelled")
            : seriesComplete
              ? t("tournaments.complete")
              : t("game.roundOf", { round: rounds.length, total: tournament.totalRounds })}
          {clubName && t("tournaments.fromClub", { club: clubName })}
        </p>
      </div>

      {actionError && <p className="text-xs text-[var(--danger)]">{actionError}</p>}

      {seriesComplete && (
        <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-center">
          <p className="text-3xl" aria-hidden="true">
            🏆
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--heading)]">
            {standings[0]
              ? t("tournaments.wonTheSeries", {
                  name: standings[0].userId === user?.id ? t("newGame.you") : nameOf(standings[0].userId, standings[0].displayName),
                })
              : t("tournaments.seriesComplete")}
          </p>
        </section>
      )}

      {canStartNextRound && (
        <button
          onClick={handleStartNextRound}
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? t("multiplayer.settingUp") : t("tournaments.startRoundOf", { round: rounds.length + 1, total: tournament.totalRounds })}
        </button>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("tournaments.standings")}</h2>
        <ol className="flex flex-col gap-2">
          {standings.map((s, i) => (
            <li key={s.userId} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
              <Link href={playerProfileHref(s.userId)} className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--faint)]">{i + 1}.</span>
                <span className="truncate font-medium text-[var(--heading)]">
                  {s.userId === user?.id ? t("newGame.you") : nameOf(s.userId, s.displayName)}
                </span>
              </Link>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-right text-xs text-[var(--muted)]">
                  {t("game.hand.pts", { count: s.totalScore })} <span className="text-[var(--faint)]">· {t("tournaments.gamesWon", { count: s.gamesWon })}</span>
                </span>
                {s.userId !== user?.id && (
                  <SafetyMenu
                    targetUserId={s.userId}
                    targetName={nameOf(s.userId, s.displayName)}
                    context="tournament"
                    onBlocked={() => load()}
                  />
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("tournaments.rounds")}</h2>
        <ul className="flex flex-col gap-2">
          {rounds.map((r) => (
            <li key={r.roundNumber}>
              <Link
                href={`/multiplayer/play?g=${r.gameId}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel-soft)] px-4 py-2.5 text-sm transition hover:bg-[var(--panel)]"
              >
                <span className="text-[var(--text)]">{t("tournaments.roundN", { round: r.roundNumber })}</span>
                <span className="text-xs text-[var(--faint)]">{t(STATUS_LABEL_KEYS[r.status])}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {isHost && !tournament.cancelled && (
        <button
          onClick={() => setConfirmingCancel(true)}
          disabled={busy}
          className="self-start text-xs text-[var(--danger)] underline hover:opacity-80 disabled:opacity-50"
        >
          {t("tournaments.cancelTournament")}
        </button>
      )}
      <ConfirmDialog
        open={confirmingCancel}
        title={t("tournaments.confirmCancel.title")}
        body={t("tournaments.confirmCancel.body")}
        confirmLabel={t("tournaments.confirmCancel.confirm")}
        cancelLabel={t("tournaments.confirmCancel.keep")}
        danger
        onConfirm={async () => {
          setConfirmingCancel(false);
          if (!supabase) return;
          setBusy(true);
          try {
            await cancelTournament(supabase, tournamentId);
            await load();
          } catch (err) {
            console.error("Failed to cancel tournament:", err);
            setActionError(t("tournaments.cancelError"));
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setConfirmingCancel(false)}
      />
    </main>
  );
}
