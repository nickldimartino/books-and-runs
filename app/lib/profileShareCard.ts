// Builds a ProfileShareCardInput (shareCard.ts) from a real
// leaderboard_entries row — the one place this transformation happens, so
// player/page.tsx's own "Share profile card" button and friends/page.tsx's
// "share to add me" button (which produces the identical card, just with a
// friend-code-flavored footer/clipboard link instead of a bare profile
// link) can't drift into two subtly different-looking cards.

import { AchievementCategory, AchievementTier, ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS, WIN_RATE_MIN_GAMES } from "@/achievements";
import { AVATAR_FRAME_COLOR, findAvatarFrameOption, findTitleOption } from "./profileCosmetics";
import type { TranslationKey } from "./i18n/keys";
import type { Vars } from "./i18n/LocaleProvider";
import { avatarPhotoUrlFor, displayNameFor, LeaderboardEntry } from "./leaderboardStore";
import { ProfileShareCardInput } from "./shareCard";
import type { SupabaseClient } from "@supabase/supabase-js";

type T = (key: TranslationKey, vars?: Vars) => string;

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;

const FAMILY_BY_ID = new Map(ACHIEVEMENT_FAMILIES.map((f) => [f.id, f]));

export interface ShowcaseItem {
  key: string;
  familyId: string;
  familyTitle: string;
  category: AchievementCategory;
  tier: AchievementTier;
}

/** Parses a "familyId:tier" showcase entry against the live family list —
 * returns null for anything that no longer resolves (a family renamed or
 * removed since the account pinned it). Resolves the family's title through
 * `t` right here (rather than carrying a key downstream) since ShowcaseItem
 * flows into the canvas share-card renderer, which draws plain text and has
 * no locale context of its own. */
export function resolveShowcaseItem(key: string, t: T): ShowcaseItem | null {
  const sep = key.lastIndexOf(":");
  if (sep === -1) return null;
  const familyId = key.slice(0, sep);
  const tier = key.slice(sep + 1) as AchievementTier;
  const family = FAMILY_BY_ID.get(familyId);
  if (!family || !ACHIEVEMENT_TIERS.includes(tier)) return null;
  return { key, familyId, familyTitle: t(family.titleKey as TranslationKey), category: family.category, tier };
}

export function formatWinRate(gamesPlayed: number, gamesWon: number): string {
  if (gamesPlayed < WIN_RATE_MIN_GAMES) return "—";
  return `${Math.round((100 * gamesWon) / gamesPlayed)}%`;
}

/** Pure transform, no network/canvas work — `displayLevel` is the caller's
 * choice (player/page.tsx uses the live level for a self-view, the synced
 * snapshot otherwise; a share is always of your own profile either way, so
 * the live level is normally right). */
export function buildProfileShareCardInput(
  supabase: SupabaseClient | null,
  entry: LeaderboardEntry,
  displayLevel: number,
  t: T,
  footerText?: string
): ProfileShareCardInput {
  const frameOption = findAvatarFrameOption(entry.avatar_frame);
  const titleOption = findTitleOption(entry.title);
  return {
    displayName: displayNameFor(entry),
    isCreator: entry.is_creator,
    titleLabel: titleOption?.label ?? null,
    level: displayLevel,
    avatarKind: entry.avatar_kind,
    avatarEmoji: entry.avatar_emoji,
    avatarColor: entry.avatar_color,
    avatarPhotoUrl:
      entry.avatar_kind === "photo" && entry.avatar_photo_path && supabase
        ? avatarPhotoUrlFor(supabase, entry.avatar_photo_path, entry.updated_at)
        : null,
    // "grandmaster" isn't in AVATAR_FRAME_COLOR at all — it's a rotating
    // conic gradient in the real UI (AvatarFrame.tsx), approximated here as
    // one representative flat color, same simplification this file's own
    // canvas renderer already applies to "prismatic" (which *is* in the
    // map, as its own flat fallback — see profileCosmetics.ts).
    frameColor: frameOption ? (frameOption.id === "grandmaster" ? "#a855f7" : AVATAR_FRAME_COLOR[frameOption.id]) : null,
    badge: entry.badge,
    banner: entry.banner,
    creatorLabel: t("player.creator.label"),
    trophyCaseLabel: t("player.trophyCase.heading"),
    levelLabel: t("home.levelN", { level: displayLevel }),
    stats: [
      { label: t("leaderboard.column.games"), value: String(entry.games_played) },
      { label: t("leaderboard.column.achievements"), value: `${entry.achievements_unlocked}/${TOTAL_ACHIEVEMENTS}` },
      { label: t("leaderboard.column.winRate"), value: formatWinRate(entry.games_played, entry.games_won) },
    ],
    trophies: entry.showcase
      .map((key) => resolveShowcaseItem(key, t))
      .filter((i): i is ShowcaseItem => !!i)
      .map((i) => ({ category: i.category, tier: i.tier, familyTitle: i.familyTitle })),
    footerText,
  };
}
