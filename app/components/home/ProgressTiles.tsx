"use client";

// The quick-link tile row on Home: Profile, Achievements, Leaderboard, Friends
// (with a pending-requests badge). These also live behind the Progress / Social
// tabs; the row keeps them one tap away from Home.

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "../../lib/i18n/LocaleProvider";
import { playerProfileHref } from "../../lib/leaderboardStore";

function StatsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2.5" y="11" width="3.5" height="6.5" rx="0.8" fill="currentColor" />
      <rect x="8.25" y="6.5" width="3.5" height="11" rx="0.8" fill="currentColor" />
      <rect x="14" y="2.5" width="3.5" height="15" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function AchievementsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M10 1.7l2.57 5.22 5.76.84-4.17 4.06.98 5.74L10 14.8l-5.14 2.7.98-5.74-4.17-4.06 5.76-.84L10 1.7z"
        fill="currentColor"
      />
    </svg>
  );
}

function LeaderboardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2" y="10.5" width="4.5" height="7" rx="0.8" fill="currentColor" />
      <rect x="7.75" y="6" width="4.5" height="11.5" rx="0.8" fill="currentColor" />
      <rect x="13.5" y="12.5" width="4.5" height="5" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="7" cy="6.5" r="2.75" fill="currentColor" />
      <path d="M2 17a5 5 0 0 1 10 0" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="2.15" fill="currentColor" opacity="0.55" />
      <path d="M12.2 12a4.3 4.3 0 0 1 5.8 4" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function Tile({
  href,
  label,
  badge,
  children,
}: {
  href: string;
  label: string;
  /** A small corner count — omitted (not 0) when there's nothing to flag. */
  badge?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      // min-w-0 + container-type: the label's font-size is a share of the
      // tile's own width (cqw), so a long word like "Achievements" fits any
      // tile width instead of forcing the grid track wider.
      className="relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-[var(--border)] px-1 py-3.5 text-center transition hover:bg-[var(--panel-soft)] [container-type:inline-size]"
    >
      {!!badge && (
        <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]">
          {badge}
        </span>
      )}
      <span className="text-[var(--accent)]">{children}</span>
      <span
        className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-medium leading-tight text-[var(--muted)]"
        style={{ fontSize: "clamp(7px, 12.5cqw, 15px)" }}
      >
        {label}
      </span>
    </Link>
  );
}

export function ProgressTiles({ userId, friendRequests }: { userId: string | undefined; friendRequests: number }) {
  const { t } = useT();
  return (
    <section aria-label={t("home.progressTiles.aria")} className="grid grid-cols-4 gap-2" data-testid="progress-tiles">
      <Tile href={userId ? playerProfileHref(userId) : "/player"} label={t("home.progressTile.profile")}>
        <StatsIcon />
      </Tile>
      <Tile href="/achievements" label={t("home.progressTile.achievements")}>
        <AchievementsIcon />
      </Tile>
      <Tile href="/leaderboard" label={t("home.progressTile.leaderboard")}>
        <LeaderboardIcon />
      </Tile>
      <Tile href="/friends" label={t("home.progressTile.friends")} badge={friendRequests}>
        <FriendsIcon />
      </Tile>
    </section>
  );
}
