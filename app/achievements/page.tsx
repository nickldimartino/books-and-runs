"use client";

// The Achievements browser: all 48 families × 5 tiers, grouped by category,
// each showing current value vs. the tier threshold and unlocked state.
// Pure display over `allAchievements(progress)` — the progress object is
// assembled from Supabase by loadAchievementProgressState (+ getMyMpStats).

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { supabase } from "../lib/supabaseClient";
import { AchievementIcon } from "../components/AchievementIcons";
import { BackLink, BottomBackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { formatAchievementProgress } from "../lib/achievementFormat";
import { EMPTY_MP_STATS, getMyMpStats } from "../lib/mpStore";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import type { Vars } from "../lib/i18n/LocaleProvider";
import { capitalize } from "../lib/text";
import {
  ACHIEVEMENT_FAMILIES,
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

type T = (key: TranslationKey, vars?: Vars) => string;

function tierLabel(tier: AchievementTier, t: T): string {
  return capitalize(t(`common.difficulty.${tier}` as TranslationKey));
}

export default function AchievementsPage() {
  const { t } = useT();
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
      getMyMpStats(supabase).catch(() => ({ ...EMPTY_MP_STATS })),
    ]).then(([statsRes, countersRes, mpStats]) => {
      setProgress({
        counters: countersRes.data?.counters ?? {},
        gamesPlayed: statsRes.data?.games_played ?? 0,
        gamesWon: statsRes.data?.games_won ?? 0,
        bestScore: statsRes.data?.best_score ?? null,
        winsByDifficulty: statsRes.data?.wins_by_difficulty ?? {},
        mpGamesPlayed: mpStats.played,
        mpGamesWon: mpStats.won,
        mpBestWinStreak: mpStats.bestWinStreak,
      });
      setLoading(false);
    });
  }, [user]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlockedCount = useMemo(() => achievements.filter((a) => a.unlocked).length, [achievements]);
  // Independent of statusFilter/tierFilter on purpose — a top-level summary
  // stat should reflect the true total, not whatever's currently filtered.
  const masteredFamilyCount = useMemo(() => {
    const unlockedPerFamily = new Map<string, number>();
    for (const a of achievements) {
      if (a.unlocked) unlockedPerFamily.set(a.familyId, (unlockedPerFamily.get(a.familyId) ?? 0) + 1);
    }
    return [...unlockedPerFamily.values()].filter((count) => count === ACHIEVEMENT_TIERS.length).length;
  }, [achievements]);

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
      <CenteredMessage
        title={t("achievementsPage.notConfigured.title")}
        body={t("achievementsPage.notConfigured.body")}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/progress" smart />

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("home.progressTile.achievements")}</h1>
        {!authLoading && !loading && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("achievementsPage.summary.unlocked", { count: unlockedCount, total: achievements.length })}
            {masteredFamilyCount > 0 &&
              ` · ${t("achievementsPage.summary.familiesMastered", {
                count: masteredFamilyCount,
                total: ACHIEVEMENT_FAMILIES.length,
              })}`}
          </p>
        )}
      </div>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* The catalog below (48 families × 5 tiers) isn't personal data —
              showing it to a guest, all locked, previews what's worth
              playing for instead of a dead-end "sign in to see this" wall.
              Only the tracking is account-bound. */}
          {configured && !user && (
            <section className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3">
              <p className="text-xs text-[var(--muted)]">
                {t("achievementsPage.guestPrompt")}
              </p>
              <Link
                href="/sign-in"
                className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
              >
                {t("signIn.title")}
              </Link>
            </section>
          )}

          <PageTip id="achievements" title={t("achievementsPage.tip.title")}>
            {t("achievementsPage.tip.body")}
          </PageTip>

          <section className="flex flex-col gap-3 rounded-xl bg-[var(--panel-soft)] p-3">
            <div className="flex flex-wrap gap-2">
              {([
                ["all", t("achievementsPage.filter.all")],
                ["unlocked", t("achievementsPage.filter.completed")],
                ["locked", t("achievementsPage.filter.notCompleted")],
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
                {t("achievementsPage.filter.allTiers")}
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
                  {tierLabel(tier, t)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[var(--muted)]">{t("achievementsPage.sort.label")}</label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-md bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              >
                <option value="default">{t("achievementsPage.sort.default")}</option>
                <option value="closest">{t("achievementsPage.sort.closest")}</option>
              </select>
            </div>
          </section>

          {visible.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">{t("achievementsPage.emptyFiltered")}</p>
          ) : sortMode === "closest" ? (
            // "Closest to completion" is inherently a flat ranking across
            // every family at once — grouping by family here would scatter
            // the very thing this sort mode exists to surface, so it keeps
            // the original one-row-per-tier list instead of the grouped view
            // below.
            <ul className="flex flex-col gap-2">
              {visible.map((a) => (
                <AchievementCard key={`${a.familyId}-${a.tier}`} achievement={a} />
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2">
              {groupByFamily(visible).map((tiers) => (
                <FamilyAchievementGroup key={tiers[0].familyId} tiers={tiers} />
              ))}
            </ul>
          )}
        </>
      )}

      <BottomBackLink fallback="/progress" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]" />
    </main>
  );
}

/** The progress line shown under a tier: the raw "current / threshold"
 * fraction is only actually informative for a tier you haven't cleared yet
 * — once unlocked, showing e.g. "67 / 1 books melded" or "67 / 10 books
 * melded" for every already-cleared tier in a family just repeats the same
 * climbing counter against thresholds you passed a while ago, over and
 * over. A cleared tier says so instead; formatAchievementProgress's real
 * fraction is reserved for the ones you're still working toward. (Not
 * shared into achievementFormat.ts itself — Home's "closest achievement"
 * tile and AchievementUnlock.tsx's just-unlocked toast both have their own
 * reasons to keep showing the real number even for an unlocked instance.) */
function progressLine(achievement: AchievementInstance, t: T): string {
  return achievement.unlocked ? t("achievementsPage.tierUnlocked") : formatAchievementProgress(achievement, t);
}

function cardClassName(unlocked: boolean): string {
  return `rounded-lg border px-4 py-3 ${
    unlocked ? "border-[var(--accent)]/50 bg-[var(--accent)]/10" : "border-[var(--border)] bg-[var(--panel)]"
  }`;
}

/** The actual card content, with no li/div wrapper of its own — reused both
 * standalone (AchievementCard, one <li> per tier) and nested inside an
 * expanded FamilyAchievementGroup, where each tier is a <div> instead (an
 * <li> isn't valid there — it's already inside one, not a direct child of a
 * <ul>). `compact` drops the family title/icon row (already shown once, on
 * the group's own header) down to just the tier badge, for those nested rows. */
function AchievementCardContent({ achievement, compact }: { achievement: AchievementInstance; compact?: boolean }) {
  const { t } = useT();
  const pct = Math.round(achievement.progressFraction * 100);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        {compact ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {achievement.unlocked ? "✓ " : ""}
            {tierLabel(achievement.tier, t)}
          </span>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--heading)]">
              <AchievementIcon
                category={achievement.category}
                className={`h-5 w-5 shrink-0 ${achievement.unlocked ? "text-[var(--accent)]" : "text-[var(--faint)]"}`}
              />
              <span className="truncate">
                {achievement.unlocked ? "✓ " : ""}
                {t(achievement.familyTitleKey as TranslationKey)}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--panel-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {tierLabel(achievement.tier, t)}
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--faint)]">{progressLine(achievement, t)}</p>
      {!achievement.unlocked && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
  );
}

function AchievementCard({ achievement }: { achievement: AchievementInstance }) {
  return (
    <li className={cardClassName(achievement.unlocked)}>
      <AchievementCardContent achievement={achievement} />
    </li>
  );
}

/** Same family, one entry per tier that survived the current status/tier
 * filters — Map preserves first-insertion order, which for the unfiltered
 * "default order" sort already matches ACHIEVEMENT_FAMILIES' own order, so
 * no extra sort is needed here. */
function groupByFamily(list: AchievementInstance[]): AchievementInstance[][] {
  const map = new Map<string, AchievementInstance[]>();
  for (const a of list) {
    if (!map.has(a.familyId)) map.set(a.familyId, []);
    map.get(a.familyId)!.push(a);
  }
  return [...map.values()];
}

/** Which tier to show on a family's collapsed summary row: the highest tier
 * actually unlocked (the most impressive true thing about this family right
 * now), or — if none yet — whichever tier is closest to unlocking, so the
 * summary always shows genuinely useful progress instead of always defaulting
 * to Beginner. */
function pickHeadlineTier(tiers: AchievementInstance[]): AchievementInstance {
  const unlocked = tiers.filter((t) => t.unlocked);
  if (unlocked.length > 0) return unlocked[unlocked.length - 1];
  return [...tiers].sort((a, b) => b.progressFraction - a.progressFraction)[0];
}

/**
 * One family's achievements, collapsed to a single summary row by default —
 * this is what turns a flat 200-row list (40 families × 5 tiers) into 40
 * scannable rows, expandable one at a time for the full tier breakdown. A
 * family reduced to exactly one surviving tier (typically because a specific
 * tier filter is active) skips the expand/collapse shell entirely — nothing
 * to collapse — and renders as a plain AchievementCard instead.
 */
function FamilyAchievementGroup({ tiers }: { tiers: AchievementInstance[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (tiers.length === 0) return null;
  if (tiers.length === 1) return <AchievementCard achievement={tiers[0]} />;

  const headline = pickHeadlineTier(tiers);
  const unlockedCount = tiers.filter((t) => t.unlocked).length;
  // True only when all 5 of this family's tiers are unlocked — not merely
  // every tier currently passing the status/tier filters (unlockedCount is
  // always the real, filter-independent count: the "unlocked" status filter
  // can only ever narrow tiers down to exactly the ones already unlocked,
  // never inflate this, and the family-group shell above already bypasses
  // itself down to a plain AchievementCard whenever a tier filter leaves
  // just one tier visible — so this can't misfire in either direction).
  const isMastered = unlockedCount === ACHIEVEMENT_TIERS.length;

  return (
    <li
      className={
        isMastered
          ? "rounded-lg border border-[var(--accent)] bg-[var(--accent)]/20 px-4 py-3 ring-1 ring-[var(--accent)]/60"
          : cardClassName(headline.unlocked)
      }
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--heading)]">
          {isMastered ? (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]"
              title={t("achievementsPage.masteredTooltip")}
            >
              <AchievementIcon category={headline.category} className="h-4 w-4 text-[var(--on-accent)]" />
            </span>
          ) : (
            <AchievementIcon
              category={headline.category}
              className={`h-5 w-5 shrink-0 ${headline.unlocked ? "text-[var(--accent)]" : "text-[var(--faint)]"}`}
            />
          )}
          <span className="truncate">{t(headline.familyTitleKey as TranslationKey)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isMastered ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)]"
            }`}
          >
            {isMastered
              ? `★ ${t("achievementsPage.masteredBadge")}`
              : t("achievementsPage.tiersCount", { count: unlockedCount, total: tiers.length })}
          </span>
          <span className="text-xs text-[var(--faint)]">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      <p className="mt-1 text-xs text-[var(--faint)]">
        {isMastered
          ? t("achievementsPage.allTiersUnlocked", { count: ACHIEVEMENT_TIERS.length })
          : headline.unlocked
            ? t("achievementsPage.tierUnlockedLine", { tier: tierLabel(headline.tier, t) })
            : t("achievementsPage.tierProgressLine", {
                tier: tierLabel(headline.tier, t),
                progress: formatAchievementProgress(headline, t),
              })}
      </p>
      {!headline.unlocked && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${Math.round(headline.progressFraction * 100)}%` }}
          />
        </div>
      )}
      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
          {tiers.map((t) => (
            <div key={t.tier} className={cardClassName(t.unlocked)}>
              <AchievementCardContent achievement={t} compact />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
