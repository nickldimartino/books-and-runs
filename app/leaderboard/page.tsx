"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS, WIN_RATE_MIN_GAMES } from "@/achievements";
import { useAuth } from "../AuthContext";
import { displayNameFor, LeaderboardEntry, syncLeaderboardStats } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;

function formatWinRate(entry: LeaderboardEntry): string {
  if (entry.games_played < WIN_RATE_MIN_GAMES) return "—";
  return `${Math.round((100 * entry.games_won) / entry.games_played)}%`;
}

function formatScore(value: number | null): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export default function LeaderboardPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Sync this account's own row first — a self-heal for a past failed
    // sync, or an account whose stats simply haven't changed since the
    // leaderboard table was added — so nobody visits this page and finds
    // themselves missing or stale on their own board.
    syncLeaderboardStats(supabase, user.id)
      .catch((err) => console.error("Failed to sync leaderboard entry:", err))
      .then(() => {
        if (cancelled || !supabase) return;
        return supabase
          .from("leaderboard_entries")
          .select(
            "user_id, display_name, level, total_xp, achievements_unlocked, games_played, games_won, average_score, worst_score, updated_at"
          )
          .order("level", { ascending: false })
          .order("total_xp", { ascending: false })
          .then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
              setLoadError(true);
            } else {
              setEntries((data as LeaderboardEntry[]) ?? []);
            }
            setLoading(false);
          });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!authLoading && !configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">The leaderboard isn&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">This app doesn&apos;t have a Supabase project connected yet.</p>
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
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in to see the leaderboard</h1>
        <p className="text-sm text-[var(--muted)]">
          It&apos;s only visible to accounts that are signed in — not the general public.
        </p>
        <Link
          href="/sign-in"
          className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Leaderboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Every signed-in account, ranked by level. Set your own name on the{" "}
          <Link href="/account" className="underline hover:text-[var(--heading)]">
            Account
          </Link>{" "}
          page.
        </p>
      </div>

      {authLoading || loading ? (
        <p className="text-sm text-[var(--faint)]">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">
          Couldn&apos;t load the leaderboard — check your connection, or that this Supabase project has
          every migration in <code>supabase/migrations/</code> applied.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[var(--faint)]">Nobody&apos;s on the board yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[var(--panel)] text-xs text-[var(--faint)]">
                <th className="sticky left-0 bg-[var(--panel)] px-3 py-2 font-medium">Player</th>
                <th className="min-w-[60px] px-2 py-2 text-center font-medium">Level</th>
                <th className="min-w-[80px] px-2 py-2 text-center font-medium">Achievements</th>
                <th className="min-w-[80px] px-2 py-2 text-center font-medium">Total XP</th>
                <th className="min-w-[70px] px-2 py-2 text-center font-medium">Win rate</th>
                <th className="min-w-[90px] px-2 py-2 text-center font-medium">Avg. score</th>
                <th className="min-w-[70px] px-2 py-2 text-center font-medium">Games</th>
                <th className="min-w-[90px] px-2 py-2 text-center font-medium">Worst score</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const isYou = entry.user_id === user?.id;
                return (
                  <tr
                    key={entry.user_id}
                    className={`border-t border-[var(--border)] ${isYou ? "bg-[var(--accent)]/10" : ""}`}
                  >
                    <td
                      className={`sticky left-0 px-3 py-2 font-medium ${isYou ? "bg-[var(--panel)] text-[var(--accent)]" : "bg-[var(--bg)] text-[var(--heading)]"}`}
                    >
                      <span className="text-[var(--faint)]">{i + 1}.</span> {displayNameFor(entry)}
                      {isYou && <span className="ml-1.5 text-xs font-normal text-[var(--faint)]">(you)</span>}
                    </td>
                    <td className="px-2 py-2 text-center font-semibold text-[var(--heading)]">{entry.level}</td>
                    <td className="px-2 py-2 text-center text-[var(--muted)]">
                      {entry.achievements_unlocked}/{TOTAL_ACHIEVEMENTS}
                    </td>
                    <td className="px-2 py-2 text-center text-[var(--muted)]">{entry.total_xp}</td>
                    <td className="px-2 py-2 text-center text-[var(--muted)]">{formatWinRate(entry)}</td>
                    <td className="px-2 py-2 text-center text-[var(--muted)]">{formatScore(entry.average_score)}</td>
                    <td className="px-2 py-2 text-center text-[var(--muted)]">{entry.games_played}</td>
                    <td className="px-2 py-2 text-center text-[var(--muted)]">{formatScore(entry.worst_score)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
