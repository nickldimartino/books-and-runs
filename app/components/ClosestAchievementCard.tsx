"use client";

// "You're 80% of the way to Hard · Bookkeeper": the single locked achievement
// the account is furthest along toward, linking into the Achievements page.
// Lives on the Progress hub (it used to sit on Home).

import Link from "next/link";
import { AchievementInstance, allAchievements, AchievementProgressState } from "@/achievements";
import { formatAchievementProgress } from "../lib/achievementFormat";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { capitalize } from "../lib/text";

/** The single locked achievement the account is furthest along toward — the
 * one worth one more game to finish. Ignores anything not started (fraction
 * 0) so this never nudges toward something the player has shown no interest
 * in, and anything already at 100% waiting on a stat refresh. */
export function closestAchievement(progress: AchievementProgressState | null): AchievementInstance | null {
  if (!progress) return null;
  return (
    allAchievements(progress)
      .filter((a) => !a.unlocked && a.progressFraction > 0 && a.progressFraction < 1)
      .sort((a, b) => b.progressFraction - a.progressFraction)[0] ?? null
  );
}

/** A compact "you're 80% of the way to Hard · Bookkeeper" card on Home,
 * linking into the Achievements page for the full picture. Rendered only
 * when signed in and there's a partly-finished achievement to point at. */
export function ClosestAchievementCard({ achievement }: { achievement: AchievementInstance }) {
  const { t } = useT();
  const pct = Math.round(achievement.progressFraction * 100);
  return (
    <Link
      href="/achievements"
      className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)]">
          {t("home.closestAchievement")}
        </p>
        <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{pct}%</span>
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold text-[var(--heading)]">
        {capitalize(t(`common.difficulty.${achievement.tier}` as TranslationKey))} ·{" "}
        {t(achievement.familyTitleKey as TranslationKey)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--faint)]">{formatAchievementProgress(achievement, t)}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

