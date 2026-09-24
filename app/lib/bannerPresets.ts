// A wide strip of color behind the profile header — separate from the
// avatar frame, same "pick a background" spirit as the avatar's own color
// swatches (avatarPresets.ts's COLOR_OPTIONS), just bigger. Mostly free;
// "grandmaster" is the one gated pick, sharing the same rotating-rainbow
// motif as the Grandmaster avatar frame and title (profileCosmetics.ts)
// for mastering every achievement category — three cosmetics, one prestige
// reward. Kept in sync with migration 0029's leaderboard_banner_ok CHECK.

import { CosmeticRarity } from "./cosmeticRarity";
import { CosmeticUnlockRule } from "./cosmeticUnlocks";

export interface BannerOption {
  id: string;
  label: string;
  /** A CSS `background` value — solid gradients only, no images, so this
   * never depends on loading anything external. */
  css: string;
  unlock?: CosmeticUnlockRule;
  /** Visual-weight tier — absent means "derive it from `unlock`" via
   * cosmeticRarity.ts's defaultRarityForUnlock. */
  rarity?: CosmeticRarity;
  /** Set only on items that would eventually be purchasable — gated behind
   * `unlock: { kind: "boutique" }` (creator-only for now, a real purchase
   * later), surfaced together in the Boutique tab instead of this
   * category's own list. */
  source?: "boutique";
}

export const BANNER_OPTIONS: readonly BannerOption[] = [
  { id: "forest", label: "Forest", css: "linear-gradient(135deg, #0f3d2e, #134e3a)" },
  { id: "sunset", label: "Sunset", css: "linear-gradient(135deg, #f97316, #db2777)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(135deg, #0ea5e9, #1e3a8a)" },
  { id: "ember", label: "Ember", css: "linear-gradient(135deg, #7c2d12, #ef4444)" },
  { id: "grape", label: "Grape", css: "linear-gradient(135deg, #4c1d95, #a855f7)" },
  { id: "meadow", label: "Meadow", css: "linear-gradient(135deg, #365314, #84cc16)" },
  { id: "slate", label: "Slate", css: "linear-gradient(135deg, #1e293b, #64748b)" },
  { id: "rose", label: "Rose", css: "linear-gradient(135deg, #881337, #fb7185)" },
  { id: "gold", label: "Gold", css: "linear-gradient(135deg, #78350f, #f5c518)" },
  { id: "midnight", label: "Midnight", css: "linear-gradient(135deg, #020617, #312e81)" },
  { id: "coral", label: "Coral", css: "linear-gradient(135deg, #9a3412, #fb923c)" },
  { id: "ice", label: "Ice", css: "linear-gradient(135deg, #0e7490, #a5f3fc)" },
  { id: "aurora", label: "Aurora", css: "linear-gradient(135deg, #0f766e, #7c3aed)" },
  { id: "blossom", label: "Blossom", css: "linear-gradient(135deg, #be185d, #8b5cf6)" },
  // Deliberately not sharing "slate"'s own #1e293b start stop (the two
  // used to be identical at one end) — a darker, more neutral charcoal.
  { id: "storm", label: "Storm", css: "linear-gradient(135deg, #111827, #4338ca)" },
  { id: "lagoon", label: "Lagoon", css: "linear-gradient(135deg, #164e63, #22d3ee)" },
  { id: "wildfire", label: "Wildfire", css: "linear-gradient(135deg, #7f1d1d, #f59e0b)" },
  { id: "twilight", label: "Twilight", css: "linear-gradient(135deg, #312e81, #db2777)" },
  // Deliberately not sharing "ocean"'s own #1e3a8a stop (denim used to
  // start exactly where ocean ends) — a muted, faded-fabric blue instead
  // of another vivid-to-deep pairing.
  { id: "denim", label: "Denim", css: "linear-gradient(135deg, #1e40af, #93c5fd)" },
  { id: "plum", label: "Plum", css: "linear-gradient(135deg, #581c47, #d946ef)" },
  { id: "mint", label: "Mint", css: "linear-gradient(135deg, #166534, #2dd4bf)" },
  { id: "cottonCandy", label: "Cotton Candy", css: "linear-gradient(135deg, #f472b6, #67e8f9)" },
  // Was the same 7-stop full-rainbow conic gradient Prismatic uses (see
  // ProfileBanner.tsx's own history comment) — narrowed to its own tight
  // 2-color violet/gold sweep (mythic rarity, cosmeticRarity.ts) so the two
  // hardest rewards in the game read as genuinely different tiers rather
  // than "the same motif, one with more garnish." Matches the avatar
  // frame's own grandmaster gradient (AvatarFrame.tsx).
  {
    id: "grandmaster",
    label: "Grandmaster",
    css: "conic-gradient(from 0deg, #a855f7, #f5c518, #a855f7)",
    unlock: { kind: "allCategoriesMastered" },
  },
  // Epic/Mythic — see cosmeticUnlocks.ts's own doc for the new rule kinds.
  // Each id matches a same-named avatar frame/title/badge — one named
  // reward per milestone. Kept to exactly two stops like every banner
  // above, not just for visual consistency but because shareCard.ts's
  // canvas renderer only parses a 2-stop linear-gradient.
  { id: "specialist", label: "Eclipse", css: "linear-gradient(135deg, #1a0b2e, #0a0a0f)", unlock: { kind: "categoriesMasteredCount", count: 3 } },
  { id: "virtuoso", label: "Nova", css: "linear-gradient(135deg, #7c3aed, #f0abfc)", unlock: { kind: "categoriesMasteredCount", count: 6 } },
  { id: "ascendant", label: "Aurora Crown", css: "linear-gradient(135deg, #1e1b4b, #f0abfc)", unlock: { kind: "level", level: 250 } },
  { id: "ironwill", label: "Forge", css: "linear-gradient(135deg, #1c1917, #dc2626)", unlock: { kind: "gamesPlayed", count: 500 } },
  { id: "unbroken", label: "Daily Fire", css: "linear-gradient(135deg, #450a0a, #fde047)", unlock: { kind: "dailyDealStreak", days: 30 } },
  { id: "undefeated", label: "Victory Lap", css: "linear-gradient(135deg, #052e16, #facc15)", unlock: { kind: "weeklyChallengeStreak", weeks: 12 } },
  // Prismatic — the single apex reward. Same conic-gradient mechanism as
  // Grandmaster (and the same static-PNG simplification in shareCard.ts),
  // but with its own animated rotation in ProfileBanner.tsx (see
  // globals.css's .prismatic-spin) so the two "foil" banners still read as
  // visibly different tiers on the live page, not just different colors.
  {
    id: "prismatic",
    label: "The Complete Table",
    css: "conic-gradient(from 0deg, #ec4899, #a855f7, #6366f1, #06b6d4, #22c55e, #eab308, #f59e0b, #ec4899)",
    unlock: { kind: "complete" },
  },
  // Frame + banner only (see profileCosmetics.ts). The live banner gets a
  // full jeweled-border/wood/felt treatment (ProfileBanner.tsx's
  // isDealersTable branch, styled in globals.css) that this `css` field
  // can't express — it only feeds the free-swatch picker preview and the
  // share-card PNG fallback (shareCard.ts only parses a plain 2-stop
  // gradient), so it stays a simple approximation of the felt tone alone.
  { id: "dealerstable", label: "Dealer's Table", css: "linear-gradient(135deg, #124a35, #051911)", unlock: { kind: "creatorOnly" } },
  // Phase 3's 2 new epic-tier named rewards — matching avatarPresets.ts's
  // ⚖️/📈 and profileCosmetics.ts's steadyhand/hotstreak frame + title.
  { id: "steadyhand", label: "Glacier", css: "linear-gradient(135deg, #0c4a6e, #7dd3fc)", unlock: { kind: "averageScoreUnder", score: 70, minGames: 15 } },
  { id: "hotstreak", label: "Blaze", css: "linear-gradient(135deg, #9a3412, #fbbf24)", unlock: { kind: "mpWinStreak", streak: 8 } },
  // Boutique.
  { id: "velvet", label: "Velvet", css: "linear-gradient(135deg, #4c0519, #86198f)", source: "boutique", unlock: { kind: "boutique" } },
  { id: "moonlight", label: "Moonlight", css: "linear-gradient(135deg, #1e1b4b, #64748b)", source: "boutique", unlock: { kind: "boutique" } },
];

export function findBannerOption(id: string | null): BannerOption | null {
  if (!id) return null;
  return BANNER_OPTIONS.find((b) => b.id === id) ?? null;
}
