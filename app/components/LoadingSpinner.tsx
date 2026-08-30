"use client";

/**
 * Replaces the bare "Loading…" text every data-fetching page (Stats,
 * Achievements, Leaderboard, Account, Settings) used to show on its own,
 * with nothing else — consistent, but reads as unfinished. Tailwind's own
 * animate-spin utility (no custom keyframes needed here); respects
 * prefers-reduced-motion via the override in globals.css, same as every
 * other animation in this app.
 */
export function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--faint)]">
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
