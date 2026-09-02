import { AchievementInstance } from "@/achievements";

// Shared between the Achievements page (browsing every tier) and
// RoundSummary's "unlocked this round" notification (showing just the tier
// that fired) — one place for this phrasing so an achievement's requirement
// always reads identically wherever it's shown.

export function formatAchievementValue(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

/** "42 / 75 books melded" for a normal climbing counter, but "Best: 12
 * (goal: 15 or lower)" for a lower-is-better one — "12 / 15" would read
 * backwards there, like barely-started progress instead of already cleared. */
export function formatAchievementProgress(a: AchievementInstance): string {
  if (a.lowerIsBetter) {
    return `Best: ${formatAchievementValue(a.value)} (goal: ${a.threshold} or lower ${a.unit})`;
  }
  return `${formatAchievementValue(a.value)} / ${a.threshold} ${a.unit}`;
}
