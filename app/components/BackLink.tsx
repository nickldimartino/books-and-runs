"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { labelKeyFor, previousPath } from "../lib/navTrail";

// The "← X" pill in the top-left corner of nearly every page — the same
// className was hand-copied verbatim into 25+ page files (and one
// how-to-play/BackLink.tsx already existed as its own one-off extraction of
// it) before being pulled into one shared component here. Covers both the
// common case (a plain destination href) and the handful of pages that need
// a custom onClick instead (router.back(), or app/player/page.tsx's
// history-aware "back if there's history, else Home").
const CLASS_NAME =
  "self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]";

interface BackLinkProps {
  /** Destination for the common case — ignored if `onClick` is given. */
  href?: string;
  /** Escape hatch for pages that need custom navigation logic (router.back(),
   * a conditional fallback, etc.) instead of a fixed destination. */
  onClick?: () => void;
  /** Text after "← " — defaults to "Home", the overwhelmingly common case. */
  label?: ReactNode;
  /** Go back to the in-app page you came from (lib/navTrail.ts), using `href`
   * only when there is none — a page opened directly or in a fresh tab. */
  smart?: boolean;
}

/** The trail-aware destination: where you came from, else `fallback`. The
 * label names the destination ("← Progress"). Resolved after mount
 * (sessionStorage isn't there on the server), so the server and first client
 * render agree on `fallback`. */
export function useSmartBack(fallback: string, enabled = true): { href: string; labelKey: TranslationKey } {
  const pathname = usePathname();
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    setTarget(enabled ? previousPath(pathname) : null);
  }, [enabled, pathname]);
  const href = target ?? fallback;
  return { href, labelKey: labelKeyFor(href) };
}

export function BackLink({ href, onClick, label, smart = false }: BackLinkProps) {
  const { t } = useT();
  const back = useSmartBack(href ?? "/", smart && !onClick);
  const resolvedLabel = smart
    ? back.href !== (href ?? "/") || !label
      ? t(back.labelKey)
      : label
    : (label ?? t("common.home"));
  if (onClick) {
    return (
      <button onClick={onClick} className={CLASS_NAME}>
        ← {resolvedLabel}
      </button>
    );
  }
  return (
    <Link href={smart ? back.href : (href ?? "/")} className={CLASS_NAME}>
      ← {resolvedLabel}
    </Link>
  );
}

/** The quiet "Back to Home" link at the foot of a page, trail-aware like
 * BackLink: names and links the page you came from ("← Progress"), falling
 * back to `fallback` (Home shows the classic "Back to Home"). */
export function BottomBackLink({ fallback = "/", className }: { fallback?: string; className?: string }) {
  const { t } = useT();
  const back = useSmartBack(fallback, true);
  const home = back.href === "/";
  return (
    <Link href={back.href} className={className ?? "text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"}>
      {home ? t("common.backToHome") : `← ${t(back.labelKey)}`}
    </Link>
  );
}
