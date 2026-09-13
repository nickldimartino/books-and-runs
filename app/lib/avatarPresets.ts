// The fixed choices for a player's profile picture when they haven't (or
// don't want to) upload a photo — an emoji plus a background color, same
// visual language as the AI opponents' single-emoji avatars (aiPersonas.ts),
// just with a color behind it since a human player only ever picks one, not
// a whole roster. Both lists (free emoji, colors) are constrained at the
// database too (migration 0024's leaderboard_avatar_emoji_ok /
// leaderboard_avatar_color_ok CHECKs) — keep those in sync with these if
// either list ever changes.
//
// PREMIUM_EMOJI_OPTIONS below is a separate thing despite living in this
// same file (it predates the badge/picture split) — those 13 are earned
// badges (migration 0031's `badge` column), an overlay shown alongside
// whichever picture (photo or one of the free emoji above) an account
// actually has, not a competing picture of their own.

import { AchievementProgressState } from "@/achievements";
import { CosmeticUnlockRule, cosmeticRequirementLabel, isCosmeticUnlocked } from "./cosmeticUnlocks";

export const EMOJI_OPTIONS: readonly string[] = [
  "😀", "😎", "🤠", "🥸", "🤓", "🧐", "😺", "🐯", "🦁", "🐵", "🐼", "🐨",
  "🦊", "🐺", "🦄", "🐲", "🐙", "🦋", "🐝", "🌵", "🍉", "🍕", "🎸", "🎧",
  "⚽", "🏀", "🎯", "🎲", "🚀", "⚡", "🔥", "🌈", "🌙", "⭐", "♠️", "♥️",
  "♦️", "♣️", "🃏", "🎭", "🍀", "⚓", "🎨", "🥷", "🦖", "🐉",
] as const;

/** Kept as its own name (rather than importing CosmeticUnlockRule directly
 * everywhere) since this file predates the shared cosmeticUnlocks.ts —
 * same type either way. */
export type PremiumEmojiUnlock = CosmeticUnlockRule;

export interface PremiumEmojiOption {
  emoji: string;
  unlock: PremiumEmojiUnlock;
}

/**
 * Milestone rewards, not free picks — each requires either reaching a
 * level or fully mastering (every family at Expert tier) one of
 * achievements.ts's 9 categories. Shown greyed-out with a lock and the
 * requirement in the picker until earned (see isPremiumEmojiUnlocked
 * below), never hidden — the point is to be a visible goal, not a secret.
 * Enforced for real at the database (migration 0031's trigger, as the
 * `badge` column) — this client-side check is just what drives the
 * picker's UI, not the source of truth; see leaderboardStore.ts's
 * CosmeticLockedError.
 */
export const PREMIUM_EMOJI_OPTIONS: readonly PremiumEmojiOption[] = [
  { emoji: "🥉", unlock: { kind: "level", level: 10 } },
  { emoji: "🥈", unlock: { kind: "level", level: 25 } },
  { emoji: "🥇", unlock: { kind: "level", level: 50 } },
  { emoji: "💎", unlock: { kind: "level", level: 100 } },
  { emoji: "📊", unlock: { kind: "categoryMastered", category: "accountStats", categoryLabel: "Account Stats" } },
  { emoji: "🎖️", unlock: { kind: "categoryMastered", category: "aiRivals", categoryLabel: "AI Rivals" } },
  { emoji: "🧩", unlock: { kind: "categoryMastered", category: "melding", categoryLabel: "Melding" } },
  { emoji: "🪄", unlock: { kind: "categoryMastered", category: "layingOff", categoryLabel: "Laying Off" } },
  { emoji: "🔄", unlock: { kind: "categoryMastered", category: "drawDiscard", categoryLabel: "Draw & Discard" } },
  { emoji: "🚪", unlock: { kind: "categoryMastered", category: "goingOut", categoryLabel: "Going Out" } },
  { emoji: "📜", unlock: { kind: "categoryMastered", category: "contracts", categoryLabel: "Contracts" } },
  { emoji: "🎪", unlock: { kind: "categoryMastered", category: "tableComposition", categoryLabel: "Table Composition" } },
  { emoji: "👑", unlock: { kind: "categoryMastered", category: "multiplayer", categoryLabel: "Multiplayer" } },
] as const;

/** Ring color behind each level-milestone medal (see
 * PremiumBadgeIcon.tsx's MedalIcon) — bronze/silver/gold/diamond, in
 * ascending order the same way achievement tiers use bronze→diamond rings
 * (player/page.tsx's TIER_RING_COLOR). Category-mastery badges don't need
 * an entry here — they're colored by their own achievement tier instead. */
export const LEVEL_MEDAL_COLOR: Record<string, string> = {
  "🥉": "#CD7F32",
  "🥈": "#B0B8C1",
  "🥇": "#F5C518",
  "💎": "#38BDF8",
};

/** The premium option for a given emoji, or null for a free (or unknown)
 * one — the one lookup PlayerAvatar/the picker both need to decide
 * "should this render as a custom badge icon instead of plain text." */
export function findPremiumEmojiOption(emoji: string): PremiumEmojiOption | null {
  return PREMIUM_EMOJI_OPTIONS.find((o) => o.emoji === emoji) ?? null;
}

export interface ColorOption {
  hex: string;
  label: string;
}

export const COLOR_OPTIONS: readonly ColorOption[] = [
  { hex: "#EF4444", label: "Red" },
  { hex: "#F97316", label: "Orange" },
  { hex: "#F59E0B", label: "Amber" },
  { hex: "#EAB308", label: "Yellow" },
  { hex: "#84CC16", label: "Lime" },
  { hex: "#22C55E", label: "Green" },
  { hex: "#10B981", label: "Emerald" },
  { hex: "#14B8A6", label: "Teal" },
  { hex: "#06B6D4", label: "Cyan" },
  { hex: "#3B82F6", label: "Blue" },
  { hex: "#6366F1", label: "Indigo" },
  { hex: "#8B5CF6", label: "Violet" },
  { hex: "#A855F7", label: "Purple" },
  { hex: "#EC4899", label: "Pink" },
  { hex: "#F43F5E", label: "Rose" },
  { hex: "#64748B", label: "Slate" },
  // Appended rather than interleaved so DEFAULT_COLOR's index below (and
  // anyone else who ever indexes into this array by position) stays
  // pointed at the same color it always has.
  { hex: "#0EA5E9", label: "Sky" },
  { hex: "#D946EF", label: "Fuchsia" },
  { hex: "#B91C1C", label: "Crimson" },
  { hex: "#166534", label: "Forest" },
  { hex: "#1E3A8A", label: "Navy" },
  { hex: "#334155", label: "Charcoal" },
  { hex: "#A16207", label: "Gold" },
  { hex: "#6EE7B7", label: "Mint" },
] as const;

export const DEFAULT_EMOJI = EMOJI_OPTIONS[0];
export const DEFAULT_COLOR = COLOR_OPTIONS[9].hex; // Blue — a neutral, on-theme default

/** Every emoji the database will accept as a whole avatar picture — the
 * free set only (migration 0031 moved the 13 premium ones to their own
 * `badge` column, an overlay rather than a competing picture). */
export function isValidEmoji(emoji: string): boolean {
  return EMOJI_OPTIONS.includes(emoji);
}

/** Every emoji the database will accept as a badge — the earned set only;
 * see findPremiumEmojiOption for looking one up with its unlock rule. */
export function isValidBadge(emoji: string): boolean {
  return PREMIUM_EMOJI_OPTIONS.some((p) => p.emoji === emoji);
}

export function isValidColor(hex: string): boolean {
  return COLOR_OPTIONS.some((c) => c.hex === hex);
}

/**
 * Whether the signed-in account has actually earned a given premium emoji
 * — computed the same way achievements.ts's own unlock logic works
 * (allAchievements over the account's real progress), so this reads as one
 * consistent system rather than a second, hand-tuned copy of "what counts
 * as mastered." Mirrors, but isn't the source of truth for, migration
 * 0026's server-side trigger — that's what actually decides on save.
 */
export function isPremiumEmojiUnlocked(
  option: PremiumEmojiOption,
  level: number,
  progress: AchievementProgressState
): boolean {
  return isCosmeticUnlocked(option.unlock, level, progress);
}

/** A short "how to unlock this" line for the picker's lock tooltip. */
export function premiumEmojiRequirementLabel(unlock: PremiumEmojiUnlock): string {
  return cosmeticRequirementLabel(unlock);
}
