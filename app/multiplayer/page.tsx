"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { LoadingSpinner } from "../components/LoadingSpinner";
import {
  getMyMpGames,
  MP_GAME_CAP,
  MpError,
  MpGameSummary,
  MpSeatMeta,
  respondToMpGame,
} from "../lib/mpStore";
import { supabase } from "../lib/supabaseClient";

function opponentLabel(seats: MpSeatMeta[], yourSeat: number): string {
  const others = seats.filter((s) => s.seat !== yourSeat);
  if (others.length === 0) return "—";
  return others.map((s) => s.name).join(", ");
}

function statusFor(g: MpGameSummary, myUserId: string): { text: string; mine: boolean } {
  if (g.invite_status === "invited") return { text: "Invited you to play", mine: true };
  if (g.status === "pending") return { text: "Waiting for players to accept", mine: false };
  if (g.turn_user_id === myUserId) return { text: "Your turn", mine: true };
  const turnSeat = g.seats.find((s) => s.seat === g.turn_seat);
  return { text: turnSeat ? `Waiting for ${turnSeat.name}` : "Waiting…", mine: false };
}

export default function MultiplayerPage() {
  const router = useRouter();
  const { configured, loading: authLoading, user } = useAuth();
  const [games, setGames] = useState<MpGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setGames(await getMyMpGames(supabase));
      setLoadError(false);
    } catch (err) {
      console.error("Failed to load multiplayer games:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    load();
    const channel = supabase
      .channel(`mp-hub-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mp_games" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "mp_participants" }, () => load())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mp_events", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [user, load]);

  async function respond(gameId: string, accept: boolean) {
    if (!supabase) return;
    setBusyId(gameId);
    setActionError(null);
    try {
      await respondToMpGame(supabase, gameId, accept);
      await load();
    } catch (err) {
      setActionError(err instanceof MpError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  if (!authLoading && !configured) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Multiplayer isn&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">This app doesn&apos;t have a Supabase project connected yet.</p>
        <Link href="/" className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          Back to Home
        </Link>
      </Shell>
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in to play with friends</h1>
        <p className="text-sm text-[var(--muted)]">Multiplayer games are tied to your account.</p>
        <Link href="/sign-in" className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]">
          Sign in
        </Link>
      </Shell>
    );
  }

  const activeCount = games.filter((g) => g.invite_status === "accepted" || g.invite_status === "invited").length;
  const atCap = activeCount >= MP_GAME_CAP;
  const invites = games.filter((g) => g.invite_status === "invited");
  const yours = games.filter((g) => g.invite_status === "accepted");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Multiplayer</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Turn-based games with friends — take your turn, then it&apos;s theirs. Up to {MP_GAME_CAP} going at once.
        </p>
      </div>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">
          Couldn&apos;t load your games — check your connection, or that every migration in{" "}
          <code>supabase/migrations/</code> is applied and the <code>mp</code> function is deployed.
        </p>
      ) : (
        <>
          {actionError && <p className="text-sm text-[var(--danger)]">{actionError}</p>}

          <Link
            href="/multiplayer/new"
            aria-disabled={atCap}
            onClick={(e) => atCap && e.preventDefault()}
            className={`rounded-lg px-6 py-3.5 text-center text-base font-semibold shadow-lg transition ${
              atCap
                ? "cursor-not-allowed bg-[var(--panel)] text-[var(--faint)]"
                : "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)]"
            }`}
          >
            Start a multiplayer game
          </Link>
          {atCap && (
            <p className="-mt-3 text-center text-xs text-[var(--faint)]">
              You&apos;re at the {MP_GAME_CAP}-game limit — finish or leave one first.
            </p>
          )}

          {invites.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Game requests ({invites.length})
              </h2>
              <ul className="flex flex-col gap-2">
                {invites.map((g) => (
                  <li key={g.game_id} className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
                    <p className="text-sm font-medium text-[var(--heading)]">
                      {opponentLabel(g.seats, g.your_seat)}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {g.total_rounds === 7 ? "Full game" : `${g.total_rounds}-round game`}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => respond(g.game_id, true)}
                        disabled={busyId === g.game_id}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respond(g.game_id, false)}
                        disabled={busyId === g.game_id}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              Your games
            </h2>
            {yours.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border)] px-4 py-5">
                <span className="text-2xl" aria-hidden="true">🃏</span>
                <p className="text-sm text-[var(--faint)]">
                  No games going. Start one above — you&apos;ll need a friend first (add them from the{" "}
                  <Link href="/friends" className="underline">Friends</Link> page).
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {yours.map((g) => {
                  const st = statusFor(g, user!.id);
                  const canOpen = g.status === "active";
                  return (
                    <li key={g.game_id}>
                      <button
                        onClick={() => canOpen && router.push(`/multiplayer/play?g=${g.game_id}`)}
                        disabled={!canOpen}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition enabled:hover:bg-[var(--panel-soft)] disabled:cursor-default"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-[var(--heading)]">
                            {opponentLabel(g.seats, g.your_seat)}
                          </span>
                          <span className="block text-xs text-[var(--faint)]">
                            Round {g.round} of {g.total_rounds}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            st.mine
                              ? "bg-[var(--accent)] text-[var(--on-accent)]"
                              : "bg-[var(--panel-soft)] text-[var(--muted)]"
                          }`}
                        >
                          {st.text}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}
