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
import { AvatarFrame } from "../components/AvatarFrame";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { formatScore } from "../lib/formatScore";
import { getFriendRequests, getFriends, sendFriendRequest } from "../lib/friendsStore";
import {
  displayNameFor,
  fetchSeasonSnapshots,
  LeaderboardEntry,
  playerProfileHref,
  SeasonSnapshot,
  syncLeaderboardStats,
} from "../lib/leaderboardStore";
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
  | "games_won"
  | "worst_score"
  | "daily_deal_streak"
  | "daily_deal_best_streak"
  | "mp_games_won"
  | "mp_win_rate"
  | "mp_best_win_streak";

interface Column {
  key: SortKey;
  label: string;
  // minWidth matches each column's own tuned width from before this was a
  // shared render loop (e.g. "Achievements" needs more room for "199/200"
  // than "Level" needs for a single number) — kept per-key rather than
  // flattened to one shared value so the table's layout doesn't regress.
  minWidth: string;
  render: (entry: LeaderboardEntry) => React.ReactNode;
}

// Single source of truth for both the "Sort by" dropdown and the table's
// header/body cells — the season view (below) is just a filtered subset of
// this same list, reusing the exact same render logic against
// season-adjusted entries (see seasonAdjustedEntry).
const COLUMNS: Column[] = [
  { key: "level", label: "Level", minWidth: "60px", render: (e) => e.level },
  {
    key: "achievements",
    label: "Achievements",
    minWidth: "80px",
    render: (e) => `${e.achievements_unlocked}/${TOTAL_ACHIEVEMENTS}`,
  },
  { key: "total_xp", label: "Total XP", minWidth: "80px", render: (e) => e.total_xp },
  { key: "win_rate", label: "Win rate", minWidth: "70px", render: formatWinRate },
  { key: "average_score", label: "Avg. score", minWidth: "90px", render: (e) => formatScore(e.average_score) },
  { key: "games_played", label: "Games", minWidth: "70px", render: (e) => e.games_played },
  { key: "games_won", label: "Wins", minWidth: "70px", render: (e) => e.games_won },
  { key: "worst_score", label: "Worst score", minWidth: "90px", render: (e) => formatScore(e.worst_score) },
  { key: "daily_deal_streak", label: "Daily streak", minWidth: "90px", render: (e) => e.daily_deal_streak },
  {
    key: "daily_deal_best_streak",
    label: "Best streak",
    minWidth: "90px",
    render: (e) => e.daily_deal_best_streak,
  },
  { key: "mp_games_won", label: "MP wins", minWidth: "70px", render: (e) => e.mp_games_won ?? 0 },
  {
    key: "mp_win_rate",
    label: "MP win rate",
    minWidth: "90px",
    render: (e) =>
      (e.mp_games_played ?? 0) >= MP_WIN_RATE_MIN_GAMES
        ? `${Math.round((100 * (e.mp_games_won ?? 0)) / (e.mp_games_played ?? 1))}%`
        : "—",
  },
  { key: "mp_best_win_streak", label: "MP streak", minWidth: "80px", render: (e) => e.mp_best_win_streak ?? 0 },
];

// The season (this-month) board only ranks stats that actually reset —
// level/XP/achievements/daily-streaks/MP stats stay all-time-only by
// design (see migration 0044's own doc: a season is a delta of
// games_played/games_won, nothing else is diffable from a single monthly
// snapshot).
const SEASON_COLUMN_KEYS: SortKey[] = ["games_played", "games_won", "win_rate"];
const SEASON_COLUMNS: Column[] = COLUMNS.filter((c) => SEASON_COLUMN_KEYS.includes(c.key));

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
    case "games_won":
      return entry.games_won;
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

/**
 * Rewrites games_played/games_won as this-season deltas (current cumulative
 * minus the last monthly snapshot — see migration 0044) — every other field
 * is passed through unchanged, so this same entry can go straight into
 * formatWinRate/SEASON_COLUMNS' render functions with no special-casing.
 * An account with no snapshot yet (newer than the last one taken) gets a
 * baseline of 0, so its whole cumulative total counts for this season —
 * correct, since all of it happened within the season. Clamped at 0 as a
 * defensive floor only — cumulative totals never actually decrease.
 */
function seasonAdjustedEntry(entry: LeaderboardEntry, snapshots: Record<string, SeasonSnapshot>): LeaderboardEntry {
  const base = snapshots[entry.user_id];
  return {
    ...entry,
    games_played: Math.max(0, entry.games_played - (base?.games_played ?? 0)),
    games_won: Math.max(0, entry.games_won - (base?.games_won ?? 0)),
  };
}

/** "September 2026" — matches leaderboardStore.ts's currentSeasonStart, in
 * the visitor's own locale but the same UTC month boundary the snapshot
 * itself uses, so this label always names the season actually being shown. */
function seasonLabel(): string {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function LeaderboardPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortKeyAllTime, setSortKeyAllTime] = useState<SortKey>("level");
  const [sortKeySeason, setSortKeySeason] = useState<SortKey>("games_played");
  const [view, setView] = useState<"allTime" | "season">("allTime");
  const [seasonSnapshots, setSeasonSnapshots] = useState<Record<string, SeasonSnapshot>>({});
  const sortKey = view === "season" ? sortKeySeason : sortKeyAllTime;
  const setSortKey = view === "season" ? setSortKeySeason : setSortKeyAllTime;
  // Accounts you already friended or have a request pending with (either
  // direction) — the "Add friend" button is hidden for these. `requested`
  // covers the optimistic state right after a click, before the reload.
  const [relatedIds, setRelatedIds] = useState<Set<string>>(new Set());
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  // Actual friends only (not pending requests, unlike relatedIds above) —
  // just for the "Friends" view toggle below.
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"all" | "friends">("all");

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
          // MP games also bump games_played (mp/index.ts's recordMpGameOutcome,
          // server-side), so an MP-only player already passes this filter.
          .or("games_played.gt.0,daily_deal_best_streak.gt.0")
          .order("level", { ascending: false })
          .order("total_xp", { ascending: false })
          .then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
              setLoadError(true);
            } else {
              // Filtered client-side, not in the query itself — a project
              // that hasn't run migration 0047 yet has no is_test_account
              // column at all, and PostgREST errors on filtering by a
              // column select("*") would otherwise tolerate as simply
              // undefined (see the select's own comment above). !undefined
              // reads as "not a test account," so this is a no-op until
              // 0047 runs and something actually gets flagged.
              setEntries(((data as LeaderboardEntry[]) ?? []).filter((e) => !e.is_test_account));
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
        setFriendIds(new Set(friends.map((f) => f.userId)));
      })
      .catch((err) => console.error("Failed to load friend state:", err));
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!supabase || entries.length === 0) return;
    let cancelled = false;
    fetchSeasonSnapshots(
      supabase,
      entries.map((e) => e.user_id)
    )
      .then((snapshots) => {
        if (!cancelled) setSeasonSnapshots(snapshots);
      })
      .catch((err) => console.error("Failed to load season snapshots:", err));
    return () => {
      cancelled = true;
    };
  }, [entries]);

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
      <CenteredMessage title="The leaderboard isn't set up yet" body="This app doesn't have a Supabase project connected yet." />
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <CenteredMessage
        title="Sign in to see the leaderboard"
        body="It's only visible to accounts that are signed in — not the general public."
        signIn
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/" />

      <h1 className="text-2xl font-bold text-[var(--heading)]">Leaderboard</h1>

      <PageTip id="leaderboard" title="Finding your friends">
        Every signed-in account, ranked by whichever stat you sort by below — or tap the
        &quot;Friends&quot; toggle to rank against just the people you&apos;ve added. Tap any
        name to open their profile. Set your own name on the{" "}
        <Link href="/account" className="underline hover:text-[var(--heading)]">
          Account
        </Link>{" "}
        page.
      </PageTip>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">Couldn&apos;t load the leaderboard — check your connection and try again.</p>
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
          <div className="flex overflow-hidden self-start rounded-lg border border-[var(--border)] text-sm">
            <button
              onClick={() => setView("allTime")}
              className={`px-3 py-1.5 font-medium transition ${view === "allTime" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
            >
              All-time
            </button>
            <button
              onClick={() => setView("season")}
              className={`px-3 py-1.5 font-medium transition ${view === "season" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
            >
              This month
            </button>
          </div>

          {view === "season" && (
            <PageTip id="leaderboard-season" title="This month">
              Games played and won since {seasonLabel()} began — resets on the 1st of every
              month, so there&apos;s always a fresh race even if you&apos;re behind on the
              all-time board.
            </PageTip>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Sort by
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              >
                {(view === "season" ? SEASON_COLUMNS : COLUMNS).map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-sm">
              <button
                onClick={() => setScope("all")}
                className={`px-3 py-1.5 font-medium transition ${scope === "all" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
              >
                All players
              </button>
              <button
                onClick={() => setScope("friends")}
                className={`px-3 py-1.5 font-medium transition ${scope === "friends" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
              >
                Friends
              </button>
            </div>
          </div>

          {(() => {
            const scopedEntries =
              scope === "friends" ? entries.filter((e) => friendIds.has(e.user_id) || e.user_id === user?.id) : entries;
            if (scope === "friends" && scopedEntries.length === 0) {
              return (
                <EmptyState icon="🤝">
                  None of your friends have finished a tracked game or a Daily Deal yet.
                </EmptyState>
              );
            }
            const visibleEntries =
              view === "season"
                ? scopedEntries.map((e) => seasonAdjustedEntry(e, seasonSnapshots)).filter((e) => e.games_played > 0)
                : scopedEntries;
            if (view === "season" && visibleEntries.length === 0) {
              return (
                <EmptyState icon="🗓️">
                  Nobody&apos;s finished a tracked game this month yet — play one to be the first.
                </EmptyState>
              );
            }
            const activeColumns = view === "season" ? SEASON_COLUMNS : COLUMNS;
            return (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[var(--panel)] text-xs text-[var(--faint)]">
                  <th className="sticky left-0 bg-[var(--panel)] px-3 py-2 font-medium">Player</th>
                  {activeColumns.map((col) => (
                    <th
                      key={col.key}
                      style={{ minWidth: col.minWidth }}
                      className={`px-2 py-2 text-center font-medium ${sortKey === col.key ? "text-[var(--accent)]" : ""}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortEntries(visibleEntries, sortKey).map((entry, i) => {
                  const isYou = entry.user_id === user?.id;
                  return (
                    <tr
                      key={entry.user_id}
                      className={`border-t border-[var(--border)] ${isYou ? "bg-[var(--accent)]/10" : ""}`}
                    >
                      <td
                        className={`sticky left-0 px-3 py-2 font-medium ${isYou ? "bg-[var(--panel)] text-[var(--accent)]" : "bg-[var(--bg)] text-[var(--heading)]"}`}
                      >
                        <Link
                          href={playerProfileHref(entry.user_id)}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap hover:underline"
                        >
                          <span className="text-[var(--faint)]">{i + 1}.</span>
                          <AvatarFrame frame={entry.avatar_frame} size={22}>
                            <PlayerAvatar
                              avatar={{
                                kind: entry.avatar_kind,
                                emoji: entry.avatar_emoji,
                                color: entry.avatar_color,
                                photoPath: entry.avatar_photo_path,
                              }}
                              updatedAt={entry.updated_at}
                              size={22}
                            />
                          </AvatarFrame>
                          {displayNameFor(entry)}
                        </Link>
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
                      {activeColumns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-2 py-2 text-center ${col.key === "level" ? "font-semibold text-[var(--heading)]" : "text-[var(--muted)]"}`}
                        >
                          {col.render(entry)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            );
          })()}
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
