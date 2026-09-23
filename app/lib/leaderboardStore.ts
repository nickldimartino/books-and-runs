// The leaderboard is a single public table (`leaderboard_entries`, migration
// 0006) with one self-reported row per account — there's no server job
// aggregating it, each client just upserts its own snapshot. `syncLeaderboardStats`
// is that upsert; it's called after every finished game and derives every
// column (stats, level, XP, MP columns) from the same progress data the
// Achievements page uses. The MP columns go in a separate best-effort upsert
// so a project without migration 0011 still gets a working core sync.
// `displayNameFor` is the shared "name or fallback" renderer.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AchievementProgressState, allAchievements } from "@/achievements";
import { levelProgress } from "@/leveling";
import { isValidBadge, isValidColor, isValidEmoji } from "./avatarPresets";
import { EMPTY_MP_STATS, getMyMpStats } from "./mpStore";

interface PlayerStatsRow {
  games_played: number;
  games_won: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

interface AchievementCountersRow {
  counters: Record<string, number>;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_kind: "emoji" | "photo";
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_photo_path: string | null;
  /** Pinned "familyId:tier" strings (e.g. "books_melded:hard") — up to 6,
   * see migration 0026. Self-reported like everything else here. */
  showcase: string[];
  /** A ring around the whole avatar — see profileCosmetics.ts's
   * AVATAR_FRAME_OPTIONS and AvatarFrame.tsx. Null means no frame. */
  avatar_frame: string | null;
  /** A small earned overlay on the avatar's corner — see avatarPresets.ts's
   * PREMIUM_EMOJI_OPTIONS (migration 0031 moved these off avatar_emoji, so
   * a photo or free emoji picture and an earned badge show together
   * instead of one replacing the other). Null means no badge chosen. */
  badge: string | null;
  /** A short earned flair shown under the display name — see
   * profileCosmetics.ts's TITLE_OPTIONS. Null means no title chosen. */
  title: string | null;
  /** A wide color strip behind the profile header — see
   * bannerPresets.ts's BANNER_OPTIONS. Null means the plain background. */
  banner: string | null;
  /** When this account first signed in — see syncLeaderboardStats's own
   * doc for why this is set once from the client's own session rather
   * than read from the (unreadable-to-clients) auth.users table. Null for
   * any row synced before migration 0029 added this column. */
  joined_at: string | null;
  /** True for exactly one account — the app's developer — set once by
   * migration 0030, never through any client update function. A profile
   * badge, not a permission: nothing else in the app reads this. */
  is_creator: boolean;
  /** True for an account deliberately flagged (SQL-editor-only, see
   * migration 0047) as a throwaway account used to test multiplayer/Clubs/
   * Tournaments — excluded from the public leaderboard query and from
   * achievement-rarity's own denominator, so testing doesn't skew either.
   * Never set by any client-facing function. */
  is_test_account: boolean;
  level: number;
  total_xp: number;
  achievements_unlocked: number;
  games_played: number;
  games_won: number;
  average_score: number | null;
  worst_score: number | null;
  // Broadcast by syncDailyDealStreak below, not syncLeaderboardStats — see
  // its own doc for why these two are the one pair of columns here that
  // don't come from player_stats/achievement_counters.
  daily_deal_streak: number;
  daily_deal_best_streak: number;
  // Broadcast by syncWeeklyChallengeStreak, same reasoning as the pair
  // above — server-verified via migration 0039's trigger, not client-set.
  weekly_challenge_best_streak: number;
  mp_games_played: number;
  mp_games_won: number;
  mp_best_win_streak: number;
  updated_at: string;
}

/**
 * "Player 4821" — a stable placeholder for any account that hasn't set a
 * display name yet (leaderboard_entries.display_name stays null in the
 * database until they do, rather than storing generated text that would
 * then need to be told apart from a real, deliberately-chosen name). Purely
 * a display-time fallback; the same account always gets the same number,
 * derived from its own user id.
 */
export function displayNameFor(entry: Pick<LeaderboardEntry, "user_id" | "display_name">): string {
  if (entry.display_name && entry.display_name.trim()) return entry.display_name.trim();
  const hex = entry.user_id.replace(/-/g, "").slice(-4) || "0000";
  return `Player ${parseInt(hex, 16) % 10000}`;
}

/** Same as displayNameFor, just taking the two fields loose instead of a
 * whole entry — the shape Clubs/Tournaments/Friends actually have on hand
 * (a userId + a display name they've already fetched separately), rather
 * than a full LeaderboardEntry row. */
export function nameOf(userId: string, displayName: string | null): string {
  return displayNameFor({ user_id: userId, display_name: displayName });
}

/**
 * Recomputes and upserts the signed-in user's own leaderboard row — see the
 * migration's own comment for why this is self-reported (computed here,
 * client-side, with the exact same scoring logic used everywhere else in
 * the app) rather than derived server-side. Safe and cheap to call
 * opportunistically (a game finishing, the Account/Leaderboard pages
 * loading) — it only ever overwrites the stat columns, never
 * `display_name` (that's updateLeaderboardDisplayName's job below), so
 * calling this can never clobber a name someone already chose.
 */
export async function syncLeaderboardStats(
  supabase: SupabaseClient,
  userId: string,
  /** The signed-in session's own `user.created_at` — passed in rather than
   * read here since a client can't query auth.users for anyone (itself
   * included) beyond what its own session object already carries. Once
   * set, later calls harmlessly re-write the same value (account creation
   * time never changes); omit it and this column is left untouched. */
  joinedAt?: string
): Promise<void> {
  const [statsRes, countersRes, mpStats] = await Promise.all([
    supabase
      .from("player_stats")
      .select("games_played, games_won, best_score, worst_score, average_score, wins_by_difficulty")
      .eq("user_id", userId)
      .maybeSingle<PlayerStatsRow>(),
    supabase
      .from("achievement_counters")
      .select("counters")
      .eq("user_id", userId)
      .maybeSingle<AchievementCountersRow>(),
    // Best-effort (migration 0011) — a missing RPC just leaves MP stats at 0.
    getMyMpStats(supabase).catch(() => ({ ...EMPTY_MP_STATS })),
  ]);
  if (statsRes.error) throw statsRes.error;
  if (countersRes.error) throw countersRes.error;

  const stats = statsRes.data;
  const progress: AchievementProgressState = {
    counters: countersRes.data?.counters ?? {},
    gamesPlayed: stats?.games_played ?? 0,
    gamesWon: stats?.games_won ?? 0,
    bestScore: stats?.best_score ?? null,
    winsByDifficulty: stats?.wins_by_difficulty ?? {},
    mpGamesPlayed: mpStats.played,
    mpGamesWon: mpStats.won,
    mpBestWinStreak: mpStats.bestWinStreak,
  };
  const level = levelProgress(progress);
  const achievementsUnlocked = allAchievements(progress).filter((a) => a.unlocked).length;

  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    level: level.level,
    total_xp: level.totalXp,
    achievements_unlocked: achievementsUnlocked,
    games_played: stats?.games_played ?? 0,
    games_won: stats?.games_won ?? 0,
    average_score: stats?.average_score ?? null,
    worst_score: stats?.worst_score ?? null,
    ...(joinedAt ? { joined_at: joinedAt } : {}),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  // The mp_* columns land in their own write so a project that hasn't run
  // migration 0011 yet still gets a working core sync (level/XP already
  // account for MP achievements via `progress` above).
  if (mpStats.played > 0) {
    const { error: mpError } = await supabase.from("leaderboard_entries").upsert({
      user_id: userId,
      mp_games_played: mpStats.played,
      mp_games_won: mpStats.won,
      mp_best_win_streak: mpStats.bestWinStreak,
      updated_at: new Date().toISOString(),
    });
    if (mpError) console.error("Failed to sync MP leaderboard columns (run migration 0011):", mpError);
  }
}

/** Max stored display-name length. Matches the DB CHECK in migration 0013
 * and the `maxLength` on the Account page's input. */
export const MAX_DISPLAY_NAME_LENGTH = 24;

// Control characters (U+0000–U+001F, U+007F) and bidi-override/isolate
// characters (U+202A–U+202E, U+2066–U+2069) — built from numeric code
// points rather than typed as literal escapes, so nothing here can silently
// end up as a raw, invisible bidi-override character sitting in the source
// file itself. Shared by sanitizeDisplayName and sanitizeBio below.
function stripControlAndBidiChars(s: string): string {
  const cc = (n: number) => String.fromCharCode(n);
  const ranges: [number, number][] = [
    [0x0000, 0x001f],
    [0x007f, 0x007f],
    [0x202a, 0x202e],
    [0x2066, 0x2069],
  ];
  const pattern = ranges.map(([a, b]) => (a === b ? cc(a) : `${cc(a)}-${cc(b)}`)).join("");
  return s.replace(new RegExp(`[${pattern}]`, "g"), "");
}

/** Clamp length and strip control / bidi-override chars before a name is
 * stored — the Account input already caps length, but a direct call
 * shouldn't be able to persist something oversized or layout-breaking that
 * then renders to every other player on the leaderboard. */
function sanitizeDisplayName(name: string | null): string | null {
  if (name == null) return null;
  const cleaned = stripControlAndBidiChars(name).trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/**
 * The signed-in account's own chosen display name, or null if they haven't
 * set one — the raw value (never the "Player 4821" placeholder), so callers
 * can tell "no name chosen yet" apart from an actual choice and fall back
 * however makes sense for where they're showing it (the Account page shows
 * the placeholder as a preview; New Game's seat-0 lock falls back to "You"
 * instead — see app/new-game/local/page.tsx).
 */
export async function fetchOwnDisplayName(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle<{ display_name: string | null }>();
  if (error) throw error;
  return data?.display_name?.trim() || null;
}

/** Thrown by updateLeaderboardDisplayName when migration 0024's unique
 * constraint rejects the name (Postgres code 23505) — callers should catch
 * this specifically to show "that name's taken" rather than a generic
 * save-failed error. */
export class DisplayNameTakenError extends Error {
  constructor() {
    super("That name is already taken.");
    this.name = "DisplayNameTakenError";
  }
}

// % and _ are ilike wildcards — escaped so a name containing either is
// matched literally instead of as a pattern.
function escapeIlikePattern(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/**
 * Best-effort, case-insensitive pre-check for the Account page to show an
 * immediate "taken" message before the user even hits Save — not the source
 * of truth. Two clients checking and saving at the same instant can both see
 * "available" here; migration 0024's unique constraint is what actually
 * decides, and updateLeaderboardDisplayName surfaces that as
 * DisplayNameTakenError.
 */
export async function isDisplayNameAvailable(
  supabase: SupabaseClient,
  name: string,
  excludeUserId: string
): Promise<boolean> {
  const cleaned = name.trim();
  if (!cleaned) return true;
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("user_id")
    .ilike("display_name", escapeIlikePattern(cleaned))
    .neq("user_id", excludeUserId)
    .maybeSingle();
  if (error) throw error;
  return !data;
}

/** Sets (or clears, with null) just the signed-in user's own display name —
 * never touches the stat columns, so it can't undo a sync still in flight.
 * Throws DisplayNameTakenError specifically when the name's already claimed
 * (see migration 0024's unique constraint) — every other failure rethrows
 * as-is. */
export async function updateLeaderboardDisplayName(
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    display_name: sanitizeDisplayName(displayName),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") throw new DisplayNameTakenError();
    throw error;
  }
}

/** Max stored bio length (migration 0021). Matches the DB CHECK and the
 * `maxLength` on the Account page's textarea. */
export const MAX_BIO_LENGTH = 140;

/** Same treatment as sanitizeDisplayName above — the Account textarea
 * already caps length, but a direct call shouldn't be able to persist
 * something oversized or layout-breaking that then renders in every other
 * player's OpponentStrip popover. */
function sanitizeBio(bio: string | null): string | null {
  if (bio == null) return null;
  const cleaned = stripControlAndBidiChars(bio).trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_BIO_LENGTH);
}

/** The signed-in account's own bio, or null if they haven't set one — same
 * shape as fetchOwnDisplayName above. */
export async function fetchOwnBio(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("bio")
    .eq("user_id", userId)
    .maybeSingle<{ bio: string | null }>();
  if (error) throw error;
  return data?.bio?.trim() || null;
}

/** Sets (or clears, with null) just the signed-in user's own bio — never
 * touches the stat columns, same as updateLeaderboardDisplayName above. */
export async function updateLeaderboardBio(supabase: SupabaseClient, userId: string, bio: string | null): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    bio: sanitizeBio(bio),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export interface AvatarInfo {
  kind: "emoji" | "photo";
  emoji: string | null;
  color: string | null;
  photoPath: string | null;
}


/** Thrown by updateLeaderboardAvatarFrame/Title/Banner/Badge when a
 * migration's trigger rejects a gated cosmetic the account hasn't earned
 * yet — the client-side lock check (cosmeticUnlocks.ts's
 * isCosmeticUnlocked) should normally catch this before the request ever
 * goes out, so seeing this in practice means that check and the server's
 * own (re-derived from the same underlying stats) disagreed, most likely
 * stale client-side progress data. */
export class CosmeticLockedError extends Error {
  constructor(public readonly cosmeticType: "avatar_frame" | "title" | "banner" | "badge") {
    super("You haven't unlocked that yet.");
    this.name = "CosmeticLockedError";
  }
}

/** Picks (or changes) the signed-in user's emoji+color avatar — switches
 * avatar_kind to "emoji" without touching avatar_photo_path, so a
 * previously-uploaded photo is still there if they switch back to it later
 * (see revertToPhotoAvatar). Both values are validated against the same
 * fixed lists the DB constrains them to (see migration 0024's own doc for
 * why the two must stay in sync). Free picks only — see
 * updateLeaderboardBadge for the earned, milestone-gated overlay. */
export async function updateLeaderboardAvatarEmoji(
  supabase: SupabaseClient,
  userId: string,
  emoji: string,
  color: string
): Promise<void> {
  if (!isValidEmoji(emoji) || !isValidColor(color)) {
    throw new Error("That avatar choice isn't one of the presets.");
  }
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    avatar_kind: "emoji",
    avatar_emoji: emoji,
    avatar_color: color,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Records a freshly-uploaded photo as the signed-in user's avatar and
 * switches avatar_kind to "photo" — called after the file itself has
 * already landed in the "avatars" Storage bucket (see avatarUpload.ts). */
export async function updateLeaderboardAvatarPhoto(
  supabase: SupabaseClient,
  userId: string,
  photoPath: string
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    avatar_kind: "photo",
    avatar_photo_path: photoPath,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Switches back to whichever emoji+color was last chosen, without
 * discarding the uploaded photo (avatar_photo_path is left as-is — a later
 * "use my photo" just flips avatar_kind back, no re-upload needed). */
export async function revertToEmojiAvatar(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    avatar_kind: "emoji",
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Sets (or clears, with null) the signed-in user's avatar frame — see
 * profileCosmetics.ts's AVATAR_FRAME_OPTIONS. Throws CosmeticLockedError
 * for a frame migration 0028's trigger rejects as not yet earned. */
export async function updateLeaderboardAvatarFrame(
  supabase: SupabaseClient,
  userId: string,
  frame: string | null
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    avatar_frame: frame,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.message?.includes("avatar_frame_locked")) throw new CosmeticLockedError("avatar_frame");
    throw error;
  }
}

/** Sets (or clears, with null) the signed-in user's nameplate title — see
 * profileCosmetics.ts's TITLE_OPTIONS. Throws CosmeticLockedError for a
 * title migration 0028's trigger rejects as not yet earned. */
export async function updateLeaderboardTitle(
  supabase: SupabaseClient,
  userId: string,
  title: string | null
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    title,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.message?.includes("title_locked")) throw new CosmeticLockedError("title");
    throw error;
  }
}

/** Sets (or clears, with null) the signed-in user's profile banner — see
 * bannerPresets.ts's BANNER_OPTIONS. Throws CosmeticLockedError for the
 * one gated banner ("grandmaster") when migration 0029's trigger rejects
 * it as not yet earned. */
export async function updateLeaderboardBanner(
  supabase: SupabaseClient,
  userId: string,
  banner: string | null
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    banner,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.message?.includes("banner_locked")) throw new CosmeticLockedError("banner");
    throw error;
  }
}

/** Sets (or clears, with null) the signed-in user's badge — an earned
 * overlay on the avatar's corner, separate from the avatar picture itself;
 * see avatarPresets.ts's PREMIUM_EMOJI_OPTIONS. Throws CosmeticLockedError
 * for a badge migration 0031's trigger rejects as not yet earned. */
export async function updateLeaderboardBadge(
  supabase: SupabaseClient,
  userId: string,
  badge: string | null
): Promise<void> {
  if (badge !== null && !isValidBadge(badge)) {
    throw new Error("That badge isn't one of the presets.");
  }
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    badge,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.message?.includes("badge_locked")) throw new CosmeticLockedError("badge");
    throw error;
  }
}

/**
 * Avatars for a set of other accounts, keyed by user_id — same shape and
 * reasoning as fetchBiosFor below (a direct read of the public table rather
 * than a dedicated RPC), used anywhere a list of other players needs their
 * avatar without a full profile fetch each (Leaderboard, Friends).
 */
export async function fetchAvatarsFor(supabase: SupabaseClient, userIds: string[]): Promise<Record<string, AvatarInfo>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("user_id, avatar_kind, avatar_emoji, avatar_color, avatar_photo_path")
    .in("user_id", userIds);
  if (error) throw error;
  const avatars: Record<string, AvatarInfo> = {};
  for (const row of (data ?? []) as {
    user_id: string;
    avatar_kind: "emoji" | "photo" | null;
    avatar_emoji: string | null;
    avatar_color: string | null;
    avatar_photo_path: string | null;
  }[]) {
    avatars[row.user_id] = {
      kind: row.avatar_kind ?? "emoji",
      emoji: row.avatar_emoji,
      color: row.avatar_color,
      photoPath: row.avatar_photo_path,
    };
  }
  return avatars;
}

export interface SeasonSnapshot {
  games_played: number;
  games_won: number;
}

/** The current season's key, e.g. "2026-09-01" — matches the UTC month
 * boundary snapshot_season_start() (migration 0044) snapshots against, so a
 * lookup against season_snapshots for this value always hits this month's
 * baseline. Computed from UTC (not local time) so this always agrees with
 * the server regardless of the visitor's own timezone. */
export function currentSeasonStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * This season's starting games_played/games_won baseline for a set of
 * accounts, keyed by user_id — see migration 0044's own doc. "This season"
 * for an account is its current (cumulative) leaderboard_entries numbers
 * minus this baseline; an account missing from the result was never
 * snapshotted yet (e.g. it didn't exist at the last snapshot), so its
 * baseline is 0 — meaning its full current total counts for this season,
 * which is correct since all of it happened within the season.
 */
export async function fetchSeasonSnapshots(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, SeasonSnapshot>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from("season_snapshots")
    .select("user_id, games_played, games_won")
    .eq("season_start", currentSeasonStart())
    .in("user_id", userIds);
  if (error) throw error;
  const snapshots: Record<string, SeasonSnapshot> = {};
  for (const row of (data ?? []) as { user_id: string; games_played: number; games_won: number }[]) {
    snapshots[row.user_id] = { games_played: row.games_played, games_won: row.games_won };
  }
  return snapshots;
}

/** The public URL for an uploaded avatar photo, from its Storage path — see
 * migration 0024's own doc for why the path (not a full URL) is what's
 * stored: this can be recomputed any time, so nothing goes stale. Every
 * re-upload overwrites the same fixed path (see avatarUpload.ts), so a
 * `version` (pass the row's own `updated_at`) is appended as a cache-buster
 * — without it, a browser or CDN that already cached the old image at that
 * URL would keep serving it after a new photo replaces it. */
export function avatarPhotoUrlFor(supabase: SupabaseClient, path: string, version?: string | null): string {
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

/** Max pinned trophies (migration 0026's own CHECK). */
export const MAX_SHOWCASE_ITEMS = 6;

/** Encodes one achievement instance as the "familyId:tier" string
 * showcase entries are stored as. */
export function showcaseKeyFor(familyId: string, tier: string): string {
  return `${familyId}:${tier}`;
}

/** Sets the signed-in user's pinned trophy case — up to MAX_SHOWCASE_ITEMS
 * "familyId:tier" strings (see showcaseKeyFor). The app only ever offers
 * the account's own already-unlocked achievements to pick from, but this
 * itself doesn't re-verify that server-side (see migration 0026's own doc
 * for why the showcase and the premium-emoji gate get different
 * treatment). */
export async function updateLeaderboardShowcase(
  supabase: SupabaseClient,
  userId: string,
  items: string[]
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    showcase: items.slice(0, MAX_SHOWCASE_ITEMS),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** The URL to a given account's public profile page — the one place this
 * path is spelled out, so every "click a name" link (Leaderboard, Friends)
 * stays consistent. A query param, not a dynamic route segment: this app is
 * a static export (see next.config.ts), and the Friends page's own
 * `?add=CODE` link already uses the same pattern. */
export function playerProfileHref(userId: string): string {
  return `/player?id=${encodeURIComponent(userId)}`;
}

/**
 * Bios for a set of other accounts, keyed by user_id — used to show a
 * multiplayer opponent's bio in OpponentStrip's popover (see
 * multiplayer/play/page.tsx). A missing/empty bio just isn't a key in the
 * returned map, so callers can use a plain `bios[userId]` lookup. Reads
 * leaderboard_entries directly (any-signed-in-user-can-read, same as every
 * other display_name lookup) rather than a dedicated RPC — nothing here is
 * more sensitive than what the Leaderboard page already shows wholesale.
 */
export async function fetchBiosFor(supabase: SupabaseClient, userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("user_id, bio")
    .in("user_id", userIds);
  if (error) throw error;
  const bios: Record<string, string> = {};
  for (const row of (data ?? []) as { user_id: string; bio: string | null }[]) {
    if (row.bio && row.bio.trim()) bios[row.user_id] = row.bio.trim();
  }
  return bios;
}

/**
 * Current display names for a set of accounts, keyed by user_id — every
 * multiplayer screen's fix for the same underlying gap: `mp_games.seats`
 * (and mp_history's own seats snapshot) bake in whatever each player's name
 * was at invite/creation time and never update it, so without a live
 * override here, changing your display name after a game already exists
 * leaves every screen for that game — the pending "waiting for players"
 * list, the active game itself, and its post-game history entry — showing
 * the stale one forever. Unlike fetchBiosFor, every requested id gets an
 * entry back (via displayNameFor's "Player 4821" fallback), since a seat
 * always needs *some* name shown.
 */
export async function fetchDisplayNamesFor(supabase: SupabaseClient, userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("user_id, display_name")
    .in("user_id", userIds);
  if (error) throw error;
  const found = new Map(
    ((data ?? []) as { user_id: string; display_name: string | null }[]).map((row) => [row.user_id, row.display_name])
  );
  const names: Record<string, string> = {};
  for (const id of userIds) {
    names[id] = displayNameFor({ user_id: id, display_name: found.get(id) ?? null });
  }
  return names;
}

/**
 * Broadcasts the signed-in user's current Daily Deal streak (see
 * dailyDealStore.ts) to their leaderboard row — called right after
 * GameOverScreen records a Daily Deal result locally, not from
 * syncLeaderboardStats above: unlike every other column on this table,
 * these don't come from player_stats/achievement_counters, they come
 * straight from localStorage, so there's nothing in Supabase for
 * syncLeaderboardStats to recompute them from. Only ever writes these three
 * columns (plus display_name's own untouched-by-this precedent), so it
 * can't clobber a sync still in flight the same way updateLeaderboardDisplayName
 * can't. Safe to call even for an account that's never played a single
 * real tracked game — upsert fills in every other column's own default
 * (0/null) for a first-ever partial insert. `lastPlayedDate` is what makes
 * pullDailyDealStreak below (and dailyDealStore.ts's mergeCloudDailyDealState)
 * actually work across devices — without it, a second device has no way to
 * tell whether the cloud's streak already accounts for today.
 */
export async function syncDailyDealStreak(
  supabase: SupabaseClient,
  userId: string,
  streak: number,
  bestStreak: number,
  lastPlayedDate: string
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    daily_deal_streak: streak,
    daily_deal_best_streak: bestStreak,
    daily_deal_last_played: lastPlayedDate,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

interface DailyDealCloudRow {
  daily_deal_streak: number;
  daily_deal_best_streak: number;
  daily_deal_last_played: string | null;
}

/**
 * Reads back the signed-in account's cloud Daily Deal record — the other
 * half of what actually fixes cross-device sync (see
 * dailyDealStore.ts's mergeCloudDailyDealState, which this is meant to feed
 * into). Called before computing/showing a streak on any device: Home (so
 * the displayed streak/played-today state reflects every device, not just
 * this one) and GameOverScreen (so a fresh result is computed against the
 * account's true last-played date, not just this device's own history).
 * Returns null for an account with no leaderboard row at all yet (never
 * played a Daily Deal or finished a real game on any device) — callers
 * treat that as "nothing to merge," not an error.
 */
export async function pullDailyDealStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<{ streak: number; bestStreak: number; lastPlayedDate: string | null } | null> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("daily_deal_streak, daily_deal_best_streak, daily_deal_last_played")
    .eq("user_id", userId)
    .maybeSingle<DailyDealCloudRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    streak: data.daily_deal_streak,
    bestStreak: data.daily_deal_best_streak,
    lastPlayedDate: data.daily_deal_last_played,
  };
}

/** Same shape/reasoning as syncDailyDealStreak — the Weekly Challenge's own
 * cloud record (migration 0039), weeks in place of days. */
export async function syncWeeklyChallengeStreak(
  supabase: SupabaseClient,
  userId: string,
  streak: number,
  bestStreak: number,
  lastPlayedWeek: string
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").upsert({
    user_id: userId,
    weekly_challenge_streak: streak,
    weekly_challenge_best_streak: bestStreak,
    weekly_challenge_last_played: lastPlayedWeek,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

interface WeeklyChallengeCloudRow {
  weekly_challenge_streak: number;
  weekly_challenge_best_streak: number;
  weekly_challenge_last_played: string | null;
}

/** Same shape/reasoning as pullDailyDealStreak — the Weekly Challenge's own
 * cloud record. */
export async function pullWeeklyChallengeStreak(
  supabase: SupabaseClient,
  userId: string
): Promise<{ streak: number; bestStreak: number; lastPlayedWeek: string | null } | null> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("weekly_challenge_streak, weekly_challenge_best_streak, weekly_challenge_last_played")
    .eq("user_id", userId)
    .maybeSingle<WeeklyChallengeCloudRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    streak: data.weekly_challenge_streak,
    bestStreak: data.weekly_challenge_best_streak,
    lastPlayedWeek: data.weekly_challenge_last_played,
  };
}

/** Max stored report reason length (migration 0025). */
export const MAX_REPORT_REASON_LENGTH = 280;

/**
 * Flags `reportedUserId`'s current profile photo for manual review (see
 * migration 0025 — there's no in-app read path for these, only the
 * Supabase dashboard/service role). Goes through the `report_profile_photo`
 * RPC (migration 0049) rather than a direct table insert, so it's
 * rate-limited server-side (`mp_bump_rate_limit`) — a plain client insert
 * couldn't stop one account from reporting many different targets in
 * quick succession. The RPC itself does `on conflict do nothing`, so
 * reporting the same account twice is still a harmless no-op.
 */
export async function reportProfilePhoto(
  supabase: SupabaseClient,
  reportedUserId: string,
  reason: string | null
): Promise<void> {
  const cleanedReason = reason ? stripControlAndBidiChars(reason).trim().slice(0, MAX_REPORT_REASON_LENGTH) : null;
  const { error } = await supabase.rpc("report_profile_photo", {
    p_reported_user_id: reportedUserId,
    p_reason: cleanedReason || null,
  });
  if (error) throw error;
}
