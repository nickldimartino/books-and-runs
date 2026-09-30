"use client";

// "Private — only you can see this": the old /stats page's own material,
// merged onto the profile page (see page.tsx's header doc) — level
// progress, highlights, wins-by-difficulty, multiplayer stats, achievement
// showcase, and game history. One job: render `usePlayerPrivateData`'s
// output; it owns no fetching of its own.

import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { LevelProgress } from "@/leveling";
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS, MP_WIN_RATE_MIN_GAMES, tierNumber } from "@/achievements";
import { AchievementIcon } from "../components/AchievementIcons";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import type { TranslationKey } from "../lib/i18n/keys";
import { useT } from "../lib/i18n/LocaleProvider";
import { formatScore } from "../lib/formatScore";
import { TOTAL_ACHIEVEMENTS } from "../lib/profileShareCard";
import { capitalize } from "../lib/text";
import { StatTile } from "./StatTile";
import { DIFFICULTIES, GameHistoryRow, PlayerPrivateData } from "./usePlayerPrivateData";

function Highlight({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--panel)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
      <div className="mt-1 text-sm font-semibold text-[var(--heading)]">{children}</div>
    </div>
  );
}

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

const PAST_GAMES_LIMIT = 10;

export function PlayerStatsSection({
  privateData,
  level,
  user,
  mpRating,
  mpRatedGames,
}: {
  privateData: PlayerPrivateData;
  level: LevelProgress | null;
  user: User | null;
  /** From this account's own leaderboard_entries row (page.tsx already has
   * it loaded) — not part of privateData/mpStats since it comes from
   * mp_my_stats() (migration 0011), a separate RPC that predates rating
   * (0097) and has no reason to be extended just for this. */
  mpRating: number;
  mpRatedGames: number;
}) {
  const { t, tPlural, locale } = useT();
  const {
    privateLoading,
    privateStatsError,
    privateStats,
    closestAchievement,
    rarest,
    toughestBeaten,
    dailyDealBestStreak,
    mpStats,
    unlocked,
    masteredFamilies,
    unlockedByTier,
    history,
    mpHistory,
  } = privateData;

  return (
    <>
      <div className="flex items-center gap-3 border-t border-[var(--border)] pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.activity.heading")}</h2>
        <span className="text-[10px] text-[var(--faint)]">{t("player.activity.privacyNote")}</span>
      </div>

      {privateLoading ? (
        <LoadingSpinner />
      ) : privateStatsError ? (
        <p className="text-sm text-[var(--danger)]">{t("player.stats.loadError")}</p>
      ) : privateStats ? (
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
              <p className="text-xs uppercase tracking-wide text-[var(--faint)]">{t("player.level.progress")}</p>
              {level && (
                <p className="text-xs text-[var(--faint)]">
                  {t("player.level.xpProgress", {
                    into: level.xpIntoLevel,
                    span: level.xpSpanForLevel,
                    next: level.level + 1,
                    total: level.totalXp,
                  })}
                </p>
              )}
            </div>
          </section>

          {/* Closest goal — same nudge Home shows on its own card,
              surfaced here too since a profile visit is exactly
              the moment to see what's next. */}
          {closestAchievement && (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
              <div className="flex items-center gap-3">
                <AchievementIcon
                  category={closestAchievement.category}
                  className="h-6 w-6 shrink-0 text-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--heading)]">
                    {t("player.closestGoal.progress", {
                      pct: Math.round(closestAchievement.progressFraction * 100),
                      tier: capitalize(t(`common.difficulty.${closestAchievement.tier}` as TranslationKey)),
                      family: t(closestAchievement.familyTitleKey as TranslationKey),
                    })}
                  </p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${Math.round(closestAchievement.progressFraction * 100)}%` }}
                    />
                  </div>
                </div>
                <Link href="/achievements" className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline">
                  {t("player.closestGoal.view")}
                </Link>
              </div>
            </section>
          )}

          {/* Highlights */}
          <section className="grid grid-cols-2 gap-3">
            <Highlight label={t("player.highlights.rarestUnlock")}>
              {rarest ? (
                <span className="flex items-center gap-1.5">
                  <AchievementIcon category={rarest.category} className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">
                    {t(rarest.familyTitleKey as TranslationKey)} {tierNumber(rarest.tier)}
                  </span>
                </span>
              ) : (
                "—"
              )}
              <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                {rarest
                  ? t("player.highlights.tierSuffix", { tier: capitalize(t(`common.difficulty.${rarest.tier}` as TranslationKey)) })
                  : t("player.highlights.nothingUnlocked")}
              </span>
            </Highlight>
            <Highlight label={t("player.highlights.toughestAiBeaten")}>
              <span className="capitalize">{toughestBeaten ? t(`common.difficulty.${toughestBeaten}` as TranslationKey) : "—"}</span>
              <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                {toughestBeaten
                  ? tPlural("player.highlights.wins", privateStats.wins_by_difficulty?.[toughestBeaten] ?? 0, {
                      count: privateStats.wins_by_difficulty?.[toughestBeaten] ?? 0,
                    })
                  : t("player.highlights.noWinsRecorded")}
              </span>
            </Highlight>
            <Highlight label={t("player.highlights.bestDailyStreak")}>
              {(dailyDealBestStreak ?? 0) > 0 ? `🔥 ${dailyDealBestStreak}` : "—"}
              <span className="mt-0.5 block text-[10px] text-[var(--faint)]">{t("player.highlights.daysInARow")}</span>
            </Highlight>
            <Highlight label={t("player.highlights.bestGame")}>
              {formatScore(privateStats.best_score)}
              <span className="mt-0.5 block text-[10px] text-[var(--faint)]">{t("player.highlights.lowestFinalScore")}</span>
            </Highlight>
          </section>

          {/* The two figures not already shown in the public tiles above
              (which cover games played/win rate/avg/worst already). */}
          <section className="grid grid-cols-2 gap-3">
            <StatTile label={t("player.stats.gamesWon")} value={privateStats.games_won} />
            <StatTile label={t("player.stats.gamesTied")} value={privateStats.games_tied} sub={t("player.stats.rareResult")} />
          </section>

          {/* Wins by difficulty */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("player.winsByDifficulty.heading")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <div key={d} className="rounded-lg bg-[var(--panel)] px-3 py-2 text-center text-sm capitalize">
                  <div className="font-semibold text-[var(--heading)]">{privateStats.wins_by_difficulty[d] ?? 0}</div>
                  <div className="text-xs text-[var(--faint)]">{t(`common.difficulty.${d}` as TranslationKey)}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Multiplayer — vs. real people only (these games also feed
              the overall stats above). */}
          {mpStats && mpStats.played > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("player.multiplayerStats.heading")}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <StatTile label={t("player.stats.played")} value={mpStats.played} />
                <StatTile
                  label={t("player.stats.winStreak")}
                  value={mpStats.currentWinStreak}
                  sub={mpStats.bestWinStreak > 0 ? t("player.stats.bestStreakSub", { count: mpStats.bestWinStreak }) : undefined}
                />
                <StatTile label={t("player.stats.podiumFinishes")} value={mpStats.podiums} sub={t("player.stats.topHalfOfTable")} />
                {mpStats.biggestTableBeaten > 0 && (
                  <StatTile
                    label={t("player.stats.biggestTableWon")}
                    value={t("player.stats.tableSizeAbbr", { count: mpStats.biggestTableBeaten })}
                  />
                )}
                {/* Same "not meaningful yet" gate the Leaderboard and Recap
                    already use — a rating from fewer than 6 rated games
                    swings too hard on one result to show as your number. */}
                {mpRatedGames >= MP_WIN_RATE_MIN_GAMES && (
                  <StatTile label={t("player.stats.rating")} value={mpRating} />
                )}
              </div>
            </section>
          )}

          {/* Achievement showcase */}
          <section className="rounded-2xl bg-[var(--panel)] p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[var(--heading)]">{t("player.stats.achievements")}</h2>
              <Link href="/achievements" className="text-xs font-medium text-[var(--accent)] hover:underline">
                {t("player.achievements.viewAll")}
              </Link>
            </div>
            <p className="mt-1 text-2xl font-extrabold text-[var(--heading)]">
              {unlocked.length}
              <span className="text-base font-medium text-[var(--faint)]"> / {TOTAL_ACHIEVEMENTS}</span>
            </p>
            <p className="text-xs text-[var(--faint)]">
              {t("player.achievements.familiesMastered", { count: masteredFamilies, total: ACHIEVEMENT_FAMILIES.length })}
            </p>
            <div className="mt-3 flex gap-1.5">
              {ACHIEVEMENT_TIERS.map((tier) => {
                const n = unlockedByTier[tier];
                const max = ACHIEVEMENT_FAMILIES.length;
                return (
                  <div key={tier} className="flex-1 text-center">
                    <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-[var(--panel-soft)]">
                      <div className="w-full rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${(n / max) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--faint)]">{capitalize(t(`common.difficulty.${tier}` as TranslationKey))}</p>
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
                {t("player.pastGames.heading")}
                <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">
                  {t("player.pastGames.lastN", { count: Math.min(history.length, PAST_GAMES_LIMIT) })}
                </span>
              </span>
              <span aria-hidden="true" className="text-[var(--faint)] transition group-open:rotate-180">
                ▼
              </span>
            </summary>
            {history.length === 0 ? (
              <div className="border-t border-[var(--border)] p-3">
                <EmptyState icon="🎲">{t("player.pastGames.empty")}</EmptyState>
              </div>
            ) : (
              <ul className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
                {history.map((g) => {
                  const yourScore = yourScoreFor(g);
                  const wonOrTied = yourScore !== null && g.winner_score != null && yourScore === g.winner_score;
                  return (
                    <li key={g.id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${wonOrTied ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                          {t("player.pastGames.winner", { name: g.winner })}
                          {g.winner_score != null && (
                            <span className={`font-normal ${wonOrTied ? "" : "text-[var(--faint)]"}`}> ({t("game.hand.pts", { count: g.winner_score })})</span>
                          )}
                        </span>
                        <span className="text-xs text-[var(--faint)]">
                          {new Date(g.played_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                      {yourScore !== null && !wonOrTied && (
                        <p className="mt-0.5 text-xs text-[var(--muted)]">{t("player.pastGames.yourScore", { score: yourScore })}</p>
                      )}
                      <p className="mt-1 text-xs text-[var(--faint)]">{t("player.pastGames.vs", { names: g.opponents.map((o) => o.name).join(", ") })}</p>
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
                  {t("player.pastGames.mpHeading")}
                  <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">{t("player.pastGames.lastN", { count: mpHistory.length })}</span>
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
                    ? mg.seats.find((s) => s.userId === mg.winner_user_id)?.name ?? t("multiplayer.someone")
                    : t("player.pastGames.anAi");
                  const won = mg.your_outcome === "won";
                  return (
                    <li key={mg.game_id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${won ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                          {won
                            ? t("player.pastGames.youWon")
                            : mg.your_outcome === "resigned"
                              ? t("player.pastGames.youLeft")
                              : t("player.pastGames.lostTo", { winner: winnerName })}
                        </span>
                        <span className="text-xs text-[var(--faint)]">
                          {mg.completed_at ? new Date(mg.completed_at).toLocaleDateString(locale, { dateStyle: "medium" }) : ""}
                        </span>
                      </div>
                      {myScore != null && <p className="mt-0.5 text-xs text-[var(--muted)]">{t("player.pastGames.yourScore", { score: myScore })}</p>}
                      <p className="mt-1 text-xs text-[var(--faint)]">
                        {t("player.pastGames.vs", { names: mg.seats.filter((s) => s.userId !== user?.id).map((s) => s.name).join(", ") })}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      ) : (
        <EmptyState
          icon="📊"
          action={
            <Link href="/new-game" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]">
              {t("home.newGame")}
            </Link>
          }
        >
          {t("player.noGames.body")}
        </EmptyState>
      )}
    </>
  );
}
