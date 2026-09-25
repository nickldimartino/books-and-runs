import type { TranslationKey } from "../lib/i18n/keys";
import type { CosmeticUnlockRule } from "../lib/cosmeticUnlocks";
import { cosmeticRequirementText } from "../lib/cosmeticRequirementText";

// Cosmetic *names* (theme/card back/card face) stay English everywhere, but
// their one-line descriptions (tooltips) are real sentences, so each is a
// dictionary key of the form <namespace>.desc.<id>. The key sets are
// verified by the dictionary key-parity test/typecheck for every id in the
// catalogs, so the casts below are safe.
export const themeDescKey = (id: string) => `settingsTheme.desc.${id}` as TranslationKey;
export const cardBackDescKey = (id: string) => `settingsCardBack.desc.${id}` as TranslationKey;
export const cardFaceDescKey = (id: string) => `settingsCardFace.desc.${id}` as TranslationKey;

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Localized "how to unlock" tooltip for a locked card face/back. */
export function cardUnlockText(t: T, tPlural: (key: string, count: number, vars?: Record<string, string | number>) => string, rule: CosmeticUnlockRule): string {
  return cosmeticRequirementText(t, tPlural, rule);
}
