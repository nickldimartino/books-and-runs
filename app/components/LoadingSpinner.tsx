"use client";

import { useT } from "../lib/i18n/LocaleProvider";

/**
 * Replaces the bare "Loading…" text every data-fetching page (Stats,
 * Achievements, Leaderboard, Account, Settings) used to show on its own —
 * a small card turning over rather than a generic ring. Respects
 * prefers-reduced-motion via the `.card-flip` override in globals.css
 * (the card just sits face-up), same as every other animation here.
 */
export function LoadingSpinner({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-[var(--faint)]">
      <div style={{ perspective: "260px" }}>
        <div
          className="card-flip grid h-10 w-[30px] place-items-center rounded-md border border-[var(--accent)]/40 bg-[var(--card-bg)] text-[var(--card-red)]"
          aria-hidden="true"
        >
          <span className="text-base leading-none">&hearts;</span>
        </div>
      </div>
      <span>{label ?? t("common.loading")}</span>
    </div>
  );
}
