"use client";

// A friendly, dismissible note shown once after a streak shield covered a
// missed day since the player's last visit. Warm and celebratory — the streak
// is fine, that's the whole message.

import { useT } from "../../lib/i18n/LocaleProvider";

export function ShieldSavedCard({ streak, onDismiss }: { streak: number; onDismiss: () => void }) {
  const { t } = useT();
  return (
    <section
      role="status"
      aria-labelledby="shield-saved-heading"
      data-testid="shield-saved-card"
      className="relative rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 pr-10 text-left"
    >
      <h2 id="shield-saved-heading" className="text-sm font-semibold text-[var(--heading)]">
        <span aria-hidden="true">🛡️ </span>
        {t("streakShield.savedTitle")}
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">{t("streakShield.savedBody", { count: streak })}</p>
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
