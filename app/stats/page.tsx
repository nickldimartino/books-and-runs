"use client";

// Profile page. Lifetime stats (games, win rate, best/worst/average score),
// a per-AI-difficulty breakdown, the account level, the separate
// "Multiplayer (vs. people)" section (played/won/streak/podiums, from
// getMyMpStats), and expandable histories of past local and MP games.
// Read-only — everything is fetched from Supabase on mount.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_TIERS,
  AchievementProgressState,
  AchievementTier,
  allAchievements,
  EMPTY_PROGRESS_STATE,
  tierNumber,
} from "@/achievements";
import { useAuth } from "../AuthContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { AchievementIcon } from "../components/AchievementIcons";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { formatScore } from "../lib/formatScore";
import {
  EMPTY_MP_STATS,
  getMyMpHistory,
  getMyMpStats,
  MpHistoryEntry,
  MpStats,
} from "../lib/mpStore";
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
  winner_score: number | null;
  rounds: RoundHistoryEntry[] | null;
  played_at: string;
}

const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;
const TIER_LABEL: Record<AchievementTier, string> = {
  beginner: "Beginner",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};
const DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"];
const PAST_GAMES_LIMIT = 10;

/**
 * Your final score for this game, or null if it can't be determined (a row
 * from before the `rounds` column existed, or your seat's name colliding
 * with an opponent's). The last entry in `rounds` has every player's final
 * cumulative total keyed by name — "your" name is whichever key isn't a
 * recorded opponent's.
 */
function yourScoreFor(g: GameHistoryRow): number | null {
  if (!g.rounds || g.rounds.length === 0) return null;
  const lastRound = g.rounds[g.rounds.length - 1];
  const opponentNames = new Set(g.opponents.map((o) => o.name));
  const candidates = Object.keys(lastRound.totals).filter((name) => !opponentNames.has(name));
  return candidates.length === 1 ? lastRound.totals[candidates[0]] : null;
}

export default function ProfilePage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [progress, setProgress] = useState<AchievementProgressState>(EMPTY_PROGRESS_STATE);
  const [dailyDealBestStreak, setDailyDealBestStreak] = useState<number | null>(null);
  const [mpStats, setMpStats] = useState<MpStats | null>(null);
  const [mpHistory, setMpHistory] = useState<MpHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinct from "stats is null because you haven't played yet" — a query
  // error (e.g. an unapplied migration) also leaves stats null.
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
      supabase
        .from("achievement_counters")
        .select("counters")
        .eq("user_id", user.id)
        .maybeSingle<{ counters: Record<string, number> }>(),
      supabase
        .from("leaderboard_entries")
        .select("daily_deal_best_streak")
        .eq("user_id", user.id)
        .maybeSingle<{ daily_deal_best_streak: number }>(),
      // Best-effort (needs migrations 0010/0011).
      getMyMpStats(supabase).catch(() => ({ ...EMPTY_MP_STATS })),
    ]).then(([statsRes, historyRes, countersRes, dailyDealRes, mp]) => {
      if (statsRes.error) {
        setStatsError(true);
      } else {
        setStats(statsRes.data);
      }
      setHistory((historyRes.data as GameHistoryRow[]) ?? []);
      setMpStats(mp);
      setProgress({
        counters: countersRes.data?.counters ?? {},
        gamesPlayed: statsRes.data?.games_played ?? 0,
        gamesWon: statsRes.data?.games_won ?? 0,
        bestScore: statsRes.data?.best_score ?? null,
        winsByDifficulty: statsRes.data?.wins_by_difficulty ?? {},
        mpGamesPlayed: mp.played,
        mpGamesWon: mp.won,
        mpBestWinStreak: mp.bestWinStreak,
      });
      setDailyDealBestStreak(dailyDealRes.data?.daily_deal_best_streak ?? 0);
      setLoading(false);
    });

    getMyMpHistory(supabase, 20).then(setMpHistory).catch(() => setMpHistory([]));
  }, [user]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked), [achievements]);
  const masteredFamilies = useMemo(() => {
    const per = new Map<string, number>();
    for (const a of unlocked) per.set(a.familyId, (per.get(a.familyId) ?? 0) + 1);
    return [...per.values()].filter((n) => n === ACHIEVEMENT_TIERS.length).length;
  }, [unlocked]);
  const rarest = useMemo(() => {
    for (const tier of [...ACHIEVEMENT_TIERS].reverse()) {
      const hit = unlocked.find((a) => a.tier === tier);
      if (hit) return hit;
    }
    return null;
  }, [unlocked]);
  const toughestBeaten = useMemo(() => {
    for (const d of [...DIFFICULTIES].reverse()) {
      if ((stats?.wins_by_difficulty?.[d] ?? 0) > 0) return d;
    }
    return null;
  }, [stats]);
  const unlockedByTier = useMemo(() => {
    const m = Object.fromEntries(ACHIEVEMENT_TIERS.map((t) => [t, 0])) as Record<AchievementTier, number>;
    for (const a of unlocked) m[a.tier] += 1;
    return m;
  }, [unlocked]);

  if (!authLoading && !configured) {
    return (
      <Gate title="Your profile isn't set up yet">
        This app doesn&apos;t have a Supabase project connected yet.
      </Gate>
    );
  }
  if (!authLoading && configured && !user) {
    return <Gate title="Sign in to see your profile" cta />;
  }

  const winRate =
    stats && stats.games_played > 0 ? Math.round((100 * stats.games_won) / stats.games_played) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <h1 className="text-2xl font-bold text-[var(--heading)]">Profile</h1>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : statsError ? (
        <p className="text-sm text-[var(--danger)]">
          Couldn&apos;t load your stats — check your connection, or that this Supabase project has
          every migration in <code>supabase/migrations/</code> applied.
        </p>
      ) : (
        <>
          {/* Level */}
          <section className="flex items-center gap-4 rounded-2xl bg-[var(--panel)] p-5">
            <div className="relative grid h-20 w-20 shrink-0 place-items-center">
              <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
                <circle cx="20" cy="20" r="17" fill="none" stroke="var(--panel-soft)" strokeWidth="4" />
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 17}`}
                  strokeDashoffset={`${2 * Math.PI * 17 * (1 - (level?.progressFraction ?? 0))}`}
                />
              </svg>
              <span className="text-2xl font-extrabold text-[var(--heading)]">{level?.level ?? 0}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Level</p>
              <p className="text-lg font-bold text-[var(--heading)]">Level {level?.level ?? 0}</p>
              {level && (
                <p className="text-xs text-[var(--faint)]">
                  {level.xpIntoLevel} / {level.xpSpanForLevel} XP to level {level.level + 1} · {level.totalXp} total
                </p>
              )}
            </div>
          </section>

          {stats ? (
            <>
              {/* Highlights */}
              <section className="grid grid-cols-2 gap-3">
                <Highlight label="Rarest unlock">
                  {rarest ? (
                    <span className="flex items-center gap-1.5">
                      <AchievementIcon
                        category={rarest.category}
                        className="h-4 w-4 shrink-0 text-[var(--accent)]"
                      />
                      <span className="truncate">
                        {rarest.familyTitle} {tierNumber(rarest.tier)}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                  <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                    {rarest ? `${TIER_LABEL[rarest.tier]} tier` : "nothing unlocked yet"}
                  </span>
                </Highlight>
                <Highlight label="Toughest AI beaten">
                  <span className="capitalize">{toughestBeaten ?? "—"}</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                    {toughestBeaten
                      ? `${stats.wins_by_difficulty?.[toughestBeaten] ?? 0} win${
                          (stats.wins_by_difficulty?.[toughestBeaten] ?? 0) === 1 ? "" : "s"
                        }`
                      : "no wins recorded"}
                  </span>
                </Highlight>
                <Highlight label="Best Daily Deal streak">
                  {(dailyDealBestStreak ?? 0) > 0 ? `🔥 ${dailyDealBestStreak}` : "—"}
                  <span className="mt-0.5 block text-[10px] text-[var(--faint)]">days in a row</span>
                </Highlight>
                <Highlight label="Best game">
                  {formatScore(stats.best_score)}
                  <span className="mt-0.5 block text-[10px] text-[var(--faint)]">lowest final score</span>
                </Highlight>
              </section>

              {/* Full stat grid */}
              <section className="grid grid-cols-2 gap-3">
                <StatTile label="Games played" value={stats.games_played} />
                <StatTile label="Games won" value={stats.games_won} />
                <StatTile label="Worst score" value={formatScore(stats.worst_score)} sub="higher is worse" />
                <StatTile label="Average score" value={formatScore(stats.average_score)} />
                <StatTile label="Win rate" value={winRate !== null ? `${winRate}%` : "—"} />
                <StatTile label="Games tied" value={stats.games_tied} sub="a rare result" />
              </section>

              {/* Wins by difficulty */}
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                  Wins by AI difficulty faced
                </h2>
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTIES.map((d) => (
                    <div key={d} className="rounded-lg bg-[var(--panel)] px-3 py-2 text-center text-sm capitalize">
                      <div className="font-semibold text-[var(--heading)]">{stats.wins_by_difficulty[d] ?? 0}</div>
                      <div className="text-xs text-[var(--faint)]">{d}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Multiplayer — vs. real people only (these games also feed the
                  overall stats above). */}
              {mpStats && mpStats.played > 0 && (
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                    Multiplayer (vs. people)
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    <StatTile label="Played" value={mpStats.played} />
                    <StatTile label="Won" value={mpStats.won} />
                    <StatTile
                      label="Win rate"
                      value={mpStats.played > 0 ? `${Math.round((100 * mpStats.won) / mpStats.played)}%` : "—"}
                    />
                    <StatTile
                      label="Win streak"
                      value={mpStats.currentWinStreak}
                      sub={mpStats.bestWinStreak > 0 ? `best ${mpStats.bestWinStreak}` : undefined}
                    />
                    <StatTile
                      label="Podium finishes"
                      value={mpStats.podiums}
                      sub="top half of the table"
                    />
                    {mpStats.biggestTableBeaten > 0 && (
                      <StatTile label="Biggest table won" value={`${mpStats.biggestTableBeaten}p`} />
                    )}
                  </div>
                </section>
              )}

              {/* Achievement showcase */}
              <section className="rounded-2xl bg-[var(--panel)] p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-[var(--heading)]">Achievements</h2>
                  <Link href="/achievements" className="text-xs font-medium text-[var(--accent)] hover:underline">
                    View all →
                  </Link>
                </div>
                <p className="mt-1 text-2xl font-extrabold text-[var(--heading)]">
                  {unlocked.length}
                  <span className="text-base font-medium text-[var(--faint)]"> / {TOTAL_ACHIEVEMENTS}</span>
                </p>
                <p className="text-xs text-[var(--faint)]">
                  {masteredFamilies} of {ACHIEVEMENT_FAMILIES.length} families mastered
                </p>
                <div className="mt-3 flex gap-1.5">
                  {ACHIEVEMENT_TIERS.map((t) => {
                    const n = unlockedByTier[t];
                    const max = ACHIEVEMENT_FAMILIES.length;
                    return (
                      <div key={t} className="flex-1 text-center">
                        <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-[var(--panel-soft)]">
                          <div
                            className="w-full rounded-t-[3px] bg-[var(--accent)]"
                            style={{ height: `${(n / max) * 100}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--faint)]">{TIER_LABEL[t]}</p>
                        <p className="text-[10px] font-semibold text-[var(--muted)]">{n}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Past games — collapsed; it's the longest thing on the page */}
              <details className="group rounded-lg border border-[var(--border)]">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--faint)] [&::-webkit-details-marker]:hidden">
                  <span>
                    Past games
                    <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">
                      last {Math.min(history.length, PAST_GAMES_LIMIT)}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[var(--faint)] transition group-open:rotate-180">
                    ▼
                  </span>
                </summary>
                {history.length === 0 ? (
                  <p className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--faint)]">
                    No games recorded yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
                    {history.map((g) => {
                      const yourScore = yourScoreFor(g);
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
              </details>

              {mpHistory.length > 0 && (
                <details className="group rounded-lg border border-[var(--border)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--faint)] [&::-webkit-details-marker]:hidden">
                    <span>
                      Past multiplayer games
                      <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">
                        last {mpHistory.length}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-[var(--faint)] transition group-open:rotate-180">
                      ▼
                    </span>
                  </summary>
                  <ul className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
                    {mpHistory.map((mg) => {
                      const mySeat = mg.seats.find((s) => s.userId === user?.id)?.seat;
                      const myScore = mySeat != null ? mg.cumulative_scores[String(mySeat)] : undefined;
                      const winnerName = mg.winner_user_id
                        ? mg.seats.find((s) => s.userId === mg.winner_user_id)?.name ?? "Someone"
                        : "an AI";
                      const won = mg.your_outcome === "won";
                      return (
                        <li key={mg.game_id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${won ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                              {won ? "You won" : mg.your_outcome === "resigned" ? "You left" : `Lost — ${winnerName} won`}
                            </span>
                            <span className="text-xs text-[var(--faint)]">
                              {mg.completed_at
                                ? new Date(mg.completed_at).toLocaleDateString(undefined, { dateStyle: "medium" })
                                : ""}
                            </span>
                          </div>
                          {myScore != null && (
                            <p className="mt-0.5 text-xs text-[var(--muted)]">Your score: {myScore} pts</p>
                          )}
                          <p className="mt-1 text-xs text-[var(--faint)]">
                            vs. {mg.seats.filter((s) => s.userId !== user?.id).map((s) => s.name).join(", ")}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--faint)]">
              No games recorded yet — play one to see your stats here. Your level still counts every
              achievement you unlock along the way.
            </p>
          )}
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}

function Gate({ title, children, cta }: { title: string; children?: React.ReactNode; cta?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-[var(--heading)]">{title}</h1>
      {children && <p className="text-sm text-[var(--muted)]">{children}</p>}
      <Link
        href={cta ? "/sign-in" : "/"}
        className={
          cta
            ? "mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
            : "mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        }
      >
        {cta ? "Sign in" : "Back to Home"}
      </Link>
    </main>
  );
}

function Highlight({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--panel)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
      <div className="mt-1 text-sm font-semibold text-[var(--heading)]">{children}</div>
    </div>
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
