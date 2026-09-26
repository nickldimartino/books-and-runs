"use client";

// A slim, dismissible sign-in nudge for guests, below Home's Play zone. The
// dismissal is remembered on the device (and mirrored onto <html> so the
// prerendered card is already hidden before first paint — `data-home-signin`,
// public/init.js, globals.css). A returning signed-in visitor never sees it
// either (same hook). The top bar carries a permanent "Sign in" chip, so
// dismissing this loses nothing.
//
// `softened` (a session that's never played a turn) drops the filled pill to
// an outlined one so it doesn't compete with the Play button.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "../../lib/i18n/LocaleProvider";

export const SIGN_IN_DISMISSED_KEY = "booksAndRuns:signInPromptDismissed";

export function SignInCard({ softened }: { softened: boolean }) {
  const { t } = useT();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(SIGN_IN_DISMISSED_KEY) === "1");
    } catch {
      /* private mode — shows every visit */
    }
  }, []);
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(SIGN_IN_DISMISSED_KEY, "1");
      document.documentElement.setAttribute("data-signin-dismissed", "1");
    } catch {
      /* best-effort */
    }
  }

  return (
    <div
      data-home-signin
      className={`flex items-center gap-2 rounded-xl border py-2 pl-4 pr-2 text-left ${
        softened ? "border-[var(--border)]" : "border-[var(--accent)]/40 bg-[var(--accent)]/10"
      }`}
    >
      <Link href="/sign-in" className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--heading)]">{t("home.signInToSave")}</span>
          <span className="block text-xs text-[var(--muted)]">{t("home.signInToSaveBody")}</span>
        </span>
        <span
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
            softened ? "border border-[var(--accent)]/50 text-[var(--accent)]" : "bg-[var(--accent)] text-[var(--on-accent)]"
          }`}
        >
          {t("signIn.title")}
        </span>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.dismiss")}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--faint)] hover:text-[var(--muted)]"
      >
        ✕
      </button>
    </div>
  );
}
