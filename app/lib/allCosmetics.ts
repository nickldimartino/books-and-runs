// Every gated cosmetic across all four systems (badge, avatar frame,
// title, banner), flattened into one list purely for "did anything just
// newly unlock" diffing (see GameOverScreen.tsx and useMpGame.ts) — not
// for any picker UI, which each still reads from its own catalog
// (avatarPresets.ts, profileCosmetics.ts, bannerPresets.ts). Boutique items
// (source: "boutique", no `unlock` rule) are deliberately filtered out of
// every catalog below — nothing to "newly unlock" for something that's
// already free from the moment it ships.

import { AchievementProgressState } from "@/achievements";
import { PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";
import { BANNER_OPTIONS } from "./bannerPresets";
import { CosmeticUnlockRule, isCosmeticUnlocked, makeUnlockContext } from "./cosmeticUnlocks";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "./profileCosmetics";

export interface AnyCosmeticOption {
  kind: "badge" | "avatar_frame" | "title" | "banner";
  id: string;
  label: string;
  unlock: CosmeticUnlockRule;
}

export const ALL_GATED_COSMETICS: readonly AnyCosmeticOption[] = [
  ...PREMIUM_EMOJI_OPTIONS.filter((o) => o.unlock).map((o) => ({
    kind: "badge" as const,
    id: o.emoji,
    label: `${o.emoji} badge`,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
  ...AVATAR_FRAME_OPTIONS.filter((o) => o.unlock).map((o) => ({
    kind: "avatar_frame" as const,
    id: o.id,
    label: `${o.label} frame`,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
  ...TITLE_OPTIONS.filter((o) => o.unlock).map((o) => ({
    kind: "title" as const,
    id: o.id,
    label: `"${o.label}" title`,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
  ...BANNER_OPTIONS.filter((o) => o.unlock).map((o) => ({
    kind: "banner" as const,
    id: o.id,
    label: `${o.label} banner`,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
];

/** Everything in ALL_GATED_COSMETICS that just crossed from locked to
 * unlocked between two progress snapshots — the toast's whole job.
 *
 * Only ever tracks level + achievement progress before/after a single game
 * (that's all GameOverScreen.tsx/useMpGame.ts snapshot) — a reward gated on
 * games played, a Daily Deal streak, a Weekly Challenge streak, or being
 * the creator (cosmeticUnlocks.ts's newer rule kinds) reads as its
 * "nothing yet" default on both sides of the diff, so it never fires this
 * toast. That's a real gap, not a bug: those rewards still unlock exactly
 * on schedule and show up correctly the next time any picker loads the
 * real numbers — they just don't get an in-the-moment celebration here. */
export function diffNewlyUnlockedCosmetics(
  beforeLevel: number,
  beforeProgress: AchievementProgressState,
  afterLevel: number,
  afterProgress: AchievementProgressState
): AnyCosmeticOption[] {
  const before = makeUnlockContext({ level: beforeLevel, progress: beforeProgress });
  const after = makeUnlockContext({ level: afterLevel, progress: afterProgress });
  return ALL_GATED_COSMETICS.filter((c) => {
    const wasUnlocked = isCosmeticUnlocked(c.unlock, before);
    const nowUnlocked = isCosmeticUnlocked(c.unlock, after);
    return nowUnlocked && !wasUnlocked;
  });
}
