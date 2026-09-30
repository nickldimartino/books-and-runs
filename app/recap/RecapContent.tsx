"use client";

// "Your Recap" — audit finding: "No moment that adds up what a player has
// actually done." Everything here is re-presentation of data the app
// already trusts and already fetches elsewhere (PlayerLevelContext's
// loadAchievementProgressState — player_stats/achievement_counters/MP
// stats, all server-verified, never client-writable) plus two small extra
// reads (profiles.created_at for "member since", leaderboard_entries for
// best streaks/MP rating) — no new tables, no new server-side surface.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { allAchievements, MP_WIN_RATE_MIN_GAMES } from "@/achievements";
import { useAuth } from "../AuthContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { formatWinRate, TOTAL_ACHIEVEMENTS } from "../lib/profileShareCard";
import { supabase } from "../lib/supabaseClient";

interface Extras {
  memberSince: string | null;
  dailyBestStreak: number;
  weeklyBestStreak: number;
  mpRating: number | null;
  mpRatedGames: number;
}

const EMPTY_EXTRAS: Extras = { memberSince: null, dailyBestStreak: 0, weeklyBestStreak: 0, mpRating: null, mpRatedGames: 0 };

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-3 text-center">
      <p className="text-xl font-bold tabular-nums text-[var(--heading)]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
    </div>
  );
}

function Section({ title, children, cols = 4 }: { title: string; children: ReactNode; cols?: 2 | 4 }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{title}</h2>
      <div className={`grid grid-cols-2 gap-2 ${cols === 4 ? "sm:grid-cols-4" : ""}`}>{children}</div>
    </section>
  );
}

// unit-only labels ("books melded", "wilds drawn") already translated in
// every locale for the Achievements page — reused here rather than writing
// a second, near-identical set of copy for the same four counters.
const FUN_FACTS: { counter: string; labelKey: TranslationKey }[] = [
  { counter: "books_melded", labelKey: "achievementFamily.booksMelded.unit" },
  { counter: "runs_melded", labelKey: "achievementFamily.runsMelded.unit" },
  { counter: "wilds_drawn", labelKey: "achievementFamily.wildsDrawn.unit" },
  { counter: "jokers_drawn", labelKey: "achievementFamily.jokersDrawn.unit" },
];

export function RecapContent() {
  const { t, locale } = useT();
  const { configured, loading: authLoading, user } = useAuth();
  const signedIn = configured && !!user;
  const { level, progress, loading } = usePlayerLevel();
  const [extras, setExtras] = useState<Extras>(EMPTY_EXTRAS);

  useEffect(() => {
    if (!supabase || !user) {
      setExtras(EMPTY_EXTRAS);
      return;
    }
    const client = supabase;
    const userId = user.id;
    Promise.all([
      client.from("profiles").select("created_at").eq("id", userId).maybeSingle<{ created_at: string }>(),
      client
        .from("leaderboard_entries")
        .select("daily_deal_best_streak, weekly_challenge_best_streak, mp_rating, mp_rated_games")
        .eq("user_id", userId)
        .maybeSingle<{
          daily_deal_best_streak: number | null;
          weekly_challenge_best_streak: number | null;
          mp_rating: number | null;
          mp_rated_games: number | null;
        }>(),
    ]).then(([profileRes, entryRes]) => {
      setExtras({
        memberSince: profileRes.data?.created_at ?? null,
        dailyBestStreak: entryRes.data?.daily_deal_best_streak ?? 0,
        weeklyBestStreak: entryRes.data?.weekly_challenge_best_streak ?? 0,
        mpRating: entryRes.data?.mp_rating ?? null,
        mpRatedGames: entryRes.data?.mp_rated_games ?? 0,
      });
    });
  }, [user]);

  if (!authLoading && !signedIn) {
    return <CenteredMessage title={t("recap.signIn.title")} body={t("recap.signIn.body")} signIn />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/progress" smart />

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("recap.title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("recap.subtitle")}</p>
        {extras.memberSince && (
          <p className="mt-1 text-xs text-[var(--faint)]">
            {t("recap.memberSince", { date: new Date(extras.memberSince).toLocaleDateString(locale, { month: "long", year: "numeric" }) })}
          </p>
        )}
      </div>

      {authLoading || loading || !progress || !level ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="rounded-2xl bg-[var(--accent)]/10 p-5 text-center">
            <p className="text-xs uppercase tracking-wide text-[var(--faint)]">{t("recap.levelLine", { level: level.level })}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--heading)]">{t("recap.xpLine", { xp: level.totalXp })}</p>
          </div>

          {progress.gamesPlayed === 0 && progress.mpGamesPlayed === 0 ? (
            <p className="text-center text-sm text-[var(--muted)]">{t("recap.empty")}</p>
          ) : (
            <>
              <Section title={t("recap.section.overview")}>
                <StatTile value={progress.gamesPlayed} label={t("recap.stat.gamesPlayed")} />
                <StatTile value={formatWinRate(progress.gamesPlayed, progress.gamesWon)} label={t("recap.stat.winRate")} />
                <StatTile value={progress.bestScore ?? "—"} label={t("recap.stat.bestScore")} />
                <StatTile
                  value={`${allAchievements(progress).filter((a) => a.unlocked).length}/${TOTAL_ACHIEVEMENTS}`}
                  label={t("recap.stat.achievements")}
                />
              </Section>

              {progress.mpGamesPlayed > 0 && (
                <Section title={t("recap.section.multiplayer")}>
                  <StatTile value={progress.mpGamesPlayed} label={t("recap.stat.mpGamesPlayed")} />
                  <StatTile
                    value={
                      progress.mpGamesPlayed >= MP_WIN_RATE_MIN_GAMES
                        ? `${Math.round((100 * progress.mpGamesWon) / progress.mpGamesPlayed)}%`
                        : "—"
                    }
                    label={t("recap.stat.mpWinRate")}
                  />
                  <StatTile value={progress.mpBestWinStreak} label={t("recap.stat.mpBestWinStreak")} />
                  <StatTile
                    value={extras.mpRatedGames >= MP_WIN_RATE_MIN_GAMES && extras.mpRating != null ? extras.mpRating : "—"}
                    label={t("recap.stat.mpRating")}
                  />
                </Section>
              )}

              <Section title={t("recap.section.funFacts")}>
                {FUN_FACTS.map((f) => (
                  <StatTile key={f.counter} value={progress.counters[f.counter] ?? 0} label={t(f.labelKey)} />
                ))}
              </Section>

              {(extras.dailyBestStreak > 0 || extras.weeklyBestStreak > 0) && (
                <Section title={t("recap.section.streaks")} cols={2}>
                  <StatTile value={extras.dailyBestStreak} label={t("recap.stat.dailyBestStreak")} />
                  <StatTile value={extras.weeklyBestStreak} label={t("recap.stat.weeklyBestStreak")} />
                </Section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
