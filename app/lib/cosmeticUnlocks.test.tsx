import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { cosmeticRequirementLabel, isCosmeticUnlocked } from "./cosmeticUnlocks";

describe("isCosmeticUnlocked", () => {
  it("gates a level rule on the given level", () => {
    const rule = { kind: "level" as const, level: 25 };
    expect(isCosmeticUnlocked(rule, 24, EMPTY_PROGRESS_STATE)).toBe(false);
    expect(isCosmeticUnlocked(rule, 25, EMPTY_PROGRESS_STATE)).toBe(true);
  });

  it("gates a categoryMastered rule on every family in that category reaching Expert", () => {
    const rule = { kind: "categoryMastered" as const, category: "multiplayer" as const, categoryLabel: "Multiplayer" };
    expect(isCosmeticUnlocked(rule, 0, EMPTY_PROGRESS_STATE)).toBe(false);
    const mastered = { ...EMPTY_PROGRESS_STATE, mpGamesPlayed: 1000, mpGamesWon: 1000, mpBestWinStreak: 1000 };
    expect(isCosmeticUnlocked(rule, 0, mastered)).toBe(true);
  });

  it("gates an allCategoriesMastered rule on literally every category", () => {
    const rule = { kind: "allCategoriesMastered" as const };
    const onlyMultiplayerMastered = { ...EMPTY_PROGRESS_STATE, mpGamesPlayed: 1000, mpGamesWon: 1000, mpBestWinStreak: 1000 };
    expect(isCosmeticUnlocked(rule, 0, onlyMultiplayerMastered)).toBe(false);
  });
});

describe("cosmeticRequirementLabel", () => {
  it("describes each rule kind", () => {
    expect(cosmeticRequirementLabel({ kind: "level", level: 50 })).toContain("50");
    expect(
      cosmeticRequirementLabel({ kind: "categoryMastered", category: "melding", categoryLabel: "Melding" })
    ).toContain("Melding");
    expect(cosmeticRequirementLabel({ kind: "allCategoriesMastered" })).toContain("every");
  });
});
