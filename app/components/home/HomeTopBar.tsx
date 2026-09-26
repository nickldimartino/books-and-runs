"use client";

// Home's slim top bar: who you are (identity chip with level + XP bar when
// signed in, a "Sign in" chip for guests), the notification bell, and a
// settings gear. Fixed height so nothing below it moves while the identity
// loads; the guest chip is prerendered and hidden before first paint for a
// returning signed-in visitor (`data-home-signin`, `data-home-identity-skeleton`
// — see public/init.js and globals.css).

import Link from "next/link";
import type { LevelProgress } from "@/leveling";
import type { ClaimedQuest } from "../../lib/verifySoloGame";
import { useT } from "../../lib/i18n/LocaleProvider";
import type { Notifications } from "../../lib/useNotifications";
import { NotificationBell } from "../NotificationBell";
import { HomeIdentity } from "./HomeIdentity";

export function HomeTopBar({
  configured,
  userId,
  level,
  levelLoading,
  notifications,
  shieldSaveDay,
  claimedQuests,
}: {
  configured: boolean;
  userId: string | null;
  level: LevelProgress | null;
  levelLoading: boolean;
  notifications: Notifications;
  shieldSaveDay: string | null;
  claimedQuests: ClaimedQuest[];
}) {
  const { t } = useT();
  return (
    <header className="relative z-40 flex h-12 w-full items-center justify-between gap-2" data-testid="home-topbar">
      <div className="flex min-w-0 items-center">
        {configured && userId ? (
          <HomeIdentity userId={userId} level={level} loading={levelLoading} variant="chip" />
        ) : (
          configured && (
            <>
              <div data-home-identity-skeleton className="h-10 w-40 animate-pulse rounded-full bg-[var(--panel)]" />
              <Link
                href="/sign-in"
                data-home-signin-chip
                className="flex h-10 items-center gap-2 rounded-full border border-[var(--accent)]/50 px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4.5 20.5c.6-3.9 3.6-6 7.5-6s6.9 2.1 7.5 6" />
                </svg>
                {t("signIn.title")}
              </Link>
            </>
          )
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {configured && userId && (
          <NotificationBell
            userId={userId}
            notifications={notifications}
            shieldSaveDay={shieldSaveDay}
            claimedQuests={claimedQuests}
            className=""
          />
        )}
        <Link
          href="/settings"
          aria-label={t("home.settings")}
          className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition hover:bg-[var(--panel-soft)] hover:text-[var(--heading)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
