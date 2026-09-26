"use client";

// The Profile hub: who you are (identity card), doors to your public profile,
// Account and Settings, sign out, and a "Help & about" list holding the
// rarely-used links that used to crowd Home (How to Play, Scorekeeper, History
// of Books & Runs, Privacy, Terms, Support).

import Link from "next/link";
import { useAuth } from "../AuthContext";
import { HomeIdentity } from "../components/home/HomeIdentity";
import { HubIcons, HubLink } from "../components/HubLink";
import { useT } from "../lib/i18n/LocaleProvider";
import { playerProfileHref } from "../lib/leaderboardStore";
import { usePlayerLevel } from "../PlayerLevelContext";

export function ProfileContent() {
  const { t } = useT();
  const { configured, user, signOut } = useAuth();
  const { level, loading } = usePlayerLevel();
  const signedIn = configured && !!user;

  const help: { href: string; label: string }[] = [
    { href: "/how-to-play", label: t("common.howToPlay") },
    { href: "/scorecard", label: t("home.scorekeeper") },
    { href: "/history", label: t("home.historyOfBooksAndRuns") },
    { href: "/privacy", label: t("common.privacy") },
    { href: "/terms", label: t("common.terms") },
    { href: "/support", label: t("common.contact") },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("nav.profile")}</h1>

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

      <div className="flex flex-col gap-2">
        {signedIn && user && (
          <HubLink
            href={playerProfileHref(user.id)}
            title={t("profile.myProfile")}
            description={t("profile.myProfileDesc")}
            icon={HubIcons.profile}
          />
        )}
        {signedIn && (
          <HubLink href="/account" title={t("home.account")} description={t("profile.accountDesc")} icon={HubIcons.account} />
        )}
        <HubLink href="/settings" title={t("home.settings")} description={t("profile.settingsDesc")} icon={HubIcons.settings} />
      </div>

      {signedIn && (
        <button
          type="button"
          onClick={signOut}
          className="self-start rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("home.signOut")}
        </button>
      )}

      <section aria-labelledby="help-about-heading" className="mt-2 flex flex-col gap-1">
        <h2 id="help-about-heading" className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
          {t("profile.helpAbout")}
        </h2>
        <ul className="flex flex-col">
          {help.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex min-h-11 items-center rounded-md px-3 text-sm text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--heading)]"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
