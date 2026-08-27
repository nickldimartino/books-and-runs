"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { RoundHistoryEntry } from "../lib/recordGameResult";
import { supabase } from "../lib/supabaseClient";

interface PlayerStats {
  games_played: number;
  games_won: number;
  games_tied: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

interface GameHistoryRow {
  id: string;
  opponents: { name: string; difficulty: string | null }[];
  winner: string;
  // Only present on games recorded after this column was added — null for
  // anything older, which the list below shows plainly rather than a 0.
  winner_score: number | null;
  // Round-by-round cumulative totals for every player, keyed by name —
  // recordGameResult.ts has always stored this (it's the same roundHistory
  // GameContext already tracks for RoundSummary), but the Stats page never
  // read it back until now. See yourScoreFor below for why it's the only
  // way to recover *your* score for a game you didn't win — winner_score is
  // only ever the winner's score.
  rounds: RoundHistoryEntry[] | null;
  played_at: string;
}

/**
 * Your final score for this game, or null if it can't be determined (a row
 * from before the `rounds` column existed, or the degenerate case where
 * your seat's name happens to collide with an opponent's — see below).
 * winner_score alone can't answer this for a loss: it's only ever the
 * *winner's* score, so a page whose purpose is tracking your own play over
 * time was otherwise mute on every game you didn't win.
 *
 * Derived rather than stored as its own column: the last entry in `rounds`
 * already has every player's final cumulative total, keyed by name — "your"
 * name is just whichever key isn't one of the recorded opponents' names.
 * (Two players sharing an identical name — you and a pass-and-play
 * opponent — would make that ambiguous; rare enough, and low-stakes enough
 * when it happens, not to be worth a schema change to rule out.)
 */
function yourScoreFor(g: GameHistoryRow): number | null {
  if (!g.rounds || g.rounds.length === 0) return null;
  const lastRound = g.rounds[g.rounds.length - 1];
  const opponentNames = new Set(g.opponents.map((o) => o.name));
  const candidates = Object.keys(lastRound.totals).filter((name) => !opponentNames.has(name));
  return candidates.length === 1 ? lastRound.totals[candidates[0]] : null;
}

const DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"];

const PAST_GAMES_LIMIT = 10;

export default function StatsPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinct from "stats is null because you haven't played yet" — a query
  // error (e.g. a migration that added a selected column hasn't been run
  // against this Supabase project) also leaves stats null, and silently
  // showing "no games recorded" for that case is actively misleading.
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatsError(false);
    Promise.all([
      supabase
        .from("player_stats")
        .select("games_played, games_won, games_tied, best_score, worst_score, average_score, wins_by_difficulty")
        .eq("user_id", user.id)
        .maybeSingle<PlayerStats>(),
      supabase
        .from("game_history")
        .select("id, opponents, winner, winner_score, rounds, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(PAST_GAMES_LIMIT),
    ]).then(([statsRes, historyRes]) => {
      if (statsRes.error) {
        setStatsError(true);
      } else {
        setStats(statsRes.data);
      }
      setHistory((historyRes.data as GameHistoryRow[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  if (!authLoading && !configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Stats aren&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">
          This app doesn&apos;t have a Supabase project connected yet.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Back to Home
        </Link>
      </main>
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in to see your stats</h1>
        <Link
          href="/sign-in"
          className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const winRate =
    stats && stats.games_played > 0 ? Math.round((100 * stats.games_won) / stats.games_played) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <h1 className="text-2xl font-bold text-[var(--heading)]">Your stats</h1>

      {level && (
        <section className="rounded-lg bg-[var(--panel)] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--heading)]">Level {level.level}</span>
            <span className="text-xs text-[var(--faint)]">
              {level.xpIntoLevel} / {level.xpSpanForLevel} XP to level {level.level + 1}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${Math.round(level.progressFraction * 100)}%` }}
            />
          </div>
        </section>
      )}

      {authLoading || loading ? (
        <p className="text-sm text-[var(--faint)]">Loading…</p>
      ) : statsError ? (
        <p className="text-sm text-[var(--danger)]">
          Couldn&apos;t load your stats — check your connection, or that this Supabase project has
          every migration in <code>supabase/migrations/</code> applied.
        </p>
      ) : !stats ? (
        <p className="text-sm text-[var(--faint)]">No games recorded yet — play one to see stats here.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <StatTile label="Games played" value={stats.games_played} />
            <StatTile label="Games won" value={stats.games_won} />
            <StatTile label="Best score" value={stats.best_score ?? "—"} sub="lower is better" />
            <StatTile label="Worst score" value={stats.worst_score ?? "—"} sub="higher is worse" />
            <StatTile
              label="Average score"
              value={stats.average_score != null ? Math.round(stats.average_score) : "—"}
            />
            <StatTile label="Win rate" value={winRate !== null ? `${winRate}%` : "—"} />
            <StatTile label="Games tied" value={stats.games_tied} sub="a rare result" />
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              Wins by AI difficulty faced
            </h2>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <div
                  key={d}
                  className="rounded-lg bg-[var(--panel)] px-3 py-2 text-center text-sm capitalize"
                >
                  <div className="font-semibold text-[var(--heading)]">{stats.wins_by_difficulty[d] ?? 0}</div>
                  <div className="text-xs text-[var(--faint)]">{d}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              Past games (last {PAST_GAMES_LIMIT})
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--faint)]">No games recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((g) => {
                  const yourScore = yourScoreFor(g);
                  // If your score matches the winner's, you won it outright
                  // or were part of a tie for it — either way winner_score
                  // already *is* your score, so a separate "Your score" line
                  // would just repeat the same number back.
                  const wonOrTied = yourScore !== null && g.winner_score != null && yourScore === g.winner_score;
                  return (
                    <li key={g.id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-medium ${wonOrTied ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}
                        >
                          Winner: {g.winner}
                          {g.winner_score != null && (
                            <span className={`font-normal ${wonOrTied ? "" : "text-[var(--faint)]"}`}>
                              {" "}
                              ({g.winner_score} pts)
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-[var(--faint)]">
                          {new Date(g.played_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      {yourScore !== null && !wonOrTied && (
                        <p className="mt-0.5 text-xs text-[var(--muted)]">Your score: {yourScore} pts</p>
                      )}
                      <p className="mt-1 text-xs text-[var(--faint)]">
                        vs. {g.opponents.map((o) => o.name).join(", ")}
                      </p>
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

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-[var(--panel)] px-4 py-3">
      <div className="text-xl font-bold text-[var(--heading)]">{value}</div>
      <div className="text-xs text-[var(--faint)]">{label}</div>
      {sub && <div className="text-[10px] text-[var(--faint)]">{sub}</div>}
    </div>
  );
}
