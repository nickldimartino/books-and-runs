// The site's display language — a `[data-lang]` value on <html>, same
// "apply once via a data attribute, localStorage-backed" pattern as
// themeStore.ts/colorblindStore.ts. `applyLocale` sets the attribute
// (and `<html lang>`) directly — instant, no React re-render needed for
// the attribute itself. public/init.js re-applies the saved choice before
// first paint so there's no flash; LocaleProvider.tsx (app/lib/i18n/) is
// what actually loads that locale's translated strings.

import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

export type LocaleId = "en" | "zh" | "ja" | "ko" | "de" | "fr" | "es" | "pt-BR" | "ru" | "it";

export interface LocaleOption {
  id: LocaleId;
  /** English name, for contexts where the UI itself hasn't switched yet
   * (e.g. a signed-out visitor's browser-language guess before they've
   * ever opened Settings). */
  name: string;
  /** The language's own name for itself — shown in the Settings picker
   * so every option is legible to someone who already reads it,
   * regardless of which language the picker itself is currently in. */
  nativeName: string;
  flag: string;
}

export const LOCALES: readonly LocaleOption[] = [
  { id: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { id: "zh", name: "Simplified Chinese", nativeName: "中文", flag: "🇨🇳" },
  { id: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { id: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { id: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { id: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { id: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { id: "pt-BR", name: "Brazilian Portuguese", nativeName: "Português", flag: "🇧🇷" },
  { id: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { id: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
] as const;

export const DEFAULT_LOCALE: LocaleId = "en";

const KEY = "booksAndRuns:locale";

export function loadLocalLocale(): LocaleId {
  const raw = readLocalStorage(KEY);
  return LOCALES.some((l) => l.id === raw) ? (raw as LocaleId) : DEFAULT_LOCALE;
}

export function saveLocalLocale(locale: LocaleId): void {
  writeLocalStorage(KEY, locale);
}

export function applyLocale(locale: LocaleId): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.setAttribute("data-lang", locale);
}

export function findLocale(id: string | null | undefined): LocaleOption | null {
  return LOCALES.find((l) => l.id === id) ?? null;
}
