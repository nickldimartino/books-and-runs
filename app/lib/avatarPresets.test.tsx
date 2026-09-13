import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { makeUnlockContext } from "./cosmeticUnlocks";
import { isPremiumEmojiUnlocked, isValidBadge, isValidEmoji, PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";

function findPremium(emoji: string) {
  const found = PREMIUM_EMOJI_OPTIONS.find((o) => o.emoji === emoji);
  if (!found) throw new Error(`no premium option for ${emoji}`);
  return found;
}

function ctx(overrides: Partial<Parameters<typeof makeUnlockContext>[0]> = {}) {
  return makeUnlockContext({ level: 0, progress: EMPTY_PROGRESS_STATE, ...overrides });
}

describe("isValidEmoji", () => {
  it("accepts a free emoji", () => {
    expect(isValidEmoji("😀")).toBe(true);
  });

  it("rejects a premium (badge-only) emoji — that's isValidBadge's job now", () => {
    expect(isValidEmoji("👑")).toBe(false);
  });

  it("rejects anything not in the free list", () => {
    expect(isValidEmoji("🥕")).toBe(false);
  });
});

describe("isValidBadge", () => {
  it("accepts a premium emoji", () => {
    expect(isValidBadge("👑")).toBe(true);
  });

  it("rejects a free emoji", () => {
    expect(isValidBadge("😀")).toBe(false);
  });
});

describe("isPremiumEmojiUnlocked", () => {
  it("gates a level-milestone emoji on the account's level", () => {
    const bronze = findPremium("🥉");
    expect(isPremiumEmojiUnlocked(bronze, ctx({ level: 9 }))).toBe(false);
    expect(isPremiumEmojiUnlocked(bronze, ctx({ level: 10 }))).toBe(true);
  });

  it("gates a category-mastery emoji on every family in that category reaching Expert", () => {
    const multiplayerCrown = findPremium("👑");
    // Nothing unlocked yet.
    expect(isPremiumEmojiUnlocked(multiplayerCrown, ctx())).toBe(false);

    // The multiplayer category's families read mpGamesPlayed/mpGamesWon/
    // mpBestWinStreak/mpWinRate (see achievements.ts) — maxing all four to
    // at least their Expert thresholds should unlock it.
    const mastered = {
      ...EMPTY_PROGRESS_STATE,
      mpGamesPlayed: 1000,
      mpGamesWon: 1000,
      mpBestWinStreak: 1000,
    };
    expect(isPremiumEmojiUnlocked(multiplayerCrown, ctx({ progress: mastered }))).toBe(true);
  });

  it("doesn't unlock a category emoji from mastering a different category", () => {
    const multiplayerCrown = findPremium("👑");
    const masteredMeldingOnly = {
      ...EMPTY_PROGRESS_STATE,
      counters: {
        books_melded: 1000,
        runs_melded: 1000,
        oversized_books_melded: 1000,
        oversized_runs_melded: 1000,
        wilds_used_in_melds: 1000,
        melds_with_zero_wilds: 1000,
      },
    };
    expect(isPremiumEmojiUnlocked(multiplayerCrown, ctx({ progress: masteredMeldingOnly }))).toBe(false);
  });

  it("gates the new Epic/Mythic/Prismatic badges on their own dimensions", () => {
    expect(isPremiumEmojiUnlocked(findPremium("⚔️"), ctx({ gamesPlayed: 500 }))).toBe(true);
    expect(isPremiumEmojiUnlocked(findPremium("⚔️"), ctx({ gamesPlayed: 499 }))).toBe(false);
    expect(isPremiumEmojiUnlocked(findPremium("🏮"), ctx({ dailyDealBestStreak: 30 }))).toBe(true);
    expect(isPremiumEmojiUnlocked(findPremium("🏆"), ctx({ weeklyChallengeBestStreak: 12 }))).toBe(true);
  });
});
