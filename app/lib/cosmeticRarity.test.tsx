import { describe, expect, it } from "vitest";
import { defaultRarityForUnlock } from "./cosmeticRarity";

describe("defaultRarityForUnlock", () => {
  it("returns common for an absent rule (a plain free pick)", () => {
    expect(defaultRarityForUnlock(undefined)).toBe("common");
  });

  it("buckets level milestones to match every existing item's Phase 1 tier", () => {
    expect(defaultRarityForUnlock({ kind: "level", level: 10 })).toBe("uncommon"); // 🥉
    expect(defaultRarityForUnlock({ kind: "level", level: 25 })).toBe("uncommon"); // 🥈
    expect(defaultRarityForUnlock({ kind: "level", level: 50 })).toBe("rare"); // 🥇
    expect(defaultRarityForUnlock({ kind: "level", level: 100 })).toBe("rare"); // 💎
    expect(defaultRarityForUnlock({ kind: "level", level: 150 })).toBe("epic");
    expect(defaultRarityForUnlock({ kind: "level", level: 250 })).toBe("mythic"); // ascendant
  });

  it("treats every categoryMastered badge as rare", () => {
    expect(defaultRarityForUnlock({ kind: "categoryMastered", category: "melding", categoryLabel: "Melding" })).toBe(
      "rare"
    );
  });

  it("buckets categoriesMasteredCount with a stepping-stone tier below specialist", () => {
    expect(defaultRarityForUnlock({ kind: "categoriesMasteredCount", count: 1 })).toBe("uncommon");
    expect(defaultRarityForUnlock({ kind: "categoriesMasteredCount", count: 3 })).toBe("epic"); // specialist
    expect(defaultRarityForUnlock({ kind: "categoriesMasteredCount", count: 6 })).toBe("mythic"); // virtuoso
  });

  it("treats allCategoriesMastered (grandmaster) as mythic, one tier below the sole apex", () => {
    expect(defaultRarityForUnlock({ kind: "allCategoriesMastered" })).toBe("mythic");
  });

  it("treats complete (prismatic) as the sole apex", () => {
    expect(defaultRarityForUnlock({ kind: "complete" })).toBe("apex");
  });

  it("buckets gamesPlayed with room for an on-ramp and a further stretch goal", () => {
    expect(defaultRarityForUnlock({ kind: "gamesPlayed", count: 100 })).toBe("uncommon");
    expect(defaultRarityForUnlock({ kind: "gamesPlayed", count: 500 })).toBe("epic"); // ironwill
    expect(defaultRarityForUnlock({ kind: "gamesPlayed", count: 1500 })).toBe("mythic");
  });

  it("buckets dailyDealStreak to match unbroken (mythic at 30 days)", () => {
    expect(defaultRarityForUnlock({ kind: "dailyDealStreak", days: 7 })).toBe("uncommon");
    expect(defaultRarityForUnlock({ kind: "dailyDealStreak", days: 30 })).toBe("mythic"); // unbroken
  });

  it("buckets weeklyChallengeStreak to match undefeated (mythic at 12 weeks)", () => {
    expect(defaultRarityForUnlock({ kind: "weeklyChallengeStreak", weeks: 4 })).toBe("rare");
    expect(defaultRarityForUnlock({ kind: "weeklyChallengeStreak", weeks: 12 })).toBe("mythic"); // undefeated
  });

  it("treats creatorOnly/supporterOnly as rare — provenance-gated, not grind-tiered", () => {
    expect(defaultRarityForUnlock({ kind: "creatorOnly" })).toBe("rare");
    expect(defaultRarityForUnlock({ kind: "supporterOnly" })).toBe("rare");
  });

  it("treats boutique as rare, matching the first boutique badges' own explicit override", () => {
    expect(defaultRarityForUnlock({ kind: "boutique" })).toBe("rare");
  });
});
