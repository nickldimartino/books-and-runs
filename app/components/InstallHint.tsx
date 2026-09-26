"use client";

// The one-time "Install the app" card — see lib/installHint.ts for every gate
// (after a completed game, not installed, exponential dismissal backoff) and
// for why. Kept off the game screens so it never covers a hand.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  canPromptInstall,
  GAME_COMPLETED_EVENT,
  INSTALL_PROMPT_READY_EVENT,
  installHintKind,
  isStandaloneDisplay,
  loadInstallState,
  promptInstall,
  recordInstallDismissed,
  type InstallHintKind,
} from "../lib/installHint";
import { useT } from "../lib/i18n/LocaleProvider";
import { isIosSafariNonStandalone } from "../lib/pushSubscriptions";

const HIDDEN_ON = ["/game", "/multiplayer/play", "/sign-in", "/reset-password"];

export function InstallHint() {
  const { t } = useT();
  const pathname = usePathname();
  const [kind, setKind] = useState<InstallHintKind | null>(null);

  const evaluate = useCallback(() => {
    setKind(
      installHintKind({
        state: loadInstallState(),
        now: Date.now(),
        standalone: isStandaloneDisplay(),
        canPrompt: canPromptInstall(),
        iosSafari: isIosSafariNonStandalone(),
      })
    );
  }, []);

  // Re-check on navigation (a finished game lands on Home) and whenever the
  // browser hands over its install event or a game completes.
  useEffect(() => {
    const timer = setTimeout(evaluate, 1200);
    window.addEventListener(INSTALL_PROMPT_READY_EVENT, evaluate);
    window.addEventListener(GAME_COMPLETED_EVENT, evaluate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(INSTALL_PROMPT_READY_EVENT, evaluate);
      window.removeEventListener(GAME_COMPLETED_EVENT, evaluate);
    };
  }, [evaluate, pathname]);

  if (!kind || HIDDEN_ON.some((p) => pathname === p || pathname?.startsWith(`${p}/`))) return null;

  function dismiss() {
    recordInstallDismissed();
    setKind(null);
  }

  async function install() {
    const accepted = await promptInstall();
    if (!accepted) recordInstallDismissed();
    setKind(null);
  }

  return (
    <section
      aria-label={kind === "ios" ? t("install.ios.title") : t("install.title")}
      className="fixed inset-x-0 bottom-0 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-t-2xl border border-b-0 border-[var(--accent)]/40 bg-[var(--panel)] px-4 pt-3 shadow-2xl"
      style={{ paddingBottom: "calc(var(--nav-offset, env(safe-area-inset-bottom)) + 0.75rem)" }}
    >
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold text-[var(--heading)]">
          {kind === "ios" ? t("install.ios.title") : t("install.title")}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {kind === "ios" ? t("install.ios.body") : t("install.body")}
        </p>
        <div className="mt-2 flex gap-2">
          {kind === "prompt" && (
            <button
              onClick={install}
              className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-[var(--on-accent)] shadow"
            >
              {t("install.button")}
            </button>
          )}
          <button
            onClick={dismiss}
            className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {t("install.notNow")}
          </button>
        </div>
      </div>
    </section>
  );
}
