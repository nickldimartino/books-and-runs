"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { supabase } from "../lib/supabaseClient";
import {
  ACHIEVEMENT_TIERS,
  AchievementInstance,
  AchievementProgressState,
  AchievementTier,
  allAchievements,
  EMPTY_PROGRESS_STATE,
} from "@/achievements";

interface PlayerStatsRow {
  games_played: number;
  games_won: number;
  best_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

interface AchievementCountersRow {
  counters: Record<string, number>;
}

type StatusFilter = "all" | "unlocked" | "locked";
type SortMode = "default" | "closest";
type TierFilter = "all" | AchievementTier;

const TIER_LABEL: Record<AchievementTier, string> = {
  beginner: "Beginner",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

function formatValue(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

/** "42 / 75 books melded" for a normal climbing counter, but "Best: 12
 * (goal: 15 or lower)" for a lower-is-better one — "12 / 15" would read
 * backwards there, like barely-started progress instead of already cleared. */
function formatProgress(a: AchievementInstance): string {
  if (a.lowerIsBetter) {
    return `Best: ${formatValue(a.value)} (goal: ${a.threshold} or lower ${a.unit})`;
  }
  return `${formatValue(a.value)} / ${a.threshold} ${a.unit}`;
}

export default function AchievementsPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const [progress, setProgress] = useState<AchievementProgressState>(EMPTY_PROGRESS_STATE);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from("player_stats")
        .select("games_played, games_won, best_score, wins_by_difficulty")
        .eq("user_id", user.id)
        .maybeSingle<PlayerStatsRow>(),
      supabase
        .from("achievement_counters")
        .select("counters")
        .eq("user_id", user.id)
        .maybeSingle<AchievementCountersRow>(),
    ]).then(([statsRes, countersRes]) => {
      setProgress({
        counters: countersRes.data?.counters ?? {},
        gamesPlayed: statsRes.data?.games_played ?? 0,
        gamesWon: statsRes.data?.games_won ?? 0,
        bestScore: statsRes.data?.best_score ?? null,
        winsByDifficulty: statsRes.data?.wins_by_difficulty ?? {},
      });
      setLoading(false);
    });
  }, [user]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlockedCount = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);

  const visible = useMemo(() => {
    let list = achievements;
    if (statusFilter === "unlocked") list = list.filter((a) => a.unlocked);
    if (statusFilter === "locked") list = list.filter((a) => !a.unlocked);
    if (tierFilter !== "all") list = list.filter((a) => a.tier === tierFilter);

    if (sortMode === "closest") {
      list = [...list].sort((a, b) => {
        // Unlocked achievements aren't "closest to completion" candidates —
        // push them to the bottom, then rank the rest by progress descending.
        if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
        return b.progressFraction - a.progressFraction;
      });
    }
    return list;
  }, [achievements, statusFilter, tierFilter, sortMode]);

  if (!authLoading && !configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Achievements aren&apos;t set up yet</h1>
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
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in to see your achievements</h1>
        <p className="text-sm text-[var(--muted)]">
          Achievements only track your own turns at the table — signing in is how the game knows
          which seat is you.
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
        <h1 className="text-2xl font-bold text-[var(--heading)]">Achievements</h1>
        {!authLoading && !loading && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {unlockedCount} / {achievements.length} unlocked
          </p>
        )}
      </div>

      {authLoading || loading ? (
        <p className="text-sm text-[var(--faint)]">Loading…</p>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-xl bg-[var(--panel-soft)] p-3">
            <div className="flex flex-wrap gap-2">
              {([
                ["all", "All"],
                ["unlocked", "Completed"],
                ["locked", "Not completed"],
              ] as [StatusFilter, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    statusFilter === value
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--elevated)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTierFilter("all")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                  tierFilter === "all"
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--elevated)]"
                }`}
              >
                All tiers
              </button>
              {ACHIEVEMENT_TIERS.map((tier) => (
                <button
                  key={tier}
                  onClick={() => setTierFilter(tier)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                    tierFilter === tier
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--elevated)]"
                  }`}
                >
                  {TIER_LABEL[tier]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[var(--muted)]">Sort</label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-md bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              >
                <option value="default">Default order</option>
                <option value="closest">Closest to completion</option>
              </select>
            </div>
          </section>

          {visible.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">No achievements match these filters.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((a) => (
                <AchievementCard key={`${a.familyId}-${a.tier}`} achievement={a} />
              ))}
            </ul>
          )}
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}

function AchievementCard({ achievement }: { achievement: AchievementInstance }) {
  const pct = Math.round(achievement.progressFraction * 100);
  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        achievement.unlocked
          ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
          : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--heading)]">
          {achievement.unlocked ? "✓ " : ""}
          {achievement.familyTitle}
        </span>
        <span className="shrink-0 rounded-full bg-[var(--panel-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {TIER_LABEL[achievement.tier]}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--faint)]">{formatProgress(achievement)}</p>
      {!achievement.unlocked && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </li>
  );
}
