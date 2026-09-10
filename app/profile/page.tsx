"use client";

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
import { supabase } from "../lib/supabaseClient";

interface StatsRow {
  games_played: number;
  games_won: number;
  best_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;
const TIER_LABEL: Record<AchievementTier, string> = {
  beginner: "Beginner",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};
const DIFFICULTY_ORDER = ["beginner", "easy", "medium", "hard", "expert"];

function SignedOut({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-[var(--heading)]">{title}</h1>
      <Link
        href="/sign-in"
        className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
      >
        Sign in
      </Link>
    </main>
  );
}

export default function ProfilePage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [progress, setProgress] = useState<AchievementProgressState>(EMPTY_PROGRESS_STATE);
  const [bestStreak, setBestStreak] = useState(0);
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
        .select("games_played, games_won, best_score, wins_by_difficulty")
        .eq("user_id", user.id)
        .maybeSingle<StatsRow>(),
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
    ]).then(([s, c, d]) => {
      setStats(s.data ?? null);
      setProgress({
        counters: c.data?.counters ?? {},
        gamesPlayed: s.data?.games_played ?? 0,
        gamesWon: s.data?.games_won ?? 0,
        bestScore: s.data?.best_score ?? null,
        winsByDifficulty: s.data?.wins_by_difficulty ?? {},
      });
      setBestStreak(d.data?.daily_deal_best_streak ?? 0);
      setLoading(false);
    });
  }, [user]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked), [achievements]);
  const masteredFamilies = useMemo(() => {
    const per = new Map<string, number>();
    for (const a of unlocked) per.set(a.familyId, (per.get(a.familyId) ?? 0) + 1);
    return [...per.values()].filter((n) => n === ACHIEVEMENT_TIERS.length).length;
  }, [unlocked]);

  // "Rarest" = the highest tier unlocked anywhere; the family that got there
  // first (families are in a deliberate order) breaks the tie.
  const rarest = useMemo(() => {
    for (const tier of [...ACHIEVEMENT_TIERS].reverse()) {
      const hit = unlocked.find((a) => a.tier === tier);
      if (hit) return hit;
    }
    return null;
  }, [unlocked]);

  const toughestBeaten = useMemo(() => {
    for (const d of [...DIFFICULTY_ORDER].reverse()) {
      if ((stats?.wins_by_difficulty?.[d] ?? 0) > 0) return d;
    }
    return null;
  }, [stats]);

  const unlockedByTier = useMemo(() => {
    const m = Object.fromEntries(ACHIEVEMENT_TIERS.map((t) => [t, 0])) as Record<AchievementTier, number>;
    for (const a of unlocked) m[a.tier] += 1;
    return m;
  }, [unlocked]);

  if (!authLoading && !configured) return <SignedOut title="Profiles aren't set up yet" />;
  if (!authLoading && configured && !user) return <SignedOut title="Sign in to see your profile" />;

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

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Level badge */}
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

          {/* Highlights */}
          <section className="grid grid-cols-2 gap-3">
            <Highlight label="Rarest unlock">
              {rarest ? (
                <span className="flex items-center gap-1.5">
                  <AchievementIcon category={rarest.category} className="h-4 w-4 shrink-0 text-[var(--accent)]" />
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
                  ? `${stats?.wins_by_difficulty?.[toughestBeaten] ?? 0} win${
                      (stats?.wins_by_difficulty?.[toughestBeaten] ?? 0) === 1 ? "" : "s"
                    }`
                  : "no wins recorded"}
              </span>
            </Highlight>

            <Highlight label="Best Daily Deal streak">
              {bestStreak > 0 ? `🔥 ${bestStreak}` : "—"}
              <span className="mt-0.5 block text-[10px] text-[var(--faint)]">days in a row</span>
            </Highlight>

            <Highlight label="Best game">
              {formatScore(stats?.best_score ?? null)}
              <span className="mt-0.5 block text-[10px] text-[var(--faint)]">lowest final score</span>
            </Highlight>
          </section>

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
                      <div className="w-full rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${(n / max) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--faint)]">{TIER_LABEL[t]}</p>
                    <p className="text-[10px] font-semibold text-[var(--muted)]">{n}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Record line */}
          <section className="rounded-2xl bg-[var(--panel)] p-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Record</span>
              <span className="font-semibold text-[var(--heading)]">
                {stats?.games_won ?? 0}W / {(stats?.games_played ?? 0) - (stats?.games_won ?? 0)}L
                {winRate !== null && <span className="text-[var(--faint)]"> · {winRate}%</span>}
              </span>
            </div>
            <Link
              href="/stats"
              className="mt-3 block rounded-lg border border-[var(--border)] px-4 py-2 text-center text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              Full stats & game history
            </Link>
          </section>
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
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
