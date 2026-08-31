"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS, WIN_RATE_MIN_GAMES } from "@/achievements";
import { useAuth } from "../AuthContext";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { formatScore } from "../lib/formatScore";
import { displayNameFor, LeaderboardEntry, syncLeaderboardStats } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;

function formatWinRate(entry: LeaderboardEntry): string {
  if (entry.games_played < WIN_RATE_MIN_GAMES) return "—";
  return `${Math.round((100 * entry.games_won) / entry.games_played)}%`;
}

type SortKey =
  | "level"
  | "achievements"
  | "total_xp"
  | "win_rate"
  | "average_score"
  | "games_played"
  | "worst_score"
  | "daily_deal_streak"
  | "daily_deal_best_streak";

// minWidth matches each column's own tuned width from before this was a
// shared render loop (e.g. "Achievements" needs more room for "199/200"
// than "Level" needs for a single number) — kept per-key rather than
// flattened to one shared value so the table's layout doesn't regress.
const SORT_OPTIONS: { key: SortKey; label: string; minWidth: string }[] = [
  { key: "level", label: "Level", minWidth: "60px" },
  { key: "achievements", label: "Achievements", minWidth: "80px" },
  { key: "total_xp", label: "Total XP", minWidth: "80px" },
  { key: "win_rate", label: "Win rate", minWidth: "70px" },
  { key: "average_score", label: "Avg. score", minWidth: "90px" },
  { key: "games_played", label: "Games", minWidth: "70px" },
  { key: "worst_score", label: "Worst score", minWidth: "90px" },
  { key: "daily_deal_streak", label: "Daily streak", minWidth: "90px" },
  { key: "daily_deal_best_streak", label: "Best streak", minWidth: "90px" },
];

/**
 * A single number per sort key where *higher always means "ranks first"*.
 * Average score is negated — a lower average is the better result in
 * Contract Rummy (lowest cumulative score wins), so this ranks the best
 * performers first rather than needing its own separate ascending case in
 * the comparator below. Worst score is deliberately the opposite: sorting
 * by it ranks the literal highest (i.e. worst) number first, the way
 * sorting a spreadsheet column by its own value would — showing "how bad
 * can it get" rather than re-explaining "best" for a column that's already
 * named for someone's low point. Win rate below the games-played threshold
 * (shown as "—", not a real rate to rank by) and a missing score both sort
 * to the very bottom regardless of direction, the same way "—" already
 * reads as "not enough data" rather than as an actual value of zero.
 */
function sortValue(entry: LeaderboardEntry, key: SortKey): number {
  switch (key) {
    case "level":
      return entry.level;
    case "achievements":
      return entry.achievements_unlocked;
    case "total_xp":
      return entry.total_xp;
    case "games_played":
      return entry.games_played;
    case "win_rate":
      return entry.games_played < WIN_RATE_MIN_GAMES ? -Infinity : entry.games_won / entry.games_played;
    case "average_score":
      return entry.average_score == null ? -Infinity : -entry.average_score;
    case "worst_score":
      return entry.worst_score == null ? -Infinity : entry.worst_score;
    case "daily_deal_streak":
      return entry.daily_deal_streak;
    case "daily_deal_best_streak":
      return entry.daily_deal_best_streak;
  }
}

/** Sorts by the chosen stat (best first); ties fall back to the board's
 * original default order (level, then total XP) rather than an arbitrary
 * one, so picking a different sort doesn't scramble equal-ranked players. */
function sortEntries(entries: LeaderboardEntry[], key: SortKey): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    const primary = sortValue(b, key) - sortValue(a, key);
    if (primary !== 0) return primary;
    if (key !== "level" && b.level !== a.level) return b.level - a.level;
    return b.total_xp - a.total_xp;
  });
}

export default function LeaderboardPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("level");

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
            "user_id, display_name, level, total_xp, achievements_unlocked, games_played, games_won, average_score, worst_score, daily_deal_streak, daily_deal_best_streak, updated_at"
          )
          // Every signed-in visit to Account/Leaderboard self-heals a row for
          // that account (see the sync above) — without this filter, an
          // account that only ever opened one of those pages once, and never
          // actually finished a tracked game, would sit on the board
          // permanently at 0/0/0. A leaderboard should only ever rank real
          // activity — which now includes a Daily Deal streak on its own:
          // someone who's only ever played Daily Deal (never a full tracked
          // game) still has a real streak worth ranking, so the "real
          // activity" bar here is either kind of activity, not just games_played.
          .or("games_played.gt.0,daily_deal_best_streak.gt.0")
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
          Every signed-in account, ranked by whichever stat you sort by below. Set your own name on the{" "}
          <Link href="/account" className="underline hover:text-[var(--heading)]">
            Account
          </Link>{" "}
          page.
        </p>
      </div>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">
          Couldn&apos;t load the leaderboard — check your connection, or that this Supabase project has
          every migration in <code>supabase/migrations/</code> applied.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[var(--faint)]">
          Nobody&apos;s finished a tracked game or a Daily Deal yet — play one to be the first.
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 self-start text-sm text-[var(--muted)]">
            Sort by
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[var(--panel)] text-xs text-[var(--faint)]">
                  <th className="sticky left-0 bg-[var(--panel)] px-3 py-2 font-medium">Player</th>
                  {SORT_OPTIONS.map((opt) => (
                    <th
                      key={opt.key}
                      style={{ minWidth: opt.minWidth }}
                      className={`px-2 py-2 text-center font-medium ${sortKey === opt.key ? "text-[var(--accent)]" : ""}`}
                    >
                      {opt.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortEntries(entries, sortKey).map((entry, i) => {
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
                      <td className="px-2 py-2 text-center text-[var(--muted)]">{entry.daily_deal_streak}</td>
                      <td className="px-2 py-2 text-center text-[var(--muted)]">{entry.daily_deal_best_streak}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* entries.length > 0 guard: with an empty board, the message above
          this already says the same thing ("play one to be the first") —
          showing both would just repeat it. */}
      {!authLoading && !loading && !loadError && user && entries.length > 0 && !entries.some((e) => e.user_id === user.id) && (
        <p className="text-center text-xs text-[var(--faint)]">
          You haven&apos;t finished a tracked game or a Daily Deal yet — play one to show up here.
        </p>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
