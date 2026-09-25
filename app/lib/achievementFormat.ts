import { AchievementInstance } from "@/achievements";
import type { TranslationKey } from "./i18n/keys";
import type { Vars } from "./i18n/LocaleProvider";

// Shared between the Achievements page (browsing every tier) and
// RoundSummary's "unlocked this round" notification (showing just the tier
// that fired) — one place for this phrasing so an achievement's requirement
// always reads identically wherever it's shown.

type T = (key: TranslationKey, vars?: Vars) => string;

function formatAchievementValue(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

/** "42 / 75 books melded" for a normal climbing counter, but "Best: 12
 * (goal: 15 or lower)" for a lower-is-better one — "12 / 15" would read
 * backwards there, like barely-started progress instead of already cleared. */
export function formatAchievementProgress(a: AchievementInstance, t: T): string {
  const unit = t(a.unitKey as TranslationKey);
  if (a.lowerIsBetter) {
    return t("achievement.progress.lowerIsBetter", {
      value: formatAchievementValue(a.value),
      threshold: a.threshold,
      unit,
    });
  }
  return t("achievement.progress.climbing", {
    value: formatAchievementValue(a.value),
    threshold: a.threshold,
    unit,
  });
}
