import { describe, expect, it } from "vitest";
import en from "./i18n/dictionaries/en";
import ja from "./i18n/dictionaries/ja";
import ru from "./i18n/dictionaries/ru";
import { cosmeticRequirementText } from "./cosmeticRequirementText";
import type { CosmeticUnlockRule } from "./cosmeticUnlocks";

const RULES: CosmeticUnlockRule[] = [
  { kind: "level", level: 10 },
  { kind: "categoryMastered", category: "challenges", categoryLabel: "Challenges" },
  { kind: "categoriesMasteredCount", count: 3 },
  { kind: "allCategoriesMastered" },
  { kind: "gamesPlayed", count: 100 },
  { kind: "dailyDealStreak", days: 7 },
  { kind: "weeklyChallengeStreak", weeks: 12 },
  { kind: "complete" },
  { kind: "creatorOnly" },
  { kind: "supporterOnly" },
  { kind: "worstScoreUnder", score: 120 },
  { kind: "averageScoreUnder", score: 70, minGames: 15 },
  { kind: "gamesTied", count: 1 },
  { kind: "gamesTied", count: 5 },
  { kind: "mpWinStreak", streak: 8 },
  { kind: "boutique" },
];

function translator(d: Record<string, string>, locale: string) {
  const interp = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, n) => (v && n in v ? String(v[n]) : m));
  return {
    t: (k: string, v?: Record<string, string | number>) => interp(d[k] ?? k, v),
    tPlural: (k: string, n: number, v?: Record<string, string | number>) =>
      interp(d[`${k}.${new Intl.PluralRules(locale).select(n)}`] ?? d[`${k}.other`] ?? k, { count: n, ...v }),
  };
}

describe("cosmeticRequirementText", () => {
  for (const [name, dict, locale] of [["en", en, "en"], ["ja", ja, "ja"], ["ru", ru, "ru"]] as const) {
    it(`resolves every rule kind in ${name} with no raw keys or unfilled placeholders`, () => {
      const { t, tPlural } = translator(dict as Record<string, string>, locale);
      for (const rule of RULES) {
        const text = cosmeticRequirementText(t as never, tPlural, rule);
        expect(text, JSON.stringify(rule)).not.toMatch(/cosmeticReq\.|settingsPicker\./);
        expect(text, JSON.stringify(rule)).not.toMatch(/\{\w+\}/);
      }
    });
  }

  it("matches the English label's wording for the English dictionary", () => {
    const { t, tPlural } = translator(en as Record<string, string>, "en");
    expect(cosmeticRequirementText(t as never, tPlural, { kind: "level", level: 10 })).toBe("Unlocks at Level 10");
    expect(cosmeticRequirementText(t as never, tPlural, { kind: "gamesTied", count: 1 })).toBe("Tie 1 game");
    expect(cosmeticRequirementText(t as never, tPlural, { kind: "gamesTied", count: 3 })).toBe("Tie 3 games");
  });
});
