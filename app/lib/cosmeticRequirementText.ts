// Localized "how to unlock this" line for a locked cosmetic — the translated
// counterpart of cosmeticUnlocks.ts's English cosmeticRequirementLabel (which
// stays for framework-free callers and tests). Every rule kind maps to a
// dictionary key so the tooltip / tap-hint reads in the active language.
import type { AchievementCategory } from "@/achievements";
import type { CosmeticUnlockRule } from "./cosmeticUnlocks";
import type { TranslationKey } from "./i18n/keys";
import type { Vars } from "./i18n/LocaleProvider";

type T = (key: TranslationKey, vars?: Vars) => string;
type TPlural = (key: string, count: number, vars?: Vars) => string;

const CATEGORY_KEY: Record<AchievementCategory, TranslationKey> = {
  accountStats: "cosmeticReq.cat.accountStats",
  aiRivals: "cosmeticReq.cat.aiRivals",
  melding: "cosmeticReq.cat.melding",
  layingOff: "cosmeticReq.cat.layingOff",
  drawDiscard: "cosmeticReq.cat.drawDiscard",
  goingOut: "cosmeticReq.cat.goingOut",
  contracts: "cosmeticReq.cat.contracts",
  tableComposition: "cosmeticReq.cat.tableComposition",
  multiplayer: "cosmeticReq.cat.multiplayer",
  challenges: "cosmeticReq.cat.challenges",
};

/** Total achievement categories, for "Master N of {total}". */
const CATEGORY_TOTAL = Object.keys(CATEGORY_KEY).length;

export function cosmeticRequirementText(t: T, tPlural: TPlural, rule: CosmeticUnlockRule): string {
  switch (rule.kind) {
    case "level":
      return t("settingsPicker.unlocksAtLevel", { level: rule.level });
    case "categoryMastered":
      return t("cosmeticReq.categoryMastered", { category: t(CATEGORY_KEY[rule.category]) });
    case "categoriesMasteredCount":
      return t("cosmeticReq.categoriesMasteredCount", { count: rule.count, total: CATEGORY_TOTAL });
    case "allCategoriesMastered":
      return t("cosmeticReq.allCategoriesMastered");
    case "gamesPlayed":
      return t("cosmeticReq.gamesPlayed", { count: rule.count });
    case "dailyDealStreak":
      return t("cosmeticReq.dailyDealStreak", { days: rule.days });
    case "weeklyChallengeStreak":
      return t("cosmeticReq.weeklyChallengeStreak", { weeks: rule.weeks });
    case "complete":
      return t("cosmeticReq.complete");
    case "creatorOnly":
      return t("cosmeticReq.creatorOnly");
    case "supporterOnly":
      return t("cosmeticReq.supporterOnly");
    case "worstScoreUnder":
      return t("cosmeticReq.worstScoreUnder", { score: rule.score });
    case "averageScoreUnder":
      return t("cosmeticReq.averageScoreUnder", { score: rule.score, games: rule.minGames });
    case "gamesTied":
      return tPlural("cosmeticReq.gamesTied", rule.count);
    case "mpWinStreak":
      return t("cosmeticReq.mpWinStreak", { streak: rule.streak });
    case "boutique":
      return t("settingsPicker.boutiqueLocked");
  }
}
