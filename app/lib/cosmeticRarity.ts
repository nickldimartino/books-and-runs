// The visual-weight tier for a cosmetic — badge, avatar frame, title, or
// banner. Purely a rendering concern, orthogonal to CosmeticUnlockRule
// (which decides WHETHER something's earned) and to an item's own display
// name (Eclipse, Nova, Aurora Crown, ... stay exactly as flavorful as
// they've always been — rarity never becomes a player-facing label). What
// it drives: how much visual complexity an item gets, via the shared CSS
// classes in RARITY_VISUAL, so "this is the hardest thing in the game"
// reads at a glance from the shape/motion alone, not just a brighter color.
//
// Every gated-cosmetic catalog (avatarPresets.ts's PREMIUM_EMOJI_OPTIONS,
// profileCosmetics.ts's AVATAR_FRAME_OPTIONS/TITLE_OPTIONS,
// bannerPresets.ts's BANNER_OPTIONS) carries an optional `rarity` field —
// absent means "derive it from the unlock rule" via defaultRarityForUnlock,
// the same "absent = sensible default" convention `unlock` itself already
// uses. Only items that need to diverge from that default (grandmaster,
// every boutique item) set it explicitly.

import { CosmeticUnlockRule } from "./cosmeticUnlocks";

export type CosmeticRarity = "common" | "uncommon" | "rare" | "epic" | "mythic" | "apex";

export const RARITY_ORDER: readonly CosmeticRarity[] = ["common", "uncommon", "rare", "epic", "mythic", "apex"];

export interface RarityVisual {
  /** Applied to whatever renders the item's own art (a frame's ring, a
   * banner's swatch, a badge's icon wrapper). */
  ringClass: string;
  /** No sweep at all for common/uncommon/rare — motion is itself part of
   * the escalation, not just added everywhere. */
  foilDuration: string | null;
  foilOpacity: string | null;
}

export const RARITY_VISUAL: Record<CosmeticRarity, RarityVisual> = {
  common: { ringClass: "rarity-ring--common", foilDuration: null, foilOpacity: null },
  uncommon: { ringClass: "rarity-ring--uncommon", foilDuration: null, foilOpacity: null },
  rare: { ringClass: "rarity-ring--rare", foilDuration: null, foilOpacity: null },
  epic: { ringClass: "rarity-ring--epic", foilDuration: "3.2s", foilOpacity: "0.55" },
  mythic: { ringClass: "rarity-ring--mythic", foilDuration: "4.2s", foilOpacity: "0.7" },
  apex: { ringClass: "rarity-ring--apex", foilDuration: "5s", foilOpacity: "0.75" },
};

/** Whichever CSS custom properties a rarity's foil sweep needs — spread
 * onto the element's inline `style` alongside RARITY_VISUAL's className, so
 * globals.css's one shared `.foil-sweep` keyframe can serve every tier
 * instead of three near-duplicate animation blocks. */
export function rarityFoilStyleVars(rarity: CosmeticRarity): Record<string, string> {
  const v = RARITY_VISUAL[rarity];
  const vars: Record<string, string> = {};
  if (v.foilDuration) vars["--foil-duration"] = v.foilDuration;
  if (v.foilOpacity) vars["--foil-opacity"] = v.foilOpacity;
  return vars;
}

export function rarityHasFoil(rarity: CosmeticRarity): boolean {
  return RARITY_VISUAL[rarity].foilDuration !== null;
}

/** The rarity an item gets when its catalog entry doesn't set one
 * explicitly — a reasonable read of "how hard is this rule to satisfy," so
 * every one of the ~90 existing items gets a sane tier for free just by
 * keeping their current `unlock` rule; only the handful that should read
 * differently (grandmaster chief among them) need an explicit override. */
export function defaultRarityForUnlock(rule: CosmeticUnlockRule | undefined): CosmeticRarity {
  if (!rule) return "common";
  switch (rule.kind) {
    case "level":
      if (rule.level <= 10) return "uncommon";
      if (rule.level <= 50) return "rare";
      if (rule.level <= 150) return "epic";
      return "mythic";
    case "categoryMastered":
      return "rare";
    case "categoriesMasteredCount":
      return rule.count >= 6 ? "mythic" : "epic";
    case "allCategoriesMastered":
      return "mythic";
    case "gamesPlayed":
      return rule.count >= 500 ? "epic" : rule.count >= 100 ? "rare" : "uncommon";
    case "dailyDealStreak":
      return rule.days >= 30 ? "mythic" : rule.days >= 7 ? "uncommon" : "common";
    case "weeklyChallengeStreak":
      return rule.weeks >= 12 ? "mythic" : rule.weeks >= 4 ? "rare" : "uncommon";
    case "complete":
      return "apex";
    case "creatorOnly":
    case "supporterOnly":
      return "rare";
  }
}
