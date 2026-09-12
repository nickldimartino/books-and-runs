// The fixed choices for a player's profile picture when they haven't (or
// don't want to) upload a photo — an emoji plus a background color, same
// visual language as the AI opponents' single-emoji avatars (aiPersonas.ts),
// just with a color behind it since a human player only ever picks one, not
// a whole roster. Both lists are constrained at the database too (migration
// 0024's leaderboard_avatar_emoji_ok / leaderboard_avatar_color_ok CHECKs) —
// keep those in sync with these if either list ever changes.

export const EMOJI_OPTIONS: readonly string[] = [
  "😀", "😎", "🤠", "🥸", "🤓", "🧐", "😺", "🐯", "🦁", "🐵", "🐼", "🐨",
  "🦊", "🐺", "🦄", "🐲", "🐙", "🦋", "🐝", "🌵", "🍉", "🍕", "🎸", "🎧",
  "⚽", "🏀", "🎯", "🎲", "🚀", "⚡", "🔥", "🌈", "🌙", "⭐", "♠️", "♥️",
  "♦️", "♣️", "🃏", "👑", "💎", "🎭", "🍀", "⚓", "🎨", "🥷", "🦖", "🐉",
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

export function isValidEmoji(emoji: string): boolean {
  return EMOJI_OPTIONS.includes(emoji);
}

export function isValidColor(hex: string): boolean {
  return COLOR_OPTIONS.some((c) => c.hex === hex);
}
