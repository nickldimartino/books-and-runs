"use client";

import Link from "next/link";
import { ReactNode } from "react";

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
}

export function BackLink({ href, onClick, label = "Home" }: BackLinkProps) {
  if (onClick) {
    return (
      <button onClick={onClick} className={CLASS_NAME}>
        ← {label}
      </button>
    );
  }
  return (
    <Link href={href ?? "/"} className={CLASS_NAME}>
      ← {label}
    </Link>
  );
}
