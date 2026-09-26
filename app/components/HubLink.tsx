"use client";

// One row on a hub page (Progress / Social / Profile): icon, title, one-line
// description, an optional count badge and a chevron. Tall enough (56px+) for
// a comfortable tap, and a plain <Link> for keyboard / gamepad focus.

import Link from "next/link";
import type { ReactNode } from "react";

const SVG = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
  "aria-hidden": true,
};

export const HubIcons = {
  achievements: (
    <svg {...SVG}>
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z" />
    </svg>
  ),
  leaderboard: (
    <svg {...SVG}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
    </svg>
  ),
  stats: (
    <svg {...SVG}>
      <path d="M4 20V11M10 20V5M16 20v-7M21 20H3" />
    </svg>
  ),
  friends: (
    <svg {...SVG}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c1.9.7 3 2.6 3 5.6" />
    </svg>
  ),
  clubs: (
    <svg {...SVG}>
      <path d="M12 3l8 4v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7l8-4z" />
    </svg>
  ),
  tournaments: (
    <svg {...SVG}>
      <path d="M5 4v16M5 5h11l-2 3.5 2 3.5H5" />
    </svg>
  ),
  play: (
    <svg {...SVG}>
      <path d="M8 5l11 7-11 7V5z" />
    </svg>
  ),
  profile: (
    <svg {...SVG}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.6-3.9 3.6-6 7.5-6s6.9 2.1 7.5 6" />
    </svg>
  ),
  account: (
    <svg {...SVG}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  settings: (
    <svg {...SVG}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  ),
};

export function HubLink({
  href,
  title,
  description,
  icon,
  badge,
}: {
  href: string;
  title: string;
  description?: string;
  icon: ReactNode;
  /** A small count (e.g. pending friend requests); omitted when 0. */
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--heading)]">{title}</span>
        {description && <span className="block text-xs text-[var(--muted)]">{description}</span>}
      </span>
      {!!badge && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-bold leading-none text-[var(--on-accent)]">
          {badge}
        </span>
      )}
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[var(--faint)]" aria-hidden="true">
        <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
