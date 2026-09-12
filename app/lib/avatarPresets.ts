// The fixed choices for a player's profile picture when they haven't (or
// don't want to) upload a photo — an emoji plus a background color, same
// visual language as the AI opponents' single-emoji avatars (aiPersonas.ts),
// just with a color behind it since a human player only ever picks one, not
// a whole roster. All three lists (free emoji, premium emoji, colors) are
// constrained at the database too (migration 0024's leaderboard_avatar_
// emoji_ok / leaderboard_avatar_color_ok CHECKs, migration 0026's premium
// additions) — keep those in sync with these if any list ever changes.

import { AchievementCategory, AchievementProgressState, allAchievements } from "@/achievements";

export const EMOJI_OPTIONS: readonly string[] = [
  "😀", "😎", "🤠", "🥸", "🤓", "🧐", "😺", "🐯", "🦁", "🐵", "🐼", "🐨",
  "🦊", "🐺", "🦄", "🐲", "🐙", "🦋", "🐝", "🌵", "🍉", "🍕", "🎸", "🎧",
  "⚽", "🏀", "🎯", "🎲", "🚀", "⚡", "🔥", "🌈", "🌙", "⭐", "♠️", "♥️",
  "♦️", "♣️", "🃏", "🎭", "🍀", "⚓", "🎨", "🥷", "🦖", "🐉",
] as const;

export type PremiumEmojiUnlock =
  | { kind: "level"; level: number }
  | { kind: "categoryMastered"; category: AchievementCategory; categoryLabel: string };

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
 * Enforced for real at the database (migration 0026's trigger) — this
 * client-side check is just what drives the picker's UI, not the source of
 * truth; see leaderboardStore.ts's PremiumEmojiLockedError.
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
] as const;

export const DEFAULT_EMOJI = EMOJI_OPTIONS[0];
export const DEFAULT_COLOR = COLOR_OPTIONS[9].hex; // Blue — a neutral, on-theme default

/** Every emoji the database will structurally accept — free or premium,
 * locked or not. Doesn't mean the signed-in account is *allowed* to set it
 * right now (see isPremiumEmojiUnlocked) — just that it's a real option. */
export function isValidEmoji(emoji: string): boolean {
  return EMOJI_OPTIONS.includes(emoji) || PREMIUM_EMOJI_OPTIONS.some((p) => p.emoji === emoji);
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
  const unlock = option.unlock;
  if (unlock.kind === "level") return level >= unlock.level;
  const inCategory = allAchievements(progress).filter((a) => a.category === unlock.category);
  return inCategory.length > 0 && inCategory.every((a) => a.tier !== "expert" || a.unlocked);
}

/** A short "how to unlock this" line for the picker's lock tooltip. */
export function premiumEmojiRequirementLabel(unlock: PremiumEmojiUnlock): string {
  return unlock.kind === "level" ? `Unlocks at Level ${unlock.level}` : `Master every ${unlock.categoryLabel} achievement`;
}
