"use client";

// Persistent app navigation, mounted once in the root layout: a bottom tab bar
// on phones/tablets (< 1024px) and a left rail on desktop. Four tabs — Play
// (Home), Progress, Social, Profile — each a plain <Link>, so keyboard,
// screen-reader and the gamepad spatial-navigation layer treat them like any
// other control.
//
// Visibility is a pure function of the pathname (lib/navVisibility.ts), so the
// static export prerenders the right thing per route and nothing pops in after
// hydration. While the first-visit intro plays, or a modal dialog is open, CSS
// hides it (globals.css, `.app-nav`). While it is present, globals.css pads
// <body> (`body:has(.app-nav)`) so page content never hides behind it.
//
// Badges: Social shows pending friend requests, Play shows games waiting on
// you + invites — both from the shared notifications context.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { NavTab, navStateFor } from "../lib/navVisibility";
import { useSharedNotifications } from "../lib/NotificationsContext";
import { badgeLabel } from "../lib/notificationItems";

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-6 w-6",
  "aria-hidden": true,
};

const ICONS: Record<NavTab, ReactNode> = {
  play: (
    <svg {...ICON_PROPS}>
      <rect x="4.5" y="3.5" width="11" height="15" rx="2" />
      <path d="M9 4.5l6.2-1.4a2 2 0 0 1 2.4 1.5l2.6 11.4a2 2 0 0 1-1.5 2.4L14 19.8" />
    </svg>
  ),
  progress: (
    <svg {...ICON_PROPS}>
      <path d="M4 20V11M10 20V5M16 20v-7M21 20H3" />
    </svg>
  ),
  social: (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c1.9.7 3 2.6 3 5.6" />
    </svg>
  ),
  profile: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.6-3.9 3.6-6 7.5-6s6.9 2.1 7.5 6" />
    </svg>
  ),
};

const TABS: { id: NavTab; href: string; labelKey: TranslationKey }[] = [
  { id: "play", href: "/", labelKey: "nav.play" },
  { id: "progress", href: "/progress", labelKey: "nav.progress" },
  { id: "social", href: "/social", labelKey: "nav.social" },
  { id: "profile", href: "/profile", labelKey: "nav.profile" },
];

export function AppNav() {
  const { t } = useT();
  const pathname = usePathname();
  const notifications = useSharedNotifications();
  const { visible, active } = navStateFor(pathname);
  if (!visible) return null;

  const badges: Partial<Record<NavTab, number>> = {
    play: notifications.yourTurn + notifications.gameRequests,
    social: notifications.friendRequests,
  };

  return (
    <nav aria-label={t("nav.label")} className="app-nav" data-testid="app-nav">
      <ul className="app-nav__list">
        {TABS.map((tab) => {
          const count = badges[tab.id] ?? 0;
          const isActive = active === tab.id;
          return (
            <li key={tab.id} className="app-nav__item">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                data-nav-tab={tab.id}
                className="app-nav__link"
              >
                <span className="relative">
                  {ICONS[tab.id]}
                  {count > 0 && (
                    <span
                      className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]"
                      data-testid={`nav-badge-${tab.id}`}
                    >
                      <span aria-hidden="true">{badgeLabel(count)}</span>
                      <span className="sr-only">{t("nav.badge", { count })}</span>
                    </span>
                  )}
                </span>
                <span className="app-nav__label">{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
