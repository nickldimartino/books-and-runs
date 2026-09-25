import type { Dictionary } from "./dictionaries/en";

/** Every valid translation key, derived from en.ts alone (the structural
 * source of truth) — a typo'd t("...") call anywhere in the app fails
 * `tsc`, the same way an unknown ThemeId/ColorblindMode would. */
export type TranslationKey = keyof Dictionary;
