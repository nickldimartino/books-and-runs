import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { isPremiumEmojiUnlocked, isValidEmoji, PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";

function findPremium(emoji: string) {
  const found = PREMIUM_EMOJI_OPTIONS.find((o) => o.emoji === emoji);
  if (!found) throw new Error(`no premium option for ${emoji}`);
  return found;
}

describe("isValidEmoji", () => {
  it("accepts both free and premium emoji", () => {
    expect(isValidEmoji("😀")).toBe(true);
    expect(isValidEmoji("👑")).toBe(true);
  });

  it("rejects anything not in either list", () => {
    expect(isValidEmoji("🥕")).toBe(false);
  });
});

describe("isPremiumEmojiUnlocked", () => {
  it("gates a level-milestone emoji on the account's level", () => {
    const bronze = findPremium("🥉");
    expect(isPremiumEmojiUnlocked(bronze, 9, EMPTY_PROGRESS_STATE)).toBe(false);
    expect(isPremiumEmojiUnlocked(bronze, 10, EMPTY_PROGRESS_STATE)).toBe(true);
  });

  it("gates a category-mastery emoji on every family in that category reaching Expert", () => {
    const multiplayerCrown = findPremium("👑");
    // Nothing unlocked yet.
    expect(isPremiumEmojiUnlocked(multiplayerCrown, 0, EMPTY_PROGRESS_STATE)).toBe(false);

    // The multiplayer category's families read mpGamesPlayed/mpGamesWon/
    // mpBestWinStreak/mpWinRate (see achievements.ts) — maxing all four to
    // at least their Expert thresholds should unlock it.
    const mastered = {
      ...EMPTY_PROGRESS_STATE,
      mpGamesPlayed: 1000,
      mpGamesWon: 1000,
      mpBestWinStreak: 1000,
    };
    expect(isPremiumEmojiUnlocked(multiplayerCrown, 0, mastered)).toBe(true);
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
    expect(isPremiumEmojiUnlocked(multiplayerCrown, 0, masteredMeldingOnly)).toBe(false);
  });
});
