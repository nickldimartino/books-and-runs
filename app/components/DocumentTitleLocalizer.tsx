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
  "/progress": "nav.progress",
  "/social": "nav.social",
  "/profile": "nav.profile",
};

export function DocumentTitleLocalizer() {
  const { t } = useT();
  const pathname = usePathname();
  useEffect(() => {
    const path = (pathname ?? "/").replace(/\/+$/, "") || "/";
    const key = PAGE_TITLE_KEYS[path];
    // Only routes with a translation key (and Home) are localized; every
    // other route keeps its own build-time <title> (routeMetadata.ts) rather
    // than being overwritten with the Home title.
    const title = key ? `${t(key)} — Books & Runs` : path === "/" ? t("meta.homeTitle") : null;
    const id = window.setTimeout(() => {
      const notFoundTitle = `${t("notFound.title")} — Books & Runs`;
      if (document.title.startsWith("Page not found") || document.title === notFoundTitle) {
        document.title = notFoundTitle;
      } else if (title) {
        document.title = title;
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [pathname, t]);
  return null;
}
