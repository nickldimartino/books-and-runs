// Avatar frames and nameplate titles — two more gated cosmetics alongside
// the premium avatar emoji (avatarPresets.ts), sharing the same unlock
// system (cosmeticUnlocks.ts) and the same server-side enforcement
// (migration 0028's cosmetic_unlocks table + trigger). Keep both catalogs
// here in sync with that migration if either ever changes.

import { CosmeticUnlockRule } from "./cosmeticUnlocks";

export interface AvatarFrameOption {
  id: string;
  label: string;
  unlock: CosmeticUnlockRule;
}

/** A ring drawn around the whole avatar (photo or emoji), independent of
 * which emoji/color/photo is inside it — see AvatarFrame.tsx. "none" isn't
 * listed here since it's just the absence of a frame (avatar_frame: null),
 * not a pickable option with its own unlock rule. */
export const AVATAR_FRAME_OPTIONS: readonly AvatarFrameOption[] = [
  { id: "bronze", label: "Bronze", unlock: { kind: "level", level: 10 } },
  { id: "silver", label: "Silver", unlock: { kind: "level", level: 25 } },
  { id: "gold", label: "Gold", unlock: { kind: "level", level: 50 } },
  { id: "diamond", label: "Diamond", unlock: { kind: "level", level: 100 } },
  { id: "grandmaster", label: "Grandmaster", unlock: { kind: "allCategoriesMastered" } },
];

/** Solid ring colors for each frame — "grandmaster" instead gets a
 * rotating conic gradient (see AvatarFrame.tsx) rather than one flat
 * color, since it's the single rarest cosmetic in the whole system. */
export const AVATAR_FRAME_COLOR: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#B0B8C1",
  gold: "#F5C518",
  diamond: "#38BDF8",
};

export function findAvatarFrameOption(id: string | null): AvatarFrameOption | null {
  if (!id) return null;
  return AVATAR_FRAME_OPTIONS.find((f) => f.id === id) ?? null;
}

export interface TitleOption {
  id: string;
  label: string;
  unlock: CosmeticUnlockRule;
}

/** Shown under the display name (see player/page.tsx) — a short earned
 * flair, same spirit as a premium emoji or frame but as text instead of an
 * image. */
export const TITLE_OPTIONS: readonly TitleOption[] = [
  { id: "rising_star", label: "Rising Star", unlock: { kind: "level", level: 10 } },
  { id: "card_shark", label: "Card Shark", unlock: { kind: "level", level: 25 } },
  { id: "high_roller", label: "High Roller", unlock: { kind: "level", level: 50 } },
  { id: "living_legend", label: "Living Legend", unlock: { kind: "level", level: 100 } },
  {
    id: "statistician",
    label: "Statistician",
    unlock: { kind: "categoryMastered", category: "accountStats", categoryLabel: "Account Stats" },
  },
  {
    id: "ace_hunter",
    label: "Ace Hunter",
    unlock: { kind: "categoryMastered", category: "aiRivals", categoryLabel: "AI Rivals" },
  },
  {
    id: "meld_master",
    label: "Meld Master",
    unlock: { kind: "categoryMastered", category: "melding", categoryLabel: "Melding" },
  },
  {
    id: "the_enabler",
    label: "The Enabler",
    unlock: { kind: "categoryMastered", category: "layingOff", categoryLabel: "Laying Off" },
  },
  {
    id: "deck_whisperer",
    label: "Deck Whisperer",
    unlock: { kind: "categoryMastered", category: "drawDiscard", categoryLabel: "Draw & Discard" },
  },
  {
    id: "clean_sweeper",
    label: "Clean Sweeper",
    unlock: { kind: "categoryMastered", category: "goingOut", categoryLabel: "Going Out" },
  },
  {
    id: "contract_killer",
    label: "Contract Killer",
    unlock: { kind: "categoryMastered", category: "contracts", categoryLabel: "Contracts" },
  },
  {
    id: "table_captain",
    label: "Table Captain",
    unlock: { kind: "categoryMastered", category: "tableComposition", categoryLabel: "Table Composition" },
  },
  {
    id: "multiplayer_monarch",
    label: "Multiplayer Monarch",
    unlock: { kind: "categoryMastered", category: "multiplayer", categoryLabel: "Multiplayer" },
  },
  { id: "grandmaster", label: "Grandmaster", unlock: { kind: "allCategoriesMastered" } },
];

export function findTitleOption(id: string | null): TitleOption | null {
  if (!id) return null;
  return TITLE_OPTIONS.find((t) => t.id === id) ?? null;
}
