"use client";

// The leaderboard: one row per account from `leaderboard_entries` (a
// self-reported public snapshot each client upserts via syncLeaderboardStats
// — see migration 0006). Sortable by several stats including the MP columns
// (min-games gates apply to win-rate sorts). Each row has an add-friend
// button (the standard person-plus icon) when signed in.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { TranslationKey } from "../lib/i18n/keys";
import { useT } from "../lib/i18n/LocaleProvider";
import type { Vars } from "../lib/i18n/LocaleProvider";
import { formatWinRate } from "../lib/profileShareCard";
import {
  displayNameFor,
  fetchLeaderboardPage,
  fetchMyLeaderboardRow,
  LeaderboardEntry,
  LeaderboardRow,
  playerProfileHref,
  syncLeaderboardStats,
} from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 50;
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

type T = (key: TranslationKey, vars?: Vars) => string;

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
// season-adjusted entries (see seasonAdjustedEntry). A function (rather than
// a module-level constant) because the labels need to be reactive to the
// current locale.
function buildColumns(t: T): Column[] {
  return [
    { key: "level", label: t("leaderboard.column.level"), minWidth: "60px", render: (e) => e.level },
    {
      key: "achievements",
      label: t("leaderboard.column.achievements"),
      minWidth: "80px",
      render: (e) => `${e.achievements_unlocked}/${TOTAL_ACHIEVEMENTS}`,
    },
    { key: "total_xp", label: t("leaderboard.column.totalXp"), minWidth: "80px", render: (e) => e.total_xp },
    {
      key: "win_rate",
      label: t("leaderboard.column.winRate"),
      minWidth: "70px",
      render: (e) => formatWinRate(e.games_played, e.games_won),
    },
    {
      key: "average_score",
      label: t("leaderboard.column.avgScore"),
      minWidth: "90px",
      render: (e) => formatScore(e.average_score),
    },
    { key: "games_played", label: t("leaderboard.column.games"), minWidth: "70px", render: (e) => e.games_played },
    { key: "games_won", label: t("leaderboard.column.wins"), minWidth: "70px", render: (e) => e.games_won },
    {
      key: "worst_score",
      label: t("leaderboard.column.worstScore"),
      minWidth: "90px",
      render: (e) => formatScore(e.worst_score),
    },
    {
      key: "daily_deal_streak",
      label: t("leaderboard.column.dailyStreak"),
      minWidth: "90px",
      render: (e) => e.daily_deal_streak,
    },
    {
      key: "daily_deal_best_streak",
      label: t("leaderboard.column.bestStreak"),
      minWidth: "90px",
      render: (e) => e.daily_deal_best_streak,
    },
    {
      key: "mp_games_won",
      label: t("leaderboard.column.mpWins"),
      minWidth: "70px",
      render: (e) => e.mp_games_won ?? 0,
    },
    {
      key: "mp_win_rate",
      label: t("leaderboard.column.mpWinRate"),
      minWidth: "90px",
      render: (e) =>
        (e.mp_games_played ?? 0) >= MP_WIN_RATE_MIN_GAMES
          ? `${Math.round((100 * (e.mp_games_won ?? 0)) / (e.mp_games_played ?? 1))}%`
          : "—",
    },
    {
      key: "mp_best_win_streak",
      label: t("leaderboard.column.mpStreak"),
      minWidth: "80px",
      render: (e) => e.mp_best_win_streak ?? 0,
    },
  ];
}

// The season (this-month) board only ranks stats that actually reset —
// level/XP/achievements/daily-streaks/MP stats stay all-time-only by
// design (see migration 0044's own doc: a season is a delta of
// games_played/games_won, nothing else is diffable from a single monthly
// snapshot).
const SEASON_COLUMN_KEYS: SortKey[] = ["games_played", "games_won", "win_rate"];

/** "September 2026" — matches leaderboardStore.ts's currentSeasonStart, in
 * the visitor's own locale but the same UTC month boundary the snapshot
 * itself uses, so this label always names the season actually being shown. */
function seasonLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function LeaderboardPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { t, locale } = useT();
  const columns = useMemo(() => buildColumns(t), [t]);
  const seasonColumns = useMemo(() => columns.filter((c) => SEASON_COLUMN_KEYS.includes(c.key)), [columns]);
  // Server-paged (migration 0063): rows arrive already ranked/filtered, a page
  // at a time — no whole-table download and no silent 1000-row cap.
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [myRow, setMyRow] = useState<LeaderboardRow | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortKeyAllTime, setSortKeyAllTime] = useState<SortKey>("level");
  const [sortKeySeason, setSortKeySeason] = useState<SortKey>("games_played");
  const [view, setView] = useState<"allTime" | "season">("allTime");
  const sortKey = view === "season" ? sortKeySeason : sortKeyAllTime;
  const setSortKey = view === "season" ? setSortKeySeason : setSortKeyAllTime;
  // Accounts you already friended or have a request pending with (either
  // direction) — the "Add friend" button is hidden for these. `requested`
  // covers the optimistic state right after a click, before the reload.
  const [relatedIds, setRelatedIds] = useState<Set<string>>(new Set());
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"all" | "friends">("all");
  const [everLoaded, setEverLoaded] = useState(false);

  const query = useMemo(
    () => ({
      sort: sortKey,
      season: view === "season",
      friendsOnly: scope === "friends",
      minGames: WIN_RATE_MIN_GAMES,
      mpMinGames: MP_WIN_RATE_MIN_GAMES,
    }),
    [sortKey, view, scope]
  );

  // Self-heal this account's own row once per visit, then rank.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    const client = supabase;
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!syncedRef.current) {
        syncedRef.current = true;
        await syncLeaderboardStats(client, user.id).catch((err) =>
          console.error("Failed to sync leaderboard entry:", err)
        );
      }
      try {
        const [page, mine] = await Promise.all([
          fetchLeaderboardPage(client, query, 0, PAGE_SIZE),
          fetchMyLeaderboardRow(client, query).catch(() => null),
        ]);
        if (cancelled) return;
        setRows(page);
        setHasMore(page.length === PAGE_SIZE);
        setMyRow(mine);
        setLoadError(false);
        setEverLoaded(true);
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, query]);

  async function loadMore() {
    if (!supabase || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchLeaderboardPage(supabase, query, rows.length, PAGE_SIZE);
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load more:", err);
    } finally {
      setLoadingMore(false);
    }
  }

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
    return <CenteredMessage title={t("leaderboard.notSetUp.title")} body={t("leaderboard.notSetUp.body")} />;
  }

  if (!authLoading && configured && !user) {
    return (
      <CenteredMessage
        title={t("leaderboard.signInGate.title")}
        body={t("leaderboard.signInGate.body")}
        signIn
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/" />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("home.progressTile.leaderboard")}</h1>

      <PageTip id="leaderboard" title={t("leaderboard.tip.title")}>
        {t("leaderboard.tip.bodyBeforeAccount")}{" "}
        <Link href="/account" className="underline hover:text-[var(--heading)]">
          {t("home.account")}
        </Link>{" "}
        {t("leaderboard.tip.bodyAfterAccount")}
      </PageTip>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">{t("leaderboard.loadError")}</p>
      ) : !everLoaded || (rows.length === 0 && view === "allTime" && scope === "all") ? (
        <EmptyState
          icon="🏆"
          action={
            <Link
              href="/new-game"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
            >
              {t("home.newGame")}
            </Link>
          }
        >
          {t("leaderboard.emptyAll")}
        </EmptyState>
      ) : (
        <>
          <div className="flex overflow-hidden self-start rounded-lg border border-[var(--border)] text-sm">
            <button
              onClick={() => setView("allTime")}
              className={`px-3 py-1.5 font-medium transition ${view === "allTime" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
            >
              {t("leaderboard.view.allTime")}
            </button>
            <button
              onClick={() => setView("season")}
              className={`px-3 py-1.5 font-medium transition ${view === "season" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
            >
              {t("leaderboard.view.thisMonth")}
            </button>
          </div>

          {view === "season" && (
            <PageTip id="leaderboard-season" title={t("leaderboard.view.thisMonth")}>
              {t("leaderboard.seasonTip.body", { season: seasonLabel(locale) })}
            </PageTip>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              {t("leaderboard.sortBy")}
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              >
                {(view === "season" ? seasonColumns : columns).map((col) => (
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
                {t("leaderboard.scope.allPlayers")}
              </button>
              <button
                onClick={() => setScope("friends")}
                className={`px-3 py-1.5 font-medium transition ${scope === "friends" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
              >
                {t("home.progressTile.friends")}
              </button>
            </div>
          </div>

          {(() => {
            if (rows.length === 0) {
              return scope === "friends" ? (
                <EmptyState icon="🤝">{t("leaderboard.emptyFriends")}</EmptyState>
              ) : (
                <EmptyState icon="🗓️">{t("leaderboard.emptySeason")}</EmptyState>
              );
            }
            const activeColumns = view === "season" ? seasonColumns : columns;
            return (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[var(--panel)] text-xs text-[var(--faint)]">
                  <th className="sticky left-0 bg-[var(--panel)] px-3 py-2 font-medium">
                    {t("leaderboard.column.player")}
                  </th>
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
                {rows.map(({ rank, entry }) => {
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
                          <span className="text-[var(--faint)]">{rank}.</span>
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
                                ? t("leaderboard.friendRequestSentAria", { name: displayNameFor(entry) })
                                : t("leaderboard.addFriendAria", { name: displayNameFor(entry) })
                            }
                            title={requestedIds.has(entry.user_id) ? t("leaderboard.requestSent") : t("leaderboard.addFriend")}
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
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="self-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
            >
              {loadingMore ? t("common.loading") : t("leaderboard.loadMore")}
            </button>
          )}
          {myRow && (
            <p className="sticky bottom-3 self-center rounded-full border border-[var(--accent)]/40 bg-[var(--panel)] px-4 py-1.5 text-xs font-semibold text-[var(--accent)] shadow">
              {t("leaderboard.yourRank", { rank: myRow.rank, total: myRow.total })}
            </p>
          )}
        </>
      )}

      {/* entries.length > 0 guard: with an empty board, the message above
          this already says the same thing ("play one to be the first") —
          showing both would just repeat it. */}
      {!authLoading && !loading && !loadError && user && everLoaded && !myRow && view === "allTime" && scope === "all" && (
        <p className="text-center text-xs text-[var(--faint)]">{t("leaderboard.notOnBoardYet")}</p>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        {t("common.backToHome")}
      </Link>
    </main>
  );
}
