"use client";

// Route-level error boundary. Catches a render/runtime crash in any page
// (the root layout — providers, theme — stays mounted, so this screen is
// themed) and gives the player a way out instead of a blank frame.
//
// The most likely trigger is a saved game that somehow went malformed, so
// "Start a fresh game" clears it explicitly; loadSavedGame() also self-heals
// a bad save now, but a user already staring at this screen shouldn't have
// to guess.

import Link from "next/link";
import { useEffect } from "react";
import { clearSavedGame } from "./lib/localSave";
import { useT } from "./lib/i18n/LocaleProvider";
import { report } from "./lib/errorReporter";

// Note: this (modified) Next passes `retry`, not the upstream `reset` name.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useT();
  useEffect(() => {
    console.error("Route error boundary caught:", error);
    report({ message: error.message, stack: error.stack, source: "error-boundary" });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{t("error.eyebrow")}</p>
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("error.title")}</h1>
      <p className="text-sm text-[var(--muted)]">
        {t("error.body")}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => retry()}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
        >
          {t("common.retry")}
        </button>
        <Link
          href="/"
          className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("common.home")}
        </Link>
      </div>
      <button
        onClick={() => {
          clearSavedGame();
          window.location.href = "/";
        }}
        className="text-sm text-[var(--faint)] underline hover:text-[var(--text)]"
      >
        {t("error.freshGame")}
      </button>
    </main>
  );
}
