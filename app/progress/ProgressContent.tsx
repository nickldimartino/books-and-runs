"use client";

// The Progress hub: level + XP, the achievement you're closest to finishing
// (moved here from Home), and doors to Achievements, the Leaderboard and your
// stats & game history (which live on your profile page).

import Link from "next/link";
import { useAuth } from "../AuthContext";
import { ClosestAchievementCard, closestAchievement } from "../components/ClosestAchievementCard";
import { HomeIdentity } from "../components/home/HomeIdentity";
import { HubIcons, HubLink } from "../components/HubLink";
import { useT } from "../lib/i18n/LocaleProvider";
import { playerProfileHref } from "../lib/leaderboardStore";
import { loadPendingSessionCounters, withSessionCounters } from "../lib/pendingProgress";
import { useEffect, useState } from "react";
import { usePlayerLevel } from "../PlayerLevelContext";

export function ProgressContent() {
  const { t } = useT();
  const { configured, user } = useAuth();
  const { level, progress, loading } = usePlayerLevel();
  // This device's own not-yet-verified progress from any in-progress save.
  const [pending, setPending] = useState<Record<string, number> | null>(null);
  useEffect(() => setPending(loadPendingSessionCounters()), []);
  const signedIn = configured && !!user;
  const closest = signedIn ? closestAchievement(withSessionCounters(progress, pending)) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("nav.progress")}</h1>

      {signedIn && user ? (
        <HomeIdentity userId={user.id} level={level} loading={loading} variant="card" />
      ) : (
        configured && (
          <Link
            href="/sign-in"
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--heading)]">{t("home.signInToSave")}</span>
              <span className="block text-xs text-[var(--muted)]">{t("home.signInToSaveBody")}</span>
            </span>
            <span className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]">
              {t("signIn.title")}
            </span>
          </Link>
        )
      )}

      {signedIn && loading ? (
        <div className="h-[72px] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--panel)]" />
      ) : (
        closest && <ClosestAchievementCard achievement={closest} />
      )}

      <div className="flex flex-col gap-2">
        <HubLink
          href="/achievements"
          title={t("home.progressTile.achievements")}
          description={t("progress.achievementsDesc")}
          icon={HubIcons.achievements}
        />
        <HubLink
          href="/leaderboard"
          title={t("home.progressTile.leaderboard")}
          description={t("progress.leaderboardDesc")}
          icon={HubIcons.leaderboard}
        />
        <HubLink
          href={user ? playerProfileHref(user.id) : "/player"}
          title={t("progress.stats")}
          description={t("progress.statsDesc")}
          icon={HubIcons.stats}
        />
      </div>
    </main>
  );
}
