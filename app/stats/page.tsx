"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { supabase } from "../lib/supabaseClient";

interface PlayerStats {
  games_played: number;
  games_won: number;
  best_score: number | null;
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

export default function StatsPage() {
  const { configured, loading: authLoading, user } = useAuth();
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
        .select("games_played, games_won, best_score, average_score, wins_by_difficulty")
        .eq("user_id", user.id)
        .maybeSingle<PlayerStats>(),
      supabase
        .from("game_history")
        .select("id, opponents, winner, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(20),
    ]).then(([statsRes, historyRes]) => {
      setStats(statsRes.data);
      setHistory((historyRes.data as GameHistoryRow[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  if (!authLoading && !configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-amber-100">Stats aren&apos;t set up yet</h1>
        <p className="text-sm text-emerald-100/70">
          This app doesn&apos;t have a Supabase project connected yet.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-lg border border-emerald-100/20 px-6 py-3 text-sm font-medium text-emerald-100/80 hover:bg-emerald-900/40"
        >
          Back to Home
        </Link>
      </main>
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-amber-100">Sign in to see your stats</h1>
        <Link
          href="/sign-in"
          className="mt-2 rounded-lg bg-amber-400 px-6 py-3 text-sm font-semibold text-emerald-950 shadow hover:bg-amber-300"
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
      <h1 className="text-2xl font-bold text-amber-100">Your stats</h1>

      {authLoading || loading ? (
        <p className="text-sm text-emerald-100/60">Loading…</p>
      ) : !stats ? (
        <p className="text-sm text-emerald-100/60">No games recorded yet — play one to see stats here.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <StatTile label="Games played" value={stats.games_played} />
            <StatTile label="Games won" value={stats.games_won} />
            <StatTile label="Win rate" value={winRate !== null ? `${winRate}%` : "—"} />
            <StatTile label="Best score" value={stats.best_score ?? "—"} sub="lower is better" />
            <StatTile
              label="Average score"
              value={stats.average_score != null ? Math.round(stats.average_score) : "—"}
            />
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-100/60">
              Wins by AI difficulty faced
            </h2>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <div
                  key={d}
                  className="rounded-lg bg-emerald-900/60 px-3 py-2 text-center text-sm capitalize"
                >
                  <div className="font-semibold text-amber-100">{stats.wins_by_difficulty[d] ?? 0}</div>
                  <div className="text-xs text-emerald-100/50">{d}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-100/60">
              Past games
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-emerald-100/50">No games recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((g) => (
                  <li key={g.id} className="rounded-lg bg-emerald-900/60 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-amber-100">Winner: {g.winner}</span>
                      <span className="text-xs text-emerald-100/50">
                        {new Date(g.played_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-emerald-100/60">
                      vs. {g.opponents.map((o) => o.name).join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Link href="/" className="text-center text-sm text-emerald-100/60 hover:text-emerald-100">
        Back to Home
      </Link>
    </main>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-emerald-900/60 px-4 py-3">
      <div className="text-xl font-bold text-amber-100">{value}</div>
      <div className="text-xs text-emerald-100/60">{label}</div>
      {sub && <div className="text-[10px] text-emerald-100/40">{sub}</div>}
    </div>
  );
}
