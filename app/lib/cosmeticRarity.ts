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

interface RarityVisual {
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

export function rarityHasFoil(rarity: CosmeticRarity): boolean {
  return RARITY_VISUAL[rarity].foilDuration !== null;
}

/** A title has no art to put a ring/foil on — just text — so its rarity
 * treatment is a border + text color instead (Title tab, player/page.tsx).
 * common/uncommon/rare stay the plain default border every free pill
 * already uses (falsy = "render it exactly like today"); only epic and
 * above get a color, same "motion/color is earned, not default" principle
 * as RARITY_VISUAL's foil gating. */
export const RARITY_TEXT_ACCENT: Partial<Record<CosmeticRarity, string>> = {
  epic: "#a855f7",
  mythic: "#f5c518",
  apex: "#ec4899",
};

/** The rarity an item gets when its catalog entry doesn't set one
 * explicitly — a reasonable read of "how hard is this rule to satisfy," so
 * every one of the ~90 existing items gets a sane tier for free just by
 * keeping their current `unlock` rule; only the handful that should read
 * differently (grandmaster chief among them) need an explicit override. */
export function defaultRarityForUnlock(rule: CosmeticUnlockRule | undefined): CosmeticRarity {
  if (!rule) return "common";
  switch (rule.kind) {
    case "level":
      // 🥉10→uncommon, 🥈25→uncommon, 🥇50→rare, 💎100→rare, then epic up to
      // 150, mythic beyond — keeps every existing level-gated item's
      // rarity exactly where Phase 1's mapping put it.
      if (rule.level <= 25) return "uncommon";
      if (rule.level <= 100) return "rare";
      if (rule.level <= 150) return "epic";
      return "mythic";
    case "categoryMastered":
      return "rare";
    case "categoriesMasteredCount":
      if (rule.count >= 6) return "mythic";
      if (rule.count >= 3) return "epic";
      return "uncommon";
    case "allCategoriesMastered":
      return "mythic";
    case "gamesPlayed":
      if (rule.count >= 1500) return "mythic";
      if (rule.count >= 500) return "epic";
      if (rule.count >= 150) return "rare";
      return "uncommon";
    case "dailyDealStreak":
      return rule.days >= 30 ? "mythic" : rule.days >= 7 ? "uncommon" : "common";
    case "weeklyChallengeStreak":
      return rule.weeks >= 12 ? "mythic" : rule.weeks >= 4 ? "rare" : "uncommon";
    case "complete":
      return "apex";
    case "creatorOnly":
    case "supporterOnly":
      return "rare";
    case "worstScoreUnder":
      return "rare";
    case "averageScoreUnder":
      return "epic";
    case "gamesTied":
      return "uncommon";
    case "mpWinStreak":
      return rule.streak >= 8 ? "epic" : "rare";
    case "boutique":
      // Matches the explicit `rarity: "rare"` the first two boutique
      // badges (avatarPresets.ts's 🎩🕶️) already set — a sensible default
      // for anything meant to eventually be a real purchase, without
      // needing every future boutique item to set it explicitly.
      return "rare";
  }
}
