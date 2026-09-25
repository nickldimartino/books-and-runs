"use client";

// A short, dismissible recap for a player returning after a few days away:
// games waiting on them, the state of their Daily Deal streak, and that
// fresh quests are up. Deliberately warm and forward-looking — no "you
// missed…" or expiry framing.

import { useT } from "../../lib/i18n/LocaleProvider";

export function WelcomeBackCard({
  gamesWaiting,
  dailyStreak,
  showQuests,
  onDismiss,
}: {
  /** Multiplayer games where it's the player's turn. */
  gamesWaiting: number;
  /** A live (today-or-yesterday) Daily Deal streak, or 0. */
  dailyStreak: number;
  showQuests: boolean;
  onDismiss: () => void;
}) {
  const { t, tPlural } = useT();
  return (
    <section
      aria-labelledby="welcome-back-heading"
      className="relative rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 pr-10 text-left"
    >
      <h2 id="welcome-back-heading" className="text-sm font-semibold text-[var(--heading)]">
        {t("welcomeBack.title")}
      </h2>
      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--muted)]">
        {gamesWaiting > 0 && <li>{tPlural("welcomeBack.gamesWaiting", gamesWaiting)}</li>}
        <li>{dailyStreak > 0 ? t("welcomeBack.streak", { count: dailyStreak }) : t("welcomeBack.dailyReady")}</li>
        {showQuests && <li>{t("welcomeBack.quests")}</li>}
      </ul>
      <button
        onClick={onDismiss}
        aria-label={t("common.dismiss")}
        className="absolute right-2 top-2 rounded p-1 text-[var(--faint)] hover:text-[var(--muted)]"
      >
        ✕
      </button>
    </section>
  );
}
