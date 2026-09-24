// Shared unlock-requirement logic for every gated cosmetic — badge, avatar
// frame, title, and banner (see avatarPresets.ts/profileCosmetics.ts/
// bannerPresets.ts for each catalog). Computed client-side from an
// UnlockContext built out of whatever this account's own live data says,
// so this reads as one consistent unlock system rather than four
// hand-tuned copies of "what counts as earned."
//
// Mirrors, but isn't the source of truth for, migration 0028's (extended by
// 0042's) cosmetic_unlocks table — that's what actually decides on save
// (see leaderboardStore.ts's CosmeticLockedError). Keep both in sync if a
// requirement or a cosmetic option ever changes.

import { AchievementCategory, AchievementProgressState, allAchievements } from "@/achievements";

export type CosmeticUnlockRule =
  | { kind: "level"; level: number }
  | { kind: "categoryMastered"; category: AchievementCategory; categoryLabel: string }
  /** N of the 9 achievement categories fully mastered — a stepping stone
   * before allCategoriesMastered's "all of them." */
  | { kind: "categoriesMasteredCount"; count: number }
  | { kind: "allCategoriesMastered" }
  /** Solo/pass-and-play games played (leaderboard_entries.games_played) —
   * deliberately not games_played + mp_games_played: the MP count isn't
   * currently protected by a server-side trigger the way the solo one is
   * (see migration 0035), so gating a real reward on it would reopen
   * exactly the kind of self-reported-stats hole this app spent a whole
   * phase closing. */
  | { kind: "gamesPlayed"; count: number }
  /** leaderboard_entries.daily_deal_best_streak — server-verified, see
   * migration 0036. */
  | { kind: "dailyDealStreak"; days: number }
  /** leaderboard_entries.weekly_challenge_best_streak — server-verified,
   * see migration 0039. */
  | { kind: "weeklyChallengeStreak"; weeks: number }
  /** The single apex reward: every achievement category mastered, Level
   * 250, and a 30-day Daily Deal streak, all at once. */
  | { kind: "complete" }
  /** Exclusive to leaderboard_entries.is_creator — not earnable by anyone
   * else, at any level or achievement count. */
  | { kind: "creatorOnly" }
  /** Earned by having ever completed a tip — see migration 0043's
   * supporter_payments (server-verified, written only by the
   * stripe-webhook Edge Function) and app/tip/page.tsx. */
  | { kind: "supporterOnly" }
  /** leaderboard_entries.worst_score — server-verified via
   * sync_leaderboard_truth() (migration 0035, extended by 0050). Lower is
   * better in this game, so this is a consistency reward (never had a
   * disaster game); null (no scored game finished yet) never satisfies
   * it. */
  | { kind: "worstScoreUnder"; score: number }
  /** Same column family as worstScoreUnder, but the CAREER average
   * (average_score) instead of the single worst result — genuinely harder
   * to hold down across many games than to avoid one bad one. minGames
   * stops a lucky 2-3 game streak from qualifying. */
  | { kind: "averageScoreUnder"; score: number; minGames: number }
  /** player_stats.games_tied — a rare result in this game by design (see
   * its own "a rare result" label on the Stats page), so even a small
   * count is a genuine, slightly playful milestone. Server-verified the
   * same way every other player_stats field is (migration 0035/0048 —
   * only solo-verify's service-role key writes it). */
  | { kind: "gamesTied"; count: number }
  /** leaderboard_entries.mp_best_win_streak — server-verified as of
   * migration 0050. The first cosmetic gated on live multiplayer skill
   * specifically, rather than solo play or a Daily/Weekly streak. */
  | { kind: "mpWinStreak"; streak: number }
  /** A Boutique item (see boutiqueCatalog.test.tsx) — not earnable by
   * grinding, meant to eventually be a real purchase. No purchase flow
   * exists yet, so today this reads exactly like creatorOnly — is_creator
   * only — but is kept as its own kind rather than reusing creatorOnly
   * outright: creatorOnly also gates genuinely permanent creator-exclusive
   * items (Dealer's Table) that should never become purchasable, and
   * conflating the two would mean "flipping on" real payments later has to
   * carefully split them back apart. With a dedicated kind, flipping it on
   * is a single-branch change to cosmetic_unlocked() (checking a purchases
   * table instead of is_creator) — no catalog or cosmetic_unlocks row ever
   * has to move. */
  | { kind: "boutique" };

/** Everything a rule might need to check itself against. Callers that
 * don't have every field yet (e.g. allCosmetics.ts's before/after unlock-
 * toast diffing, which only ever tracked level + achievement progress)
 * can fall back to safe defaults via makeUnlockContext — a rule gated on a
 * field that reads as its default just never shows as "newly unlocked" via
 * that path, which is a reasonable gap: the item still unlocks correctly
 * the moment someone actually opens a picker with the real data loaded. */
export interface UnlockContext {
  level: number;
  progress: AchievementProgressState;
  gamesPlayed: number;
  dailyDealBestStreak: number;
  weeklyChallengeBestStreak: number;
  isCreator: boolean;
  isSupporter: boolean;
  /** leaderboard_entries.worst_score — null before any scored game. */
  worstScore: number | null;
  /** leaderboard_entries.average_score — null before any scored game. */
  averageScore: number | null;
  /** player_stats.games_tied. */
  gamesTied: number;
  /** leaderboard_entries.mp_best_win_streak. */
  mpBestWinStreak: number;
}

export function makeUnlockContext(
  partial: Partial<UnlockContext> & { level: number; progress: AchievementProgressState }
): UnlockContext {
  return {
    level: partial.level,
    progress: partial.progress,
    gamesPlayed: partial.gamesPlayed ?? 0,
    dailyDealBestStreak: partial.dailyDealBestStreak ?? 0,
    weeklyChallengeBestStreak: partial.weeklyChallengeBestStreak ?? 0,
    isCreator: partial.isCreator ?? false,
    isSupporter: partial.isSupporter ?? false,
    worstScore: partial.worstScore ?? null,
    averageScore: partial.averageScore ?? null,
    gamesTied: partial.gamesTied ?? 0,
    mpBestWinStreak: partial.mpBestWinStreak ?? 0,
  };
}

function categoryMastered(progress: AchievementProgressState, category: AchievementCategory): boolean {
  const inCategory = allAchievements(progress).filter((a) => a.category === category);
  return inCategory.length > 0 && inCategory.every((a) => a.tier !== "expert" || a.unlocked);
}

function masteredCategoryCount(progress: AchievementProgressState): number {
  const categories = new Set(allAchievements(progress).map((a) => a.category));
  let count = 0;
  for (const category of categories) if (categoryMastered(progress, category)) count++;
  return count;
}

function allCategoriesMastered(progress: AchievementProgressState): boolean {
  const categories = new Set(allAchievements(progress).map((a) => a.category));
  return categories.size > 0 && masteredCategoryCount(progress) === categories.size;
}

export function isCosmeticUnlocked(rule: CosmeticUnlockRule, ctx: UnlockContext): boolean {
  switch (rule.kind) {
    case "level":
      return ctx.level >= rule.level;
    case "categoryMastered":
      return categoryMastered(ctx.progress, rule.category);
    case "categoriesMasteredCount":
      return masteredCategoryCount(ctx.progress) >= rule.count;
    case "allCategoriesMastered":
      return allCategoriesMastered(ctx.progress);
    case "gamesPlayed":
      return ctx.gamesPlayed >= rule.count;
    case "dailyDealStreak":
      return ctx.dailyDealBestStreak >= rule.days;
    case "weeklyChallengeStreak":
      return ctx.weeklyChallengeBestStreak >= rule.weeks;
    case "complete":
      return ctx.level >= 250 && ctx.dailyDealBestStreak >= 30 && allCategoriesMastered(ctx.progress);
    case "creatorOnly":
      return ctx.isCreator;
    case "supporterOnly":
      return ctx.isSupporter;
    case "worstScoreUnder":
      return ctx.worstScore !== null && ctx.worstScore < rule.score;
    case "averageScoreUnder":
      return ctx.gamesPlayed >= rule.minGames && ctx.averageScore !== null && ctx.averageScore < rule.score;
    case "gamesTied":
      return ctx.gamesTied >= rule.count;
    case "mpWinStreak":
      return ctx.mpBestWinStreak >= rule.streak;
    case "boutique":
      return ctx.isCreator;
  }
}

/** A short "how to unlock this" line for a locked cosmetic's tooltip. */
export function cosmeticRequirementLabel(rule: CosmeticUnlockRule): string {
  switch (rule.kind) {
    case "level":
      return `Unlocks at Level ${rule.level}`;
    case "categoryMastered":
      return `Master every ${rule.categoryLabel} achievement`;
    case "categoriesMasteredCount":
      return `Master ${rule.count} of 9 achievement categories`;
    case "allCategoriesMastered":
      return "Master every achievement category";
    case "gamesPlayed":
      return `Play ${rule.count} solo/pass-and-play games`;
    case "dailyDealStreak":
      return `Reach a ${rule.days}-day Daily Deal streak`;
    case "weeklyChallengeStreak":
      return `Reach a ${rule.weeks}-week Weekly Challenge streak`;
    case "complete":
      return "Master every category, reach Level 250, and a 30-day Daily Deal streak";
    case "creatorOnly":
      return "Exclusive to the creator of Books & Runs";
    case "supporterOnly":
      return "Unlocked by tipping — see Settings → Help → Support the developer";
    case "worstScoreUnder":
      return `Never finish a game above ${rule.score} points`;
    case "averageScoreUnder":
      return `Average under ${rule.score} points across ${rule.minGames}+ games`;
    case "gamesTied":
      return `Tie ${rule.count} game${rule.count === 1 ? "" : "s"}`;
    case "mpWinStreak":
      return `Reach a ${rule.streak}-game multiplayer win streak`;
    case "boutique":
      return "Boutique — not yet available for purchase";
  }
}
