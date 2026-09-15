"use client";

import { useRouter } from "next/navigation";
import { markReviewPromptResponded } from "../lib/reviewPromptStore";

// Fill this in once Books & Runs actually has an App Store/Play Store
// listing (see CODEBASE_MAP.md — as of this writing it's a PWA plus an
// undistributed Capacitor build, so there's nowhere public yet to send a
// happy player). Until then, "Yes!" routes to the feedback form too, just
// with encouraging framing instead of a bug-report one — the moment this
// is set, the button relabels itself and opens the real store listing
// instead, no other code changes needed.
const STORE_REVIEW_URL = "";

/**
 * A small, dismissible "enjoying the game?" nudge — reviewPromptStore.ts
 * decides *when* to show this (after a real win, paced so it isn't
 * naggy); this component only handles the two answers. Classic split:
 * "Yes" routes toward the public store rating once one exists (or, until
 * then, toward leaving a feature request); "Not really" always routes to
 * the private feedback form instead of a public rating — asking someone
 * who isn't enjoying it to rate the app publicly helps no one.
 */
export function ReviewPrompt({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter();

  function respond(enjoyed: boolean) {
    markReviewPromptResponded();
    onDismiss();
    if (enjoyed && STORE_REVIEW_URL) {
      window.open(STORE_REVIEW_URL, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(`/support?type=${enjoyed ? "feature" : "bug"}`);
  }

  // Inline in the results flow, not a floating overlay — GameOverScreen
  // already has UnlockToast as a fixed top banner for a real earned
  // reward; a second thing fighting for the same screen position would
  // either collide with it or need fragile offset math to avoid it.
  return (
    <div
      role="dialog"
      aria-label="Enjoying the game?"
      className="confirm-pop flex flex-col gap-3 rounded-xl border border-[var(--accent)]/50 bg-[var(--panel)] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden="true">
          🃏
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--heading)]">Enjoying Books &amp; Runs?</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {STORE_REVIEW_URL ? "A quick rating helps a lot." : "Nice win! A few seconds of feedback helps a lot."}
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 text-[var(--faint)] hover:text-[var(--muted)]"
        >
          ✕
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => respond(false)}
          className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Not really
        </button>
        <button
          onClick={() => respond(true)}
          className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)]"
        >
          {STORE_REVIEW_URL ? "Rate us" : "Yes!"}
        </button>
      </div>
    </div>
  );
}
