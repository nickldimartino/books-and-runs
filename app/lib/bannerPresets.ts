// A wide strip of color behind the profile header — separate from the
// avatar frame, same "pick a background" spirit as the avatar's own color
// swatches (avatarPresets.ts's COLOR_OPTIONS), just bigger. Mostly free;
// "grandmaster" is the one gated pick, sharing the same rotating-rainbow
// motif as the Grandmaster avatar frame and title (profileCosmetics.ts)
// for mastering every achievement category — three cosmetics, one prestige
// reward. Kept in sync with migration 0029's leaderboard_banner_ok CHECK.

import { CosmeticUnlockRule } from "./cosmeticUnlocks";

export interface BannerOption {
  id: string;
  label: string;
  /** A CSS `background` value — solid gradients only, no images, so this
   * never depends on loading anything external. */
  css: string;
  unlock?: CosmeticUnlockRule;
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
  {
    id: "grandmaster",
    label: "Grandmaster",
    css: "conic-gradient(from 0deg, #f43f5e, #f59e0b, #eab308, #22c55e, #06b6d4, #6366f1, #a855f7, #f43f5e)",
    unlock: { kind: "allCategoriesMastered" },
  },
];

export function findBannerOption(id: string | null): BannerOption | null {
  if (!id) return null;
  return BANNER_OPTIONS.find((b) => b.id === id) ?? null;
}
