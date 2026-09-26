"use client";

// The Social hub: Friends (with the pending-request badge), Clubs and
// Tournaments — everything that used to hide in Home's "More" menu — plus a
// shortcut to start a game with friends.

import Link from "next/link";
import { useAuth } from "../AuthContext";
import { HubIcons, HubLink } from "../components/HubLink";
import { useT } from "../lib/i18n/LocaleProvider";
import { useSharedNotifications } from "../lib/NotificationsContext";

export function SocialContent() {
  const { t } = useT();
  const { configured, user } = useAuth();
  const notifications = useSharedNotifications();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("nav.social")}</h1>

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
