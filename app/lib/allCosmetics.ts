// Every gated cosmetic across all four systems (badge, avatar frame,
// title, banner), flattened into one list purely for "did anything just
// newly unlock" diffing (see GameOverScreen.tsx and useMpGame.ts) — not
// for any picker UI, which each still reads from its own catalog
// (avatarPresets.ts, profileCosmetics.ts, bannerPresets.ts). Boutique items
// (source: "boutique", gated on `unlock: { kind: "boutique" }`) are
// deliberately filtered out of every catalog below — this diffing only
// ever has level/achievement progress to compare (see
// diffNewlyUnlockedCosmetics's own doc), so a boutique item would always
// read as locked on both sides and never fire the toast anyway; excluding
// it here just keeps this list honestly matching its own doc instead of
// carrying dead entries.

import { AchievementProgressState } from "@/achievements";
import { PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";
import { BANNER_OPTIONS } from "./bannerPresets";
import { CosmeticUnlockRule, isCosmeticUnlocked, makeUnlockContext } from "./cosmeticUnlocks";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "./profileCosmetics";

export interface AnyCosmeticOption {
  kind: "badge" | "avatar_frame" | "title" | "banner";
  id: string;
  label: string;
  /** The bare display name — the emoji for a badge, else the option's own
   * label — for callers that compose their own (translated) sentence
   * around it instead of using the English `label`. */
  name: string;
  unlock: CosmeticUnlockRule;
}

const ALL_GATED_COSMETICS: readonly AnyCosmeticOption[] = [
  ...PREMIUM_EMOJI_OPTIONS.filter((o) => o.unlock && o.source !== "boutique").map((o) => ({
    kind: "badge" as const,
    id: o.emoji,
    label: `${o.emoji} badge`,
    name: o.emoji,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
  ...AVATAR_FRAME_OPTIONS.filter((o) => o.unlock && o.source !== "boutique").map((o) => ({
    kind: "avatar_frame" as const,
    id: o.id,
    label: `${o.label} frame`,
    name: o.label,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
  ...TITLE_OPTIONS.filter((o) => o.unlock && o.source !== "boutique").map((o) => ({
    kind: "title" as const,
    id: o.id,
    label: `"${o.label}" title`,
    name: o.label,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
  ...BANNER_OPTIONS.filter((o) => o.unlock && o.source !== "boutique").map((o) => ({
    kind: "banner" as const,
    id: o.id,
    label: `${o.label} banner`,
    name: o.label,
    unlock: o.unlock as CosmeticUnlockRule,
  })),
];

/** Everything in ALL_GATED_COSMETICS that just crossed from locked to
 * unlocked between two progress snapshots — the toast's whole job.
 *
 * Only ever tracks level + achievement progress before/after a single game
 * (that's all GameOverScreen.tsx/useMpGame.ts snapshot) — a reward gated on
 * games played, a Daily Deal streak, a Weekly Challenge streak, being the
 * creator, a worst/average score threshold, a tied-game count, or a
 * multiplayer win streak (cosmeticUnlocks.ts's non-level/progress rule
 * kinds) reads as its "nothing yet" default on both sides of the diff, so
 * it never fires this toast. That's a real gap, not a bug: those rewards
 * still unlock exactly on schedule and show up correctly the next time any
 * picker loads the real numbers — they just don't get an in-the-moment
 * celebration here. */
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

/** The nearest level above `currentLevel` that unlocks a cosmetic, with
 * everything that unlocks at exactly that level — Home's "next reward"
 * line. Null once every level-gated reward is unlocked. Only pure
 * level-gated items count (an achievement- or streak-gated one has no
 * single "at level N" to point at). */
export function nextLevelUnlocks(currentLevel: number): { level: number; items: AnyCosmeticOption[] } | null {
  let next = Infinity;
  for (const c of ALL_GATED_COSMETICS) {
    if (c.unlock.kind === "level" && c.unlock.level > currentLevel && c.unlock.level < next) next = c.unlock.level;
  }
  if (!Number.isFinite(next)) return null;
  return {
    level: next,
    items: ALL_GATED_COSMETICS.filter((c) => c.unlock.kind === "level" && c.unlock.level === next),
  };
}
