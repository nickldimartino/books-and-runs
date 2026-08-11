"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { supabase } from "../lib/supabaseClient";

interface PlayerStats {
  games_played: number;
  games_won: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

interface GameHistoryRow {
  id: string;
  opponents: { name: string; difficulty: string | null }[];
  winner: string;
  played_at: string;
}

const DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"];

const PAST_GAMES_LIMIT = 10;

export default function StatsPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from("player_stats")
        .select("games_played, games_won, best_score, worst_score, average_score, wins_by_difficulty")
        .eq("user_id", user.id)
        .maybeSingle<PlayerStats>(),
      supabase
        .from("game_history")
        .select("id, opponents, winner, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(PAST_GAMES_LIMIT),
    ]).then(([statsRes, historyRes]) => {
      setStats(statsRes.data);
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
      ) : !stats ? (
        <p className="text-sm text-[var(--faint)]">No games recorded yet — play one to see stats here.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <StatTile label="Games played" value={stats.games_played} />
            <StatTile label="Games won" value={stats.games_won} />
            <StatTile label="Win rate" value={winRate !== null ? `${winRate}%` : "—"} />
            <StatTile label="Best score" value={stats.best_score ?? "—"} sub="lower is better" />
            <StatTile label="Worst score" value={stats.worst_score ?? "—"} sub="higher is worse" />
            <StatTile
              label="Average score"
              value={stats.average_score != null ? Math.round(stats.average_score) : "—"}
            />
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
                {history.map((g) => (
                  <li key={g.id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--heading)]">Winner: {g.winner}</span>
                      <span className="text-xs text-[var(--faint)]">
                        {new Date(g.played_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--faint)]">
                      vs. {g.opponents.map((o) => o.name).join(", ")}
                    </p>
                  </li>
                ))}
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
