// Shared unlock-requirement logic for every gated cosmetic — premium
// avatar emoji, avatar frames, and nameplate titles (see avatarPresets.ts
// and profileCosmetics.ts for each catalog). A rule is satisfied by either
// a level milestone, fully mastering one achievement category, or fully
// mastering all of them — computed client-side from the same
// AchievementProgressState the Achievements page already uses, so this
// reads as one consistent unlock system rather than three hand-tuned
// copies of "what counts as earned."
//
// Mirrors, but isn't the source of truth for, migration 0028's
// cosmetic_unlocks table — that's what actually decides on save (see
// leaderboardStore.ts's CosmeticLockedError). Keep both in sync if a
// requirement or a cosmetic option ever changes.

import { AchievementCategory, AchievementProgressState, allAchievements } from "@/achievements";

export type CosmeticUnlockRule =
  | { kind: "level"; level: number }
  | { kind: "categoryMastered"; category: AchievementCategory; categoryLabel: string }
  | { kind: "allCategoriesMastered" };

function categoryMastered(progress: AchievementProgressState, category: AchievementCategory): boolean {
  const inCategory = allAchievements(progress).filter((a) => a.category === category);
  return inCategory.length > 0 && inCategory.every((a) => a.tier !== "expert" || a.unlocked);
}

export function isCosmeticUnlocked(
  rule: CosmeticUnlockRule,
  level: number,
  progress: AchievementProgressState
): boolean {
  if (rule.kind === "level") return level >= rule.level;
  if (rule.kind === "categoryMastered") return categoryMastered(progress, rule.category);
  const categories = new Set(allAchievements(progress).map((a) => a.category));
  for (const category of categories) {
    if (!categoryMastered(progress, category)) return false;
  }
  return categories.size > 0;
}

/** A short "how to unlock this" line for a locked cosmetic's tooltip. */
export function cosmeticRequirementLabel(rule: CosmeticUnlockRule): string {
  if (rule.kind === "level") return `Unlocks at Level ${rule.level}`;
  if (rule.kind === "categoryMastered") return `Master every ${rule.categoryLabel} achievement`;
  return "Master every achievement category";
}
