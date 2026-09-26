"use client";

// Owns which locale's dictionary is currently loaded and exposes t()/
// tPlural() to the rest of the app via useT() below. Mounted once in
// app/layout.tsx, wrapping everything.
//
// The active locale ID itself is owned by localeStore.ts (load/save/apply,
// same pattern as themeStore.ts) and applied to <html> synchronously
// before first paint by public/init.js — this provider's own job is
// narrower: once mounted, read whatever locale init.js already applied,
// then load that locale's translated strings. English ships eagerly in
// the main bundle (it's the fallback every other locale falls back to on
// a missing key), every other locale is a dynamic import() — a signed-out
// visitor who's never touched Settings never downloads the other 9.
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { onAccountSettingsSynced } from "../accountSettingsSync";
import { applyLocale, DEFAULT_LOCALE, LocaleId, loadLocalLocale, saveLocalLocale } from "../localeStore";
import type { TranslationKey } from "./keys";
import en from "./dictionaries/en";

type Dict = Record<string, string>;

const DICTIONARY_LOADERS: Record<LocaleId, () => Promise<{ default: Dict }>> = {
  en: () => Promise.resolve({ default: en }),
  zh: () => import("./dictionaries/zh"),
  ja: () => import("./dictionaries/ja"),
  ko: () => import("./dictionaries/ko"),
  de: () => import("./dictionaries/de"),
  fr: () => import("./dictionaries/fr"),
  es: () => import("./dictionaries/es"),
  "pt-BR": () => import("./dictionaries/pt-BR"),
  ru: () => import("./dictionaries/ru"),
  it: () => import("./dictionaries/it"),
};

/** For screens outside the provider (global-error.tsx replaces the root
 * layout): loads a locale's dictionary and returns a standalone t(). */
export async function loadTranslator(locale: LocaleId): Promise<(key: TranslationKey, vars?: Vars) => string> {
  let d: Dict = en;
  try {
    d = (await DICTIONARY_LOADERS[locale]()).default;
  } catch {
    /* fall back to English */
  }
  return (key, vars) => interpolate(d[key] ?? en[key] ?? key, vars);
}

/** Dev-only pseudo-locale switch (see pseudoLocale.ts). Always false in
 * production builds, and the pseudo module is then dead-code-eliminated. */
function pseudoRequested(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "xx") window.localStorage.setItem("booksAndRuns:pseudoLocale", "1");
    else if (q) window.localStorage.removeItem("booksAndRuns:pseudoLocale");
    return window.localStorage.getItem("booksAndRuns:pseudoLocale") === "1";
  } catch {
    return false;
  }
}

export type Vars = Record<string, string | number>;

interface LocaleContextValue {
  locale: LocaleId;
  /** Persists (localeStore) + applies (data-lang/<html lang>) + loads the
   * new dictionary. The Settings picker calls this directly instead of
   * juggling the three steps itself. */
  setLocale: (id: LocaleId) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  /** Picks the right plural form for `count` via Intl.PluralRules (CLDR-
   * accurate per locale — e.g. Russian's one/few/many/other, not just
   * English's one/other) and looks up "<key>.<category>", falling back to
   * "<key>.other" if this locale has no sibling key for that exact
   * category. */
  tPlural: (key: string, count: number, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleId] = useState<LocaleId>(DEFAULT_LOCALE);
  const [dict, setDict] = useState<Dict>(en);
  const [pseudo, setPseudo] = useState(false);

  // Picks up whatever init.js already applied before first paint — a
  // plain client mount effect, not a layout effect, since data-lang is
  // already correct by the time React hydrates; this only needs to sync
  // React's own idea of the locale (for the dictionary fetch below) with
  // the DOM attribute that's already there.
  useEffect(() => {
    if (pseudoRequested()) setPseudo(true);
    setLocaleId(loadLocalLocale());
    // Re-reads after AccountSettingsSync.tsx pulls a signed-in account's
    // saved language down onto this device — applyAccountSettings()
    // already updates the DOM attribute directly, but this provider's own
    // React state (and thus which dictionary it's loaded) only tracks
    // whatever localStorage said at mount time otherwise.
    return onAccountSettingsSynced(() => setLocaleId(loadLocalLocale()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (process.env.NODE_ENV !== "production" && pseudo) {
      import("./pseudoLocale").then((m) => {
        if (!cancelled) setDict(m.buildPseudoDictionary(en));
      });
      return () => {
        cancelled = true;
      };
    }
    DICTIONARY_LOADERS[locale]()
      .then((mod) => {
        if (!cancelled) setDict(mod.default);
      })
      .catch(() => {
        // A locale dictionary that fails to load (offline mid-switch, a
        // bad deploy) just leaves the previous dictionary in place rather
        // than blanking every string on the page.
      });
    return () => {
      cancelled = true;
    };
  }, [locale, pseudo]);

  function setLocale(id: LocaleId) {
    saveLocalLocale(id);
    applyLocale(id);
    setLocaleId(id);
  }

  const t = useMemo(
    () => (key: TranslationKey, vars?: Vars) => interpolate(dict[key] ?? en[key] ?? key, vars),
    [dict]
  );

  const tPlural = useMemo(
    () => (key: string, count: number, vars?: Vars) => {
      let category: Intl.LDMLPluralRule = "other";
      try {
        category = new Intl.PluralRules(locale).select(count);
      } catch {
        // An unrecognized locale tag (shouldn't happen — LocaleId is a
        // closed union) falls back to "other" rather than throwing.
      }
      const template =
        dict[`${key}.${category}`] ??
        dict[`${key}.other`] ??
        en[`${key}.${category}` as TranslationKey] ??
        en[`${key}.other` as TranslationKey] ??
        key;
      return interpolate(template, { count, ...vars });
    },
    [dict, locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t, tPlural }), [locale, t, tPlural]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// A plain-English fallback for any render tree that mounts a component
// using useT() without going through the real <LocaleProvider> — every
// real page does (see app/layout.tsx), so this only ever matters for
// component tests, which render a component in isolation and shouldn't
// each have to know it secretly needs a locale provider. Keeps existing
// tests' English-text assertions working unchanged rather than forcing a
// wrapper onto every test that touches a translated component.
export const FALLBACK_CONTEXT: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, vars) => interpolate(en[key] ?? key, vars),
  tPlural: (key, count, vars) => {
    let category: Intl.LDMLPluralRule = "other";
    try {
      category = new Intl.PluralRules(DEFAULT_LOCALE).select(count);
    } catch {
      // Falls back to "other" below.
    }
    const template = en[`${key}.${category}` as TranslationKey] ?? en[`${key}.other` as TranslationKey] ?? key;
    return interpolate(template, { count, ...vars });
  },
};

export function useT(): LocaleContextValue {
  return useContext(LocaleContext) ?? FALLBACK_CONTEXT;
}
