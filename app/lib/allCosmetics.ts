// Every gated cosmetic across all four systems (premium avatar emoji,
// avatar frame, title, banner), flattened into one list purely for "did
// anything just newly unlock" diffing (see GameOverScreen.tsx and
// useMpGame.ts) — not for any picker UI, which each still reads from its
// own catalog (avatarPresets.ts, profileCosmetics.ts, bannerPresets.ts).

import { AchievementProgressState } from "@/achievements";
import { PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";
import { BANNER_OPTIONS } from "./bannerPresets";
import { CosmeticUnlockRule, isCosmeticUnlocked } from "./cosmeticUnlocks";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "./profileCosmetics";

export interface AnyCosmeticOption {
  kind: "avatar_emoji" | "avatar_frame" | "title" | "banner";
  id: string;
  label: string;
  unlock: CosmeticUnlockRule;
}

export const ALL_GATED_COSMETICS: readonly AnyCosmeticOption[] = [
  ...PREMIUM_EMOJI_OPTIONS.map((o) => ({ kind: "avatar_emoji" as const, id: o.emoji, label: `${o.emoji} avatar`, unlock: o.unlock })),
  ...AVATAR_FRAME_OPTIONS.map((o) => ({ kind: "avatar_frame" as const, id: o.id, label: `${o.label} frame`, unlock: o.unlock })),
  ...TITLE_OPTIONS.map((o) => ({ kind: "title" as const, id: o.id, label: `"${o.label}" title`, unlock: o.unlock })),
  ...BANNER_OPTIONS.filter((o) => o.unlock).map((o) => ({
    kind: "banner" as const,
    id: o.id,
    label: `${o.label} banner`,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
];

/** Everything in ALL_GATED_COSMETICS that just crossed from locked to
 * unlocked between two progress snapshots — the toast's whole job. */
export function diffNewlyUnlockedCosmetics(
  beforeLevel: number,
  beforeProgress: AchievementProgressState,
  afterLevel: number,
  afterProgress: AchievementProgressState
): AnyCosmeticOption[] {
  return ALL_GATED_COSMETICS.filter((c) => {
    const wasUnlocked = isCosmeticUnlocked(c.unlock, beforeLevel, beforeProgress);
    const nowUnlocked = isCosmeticUnlocked(c.unlock, afterLevel, afterProgress);
    return nowUnlocked && !wasUnlocked;
  });
}
