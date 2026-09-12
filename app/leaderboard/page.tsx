"use client";

// The leaderboard: one row per account from `leaderboard_entries` (a
// self-reported public snapshot each client upserts via syncLeaderboardStats
// — see migration 0006). Sortable by several stats including the MP columns
// (min-games gates apply to win-rate sorts). Each row has an add-friend
// button (the standard person-plus icon) when signed in.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_TIERS,
  MP_WIN_RATE_MIN_GAMES,
  WIN_RATE_MIN_GAMES,
} from "@/achievements";
import { useAuth } from "../AuthContext";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { formatScore } from "../lib/formatScore";
import { getFriendRequests, getFriends, sendFriendRequest } from "../lib/friendsStore";
import { displayNameFor, LeaderboardEntry, syncLeaderboardStats } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** The near-universal "add friend" glyph — a person with a plus. */
function PersonAddIcon() {
  return (
    <svg {...ICON_PROPS} className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8.5v5M15.5 11h5" />
    </svg>
  );
}

/** Same figure, request-already-sent — a person with a check. */
function PersonCheckIcon() {
  return (
    <svg {...ICON_PROPS} className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15 11.5l2 2 4-4" />
    </svg>
  );
}

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
  | "daily_deal_best_streak"
  | "mp_games_won"
  | "mp_win_rate"
  | "mp_best_win_streak";

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
  { key: "mp_games_won", label: "MP wins", minWidth: "70px" },
  { key: "mp_win_rate", label: "MP win rate", minWidth: "90px" },
  { key: "mp_best_win_streak", label: "MP streak", minWidth: "80px" },
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
    case "mp_games_won":
      return entry.mp_games_won ?? 0;
    case "mp_best_win_streak":
      return entry.mp_best_win_streak ?? 0;
    case "mp_win_rate":
      return (entry.mp_games_played ?? 0) < MP_WIN_RATE_MIN_GAMES
        ? -Infinity
        : (entry.mp_games_won ?? 0) / (entry.mp_games_played ?? 1);
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
  // Accounts you already friended or have a request pending with (either
  // direction) — the "Add friend" button is hidden for these. `requested`
  // covers the optimistic state right after a click, before the reload.
  const [relatedIds, setRelatedIds] = useState<Set<string>>(new Set());
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

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
          // select("*") rather than an explicit list: leaderboard_entries is
          // all-public by design (see migration 0006), and a "*" means a
          // project that hasn't run a stats-column migration yet still loads
          // — the missing columns just read as undefined, handled below.
          .select("*")
          // Every signed-in visit to Account/Leaderboard self-heals a row for
          // that account (see the sync above) — without this filter, an
          // account that only ever opened one of those pages once, and never
          // actually finished a tracked game, would sit on the board
          // permanently at 0/0/0. A leaderboard should only ever rank real
          // activity — which now includes a Daily Deal streak on its own:
          // someone who's only ever played Daily Deal (never a full tracked
          // game) still has a real streak worth ranking, so the "real
          // activity" bar here is either kind of activity, not just games_played.
          // MP games also bump games_played (recordMpGameResult → recordGameResult),
          // so an MP-only player already passes the games_played filter.
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

  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    Promise.all([getFriends(supabase), getFriendRequests(supabase)])
      .then(([friends, requests]) => {
        if (cancelled) return;
        const s = new Set<string>();
        friends.forEach((f) => s.add(f.userId));
        requests.forEach((r) => s.add(r.otherUserId));
        setRelatedIds(s);
      })
      .catch((err) => console.error("Failed to load friend state:", err));
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function addFriend(targetId: string) {
    if (!supabase) return;
    setRequestedIds((prev) => new Set(prev).add(targetId));
    try {
      await sendFriendRequest(supabase, targetId);
    } catch (err) {
      console.error("Add friend failed:", err);
      setRequestedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  }

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
        <Link
          href="/"
          className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Back to Home
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
        <EmptyState
          icon="🏆"
          action={
            <Link
              href="/new-game"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
            >
              New Game
            </Link>
          }
        >
          Nobody&apos;s finished a tracked game or a Daily Deal yet — play one to be the first.
        </EmptyState>
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
                        <span className="whitespace-nowrap">
                          <span className="text-[var(--faint)]">{i + 1}.</span> {displayNameFor(entry)}
                        </span>
                        {user && !isYou && !relatedIds.has(entry.user_id) && (
                          <button
                            onClick={() => addFriend(entry.user_id)}
                            disabled={requestedIds.has(entry.user_id)}
                            aria-label={
                              requestedIds.has(entry.user_id)
                                ? `Friend request sent to ${displayNameFor(entry)}`
                                : `Add ${displayNameFor(entry)} as a friend`
                            }
                            title={requestedIds.has(entry.user_id) ? "Request sent" : "Add friend"}
                            className="ml-2 inline-flex shrink-0 items-center rounded p-1 align-middle text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:text-[var(--faint)] disabled:hover:bg-transparent"
                          >
                            {requestedIds.has(entry.user_id) ? <PersonCheckIcon /> : <PersonAddIcon />}
                          </button>
                        )}
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
                      <td className="px-2 py-2 text-center text-[var(--muted)]">{entry.mp_games_won ?? 0}</td>
                      <td className="px-2 py-2 text-center text-[var(--muted)]">
                        {(entry.mp_games_played ?? 0) >= MP_WIN_RATE_MIN_GAMES
                          ? `${Math.round((100 * (entry.mp_games_won ?? 0)) / (entry.mp_games_played ?? 1))}%`
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-center text-[var(--muted)]">{entry.mp_best_win_streak ?? 0}</td>
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
