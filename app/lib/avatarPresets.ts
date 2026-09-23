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

import { CosmeticUnlockRule, cosmeticRequirementLabel, isCosmeticUnlocked, UnlockContext } from "./cosmeticUnlocks";
import { CosmeticRarity } from "./cosmeticRarity";

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
  /** Absent only for a `source: "boutique"` item — every earned badge
   * carries one. */
  unlock?: PremiumEmojiUnlock;
  /** Visual-weight tier — absent means "derive it from `unlock`" via
   * cosmeticRarity.ts's defaultRarityForUnlock; only items that should
   * diverge from that default set it explicitly. */
  rarity?: CosmeticRarity;
  /** Set only on items that would eventually be purchasable — auto-
   * unlocked for everyone today (no real paywall yet), surfaced together
   * in the Boutique tab. Never combined with `unlock` on the same item. */
  source?: "boutique";
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
  // Epic/Mythic/Prismatic — see cosmeticUnlocks.ts's own doc for the new
  // rule kinds these use. Each pairs with a matching avatar frame, title,
  // and banner of the same name (profileCosmetics.ts/bannerPresets.ts) —
  // one named reward per milestone, not four separately-tuned ones.
  { emoji: "🧭", unlock: { kind: "categoriesMasteredCount", count: 3 } },
  { emoji: "🏵️", unlock: { kind: "categoriesMasteredCount", count: 6 } },
  { emoji: "🌌", unlock: { kind: "level", level: 250 } },
  { emoji: "⚔️", unlock: { kind: "gamesPlayed", count: 500 } },
  { emoji: "🏮", unlock: { kind: "dailyDealStreak", days: 30 } },
  { emoji: "🏆", unlock: { kind: "weeklyChallengeStreak", weeks: 12 } },
  { emoji: "💫", unlock: { kind: "complete" } },
  // Supporter — earned by tipping once (app/tip/page.tsx), not by playing
  // at all. The one badge in this list that isn't a progress reward.
  { emoji: "☕", unlock: { kind: "supporterOnly" } },
  // Stepping-stones added alongside the rarity system (see
  // cosmeticRarity.ts) — none of these needed a new requirement_kind, just
  // a new threshold on a rule that already existed. Explicit `rarity` only
  // where it needs to sit below the floor defaultRarityForUnlock would
  // otherwise place it (🔰 is meant to read as more entry-level than 🥉).
  { emoji: "🔰", unlock: { kind: "level", level: 5 }, rarity: "common" },
  { emoji: "🛡️", unlock: { kind: "level", level: 150 } },
  { emoji: "🎯", unlock: { kind: "categoriesMasteredCount", count: 1 } },
  { emoji: "🕯️", unlock: { kind: "dailyDealStreak", days: 7 } },
  // Phase 3 — the first 2 milestones on a genuinely new requirement_kind
  // (see cosmeticUnlocks.ts's own doc for each). 🧊/🤝 are single badges,
  // matching the existing 🥇/💎 pattern of a rare/uncommon reward with no
  // matching frame/title/banner. ⚖️/📈 are epic, so — matching Specialist/
  // Iron Will's own precedent — each is one named reward with a matching
  // avatar frame, title, and banner (profileCosmetics.ts/bannerPresets.ts),
  // not four separately-tuned cosmetics.
  { emoji: "🧊", unlock: { kind: "worstScoreUnder", score: 80 } },
  { emoji: "🤝", unlock: { kind: "gamesTied", count: 3 } },
  { emoji: "⚖️", unlock: { kind: "averageScoreUnder", score: 70, minGames: 15 } },
  { emoji: "📈", unlock: { kind: "mpWinStreak", streak: 8 } },
  // Boutique — auto-unlocked for everyone while there's no real paywall
  // yet (see player/page.tsx's Boutique tab). No `unlock` rule at all: a
  // cosmetic_type/cosmetic_key with no cosmetic_unlocks row is already
  // unconditionally free at the server (cosmetic_unlocked(), see
  // migration 0043) — nothing new to enforce here.
  { emoji: "🎩", source: "boutique", rarity: "rare" },
  { emoji: "🕶️", source: "boutique", rarity: "rare" },
] as const;

/** Ring/disc color for every badge that still renders as MedalIcon (see
 * PremiumBadgeIcon.tsx) — the original 4 level milestones, Supporter, and
 * the newer stepping-stone badges. The Epic/Mythic/Apex "flex" rewards
 * (🧭🏵️🌌⚔️🏮🏆💫) used to be colored medals too, but now render through
 * their own distinct icon shapes (rarityBadgeIconPaths.ts) in plain
 * currentColor instead — no entries needed here for those. Category-
 * mastery badges likewise don't need an entry — they're colored by their
 * own achievement tier instead (see AchievementIcon). */
export const LEVEL_MEDAL_COLOR: Record<string, string> = {
  "🥉": "#CD7F32",
  "🥈": "#B0B8C1",
  "🥇": "#F5C518",
  "💎": "#38BDF8",
  "☕": "#8b5e3c",
  "🔰": "#94a3b8",
  "🛡️": "#0ea5e9",
  "🎯": "#f97316",
  "🕯️": "#fb923c",
  "🎩": "#312e81",
  "🕶️": "#1e293b",
  "🧊": "#7dd3fc",
  "🤝": "#d97706",
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
export function isPremiumEmojiUnlocked(option: PremiumEmojiOption, ctx: UnlockContext): boolean {
  return !option.unlock || isCosmeticUnlocked(option.unlock, ctx);
}

/** A short "how to unlock this" line for the picker's lock tooltip — for a
 * boutique item (no `unlock` rule) that's simply that it's free. */
export function premiumEmojiRequirementLabel(unlock: PremiumEmojiUnlock | undefined): string {
  return unlock ? cosmeticRequirementLabel(unlock) : "Free";
}
