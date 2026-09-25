"use client";

// The static-export `metadata` titles are English-only (they're baked into
// the HTML at build time), so once the app is running this re-sets
// document.title in the active language for the routes that have one.
// Runs after a tick because Next's own metadata handling can rewrite the
// title right after a client navigation.
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { TranslationKey } from "../lib/i18n/keys";
import { useT } from "../lib/i18n/LocaleProvider";

const PAGE_TITLE_KEYS: Record<string, TranslationKey> = {
  "/how-to-play": "howToPlay.title",
  "/history": "history.title",
  "/terms": "terms.title",
  "/privacy": "privacy.title",
};

export function DocumentTitleLocalizer() {
  const { t } = useT();
  const pathname = usePathname();
  useEffect(() => {
    const path = (pathname ?? "/").replace(/\/+$/, "") || "/";
    const key = PAGE_TITLE_KEYS[path];
    const title = key ? `${t(key)} — Books & Runs` : path === "/not-found" ? null : t("meta.homeTitle");
    if (!title) return;
    const id = window.setTimeout(() => {
      document.title = document.title.startsWith("Page not found") || document.title === t("notFound.title") + " — Books & Runs"
        ? `${t("notFound.title")} — Books & Runs`
        : title;
    }, 50);
    return () => window.clearTimeout(id);
  }, [pathname, t]);
  return null;
}
