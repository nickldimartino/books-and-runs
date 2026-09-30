"use client";

// The Social hub: Friends (with the pending-request badge), Clubs and
// Tournaments — everything that used to hide in Home's "More" menu — plus a
// shortcut to start a game with friends.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { HubIcons, HubLink } from "../components/HubLink";
import { CommunityMilestone, getCommunityMilestone } from "../lib/communityMilestoneStore";
import { useT } from "../lib/i18n/LocaleProvider";
import { useSharedNotifications } from "../lib/NotificationsContext";
import { findStoreItem } from "../lib/storeCatalog";
import { supabase } from "../lib/supabaseClient";

/** A rare, site-wide goal every account contributes to just by playing —
 * public (no account tie), so it's shown to guests too. Renders nothing
 * once every seeded milestone has been reached and no new one has been
 * added yet (see communityMilestoneStore.ts's own doc). */
function CommunityGoalCard() {
  const { t } = useT();
  const [milestone, setMilestone] = useState<CommunityMilestone | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCommunityMilestone(supabase)
      .then((m) => {
        if (!cancelled) setMilestone(m);
      })
      .catch((err) => console.error("Failed to load community milestone:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!milestone) return null;
  const pct = Math.min(100, Math.round((milestone.currentCount / Math.max(1, milestone.target)) * 100));
  const reward = findStoreItem(milestone.rewardSku);

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
      <h2 className="text-sm font-semibold text-[var(--heading)]">{t("social.communityGoal.title")}</h2>
      <p className="text-xs text-[var(--muted)]">
        {t("social.communityGoal.body", { current: milestone.currentCount, target: milestone.target })}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-soft)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {reward && <p className="text-[11px] text-[var(--faint)]">{t("social.communityGoal.reward", { name: reward.name })}</p>}
    </section>
  );
}

export function SocialContent() {
  const { t } = useT();
  const { configured, user } = useAuth();
  const notifications = useSharedNotifications();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("nav.social")}</h1>

      <CommunityGoalCard />

      {configured && !user && (
        <Link
          href="/sign-in"
          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-left"
        >
          <span className="min-w-0 text-sm font-semibold text-[var(--heading)]">{t("social.signInHint")}</span>
          <span className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]">
            {t("signIn.title")}
          </span>
        </Link>
      )}

      <div className="flex flex-col gap-2">
        <HubLink
          href="/friends"
          title={t("home.progressTile.friends")}
          description={t("social.friendsDesc")}
          icon={HubIcons.friends}
          badge={notifications.friendRequests}
        />
        <HubLink
          href="/new-game/multiplayer"
          title={t("home.playWithFriends")}
          description={t("social.playDesc")}
          icon={HubIcons.play}
          badge={notifications.gameRequests + notifications.yourTurn}
        />
        <HubLink href="/clubs" title={t("home.clubs")} description={t("social.clubsDesc")} icon={HubIcons.clubs} />
        <HubLink
          href="/tournaments"
          title={t("home.tournaments")}
          description={t("social.tournamentsDesc")}
          icon={HubIcons.tournaments}
        />
        <HubLink
          href="/scorecard"
          title={t("home.scorekeeper")}
          description={t("social.scorekeeperDesc")}
          icon={HubIcons.stats}
        />
      </div>
    </main>
  );
}
