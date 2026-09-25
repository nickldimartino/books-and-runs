"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useT } from "../lib/i18n/LocaleProvider";
import { AnyCosmeticOption } from "../lib/allCosmetics";

const AUTO_DISMISS_MS = 7000;

/**
 * A top-of-screen toast for a newly-earned profile cosmetic (avatar emoji,
 * frame, title, or banner) — see allCosmetics.ts's diffNewlyUnlockedCosmetics,
 * called from GameOverScreen.tsx and useMpGame.ts right after a game
 * finishes. Without this, the only way to discover a new reward is to open
 * Edit Profile and happen to notice something isn't greyed out anymore.
 * Auto-dismisses; renders nothing when there's nothing new.
 */
export function UnlockToast({ items, onDismiss }: { items: AnyCosmeticOption[]; onDismiss: () => void }) {
  const { t, tPlural } = useT();
  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [items, onDismiss]);

  if (items.length === 0) return null;

  return (
    <div role="status" className="unlock-toast-pop fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="flex max-w-sm items-start gap-3 rounded-xl border border-[var(--accent)]/50 bg-[var(--panel)] p-4 shadow-xl">
        <span className="text-2xl" aria-hidden="true">
          🎉
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--heading)]">
            {tPlural("unlockToast.unlocked", items.length)}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--muted)]">
            {items.map((c) => (
              <li key={`${c.kind}:${c.id}`}>{c.label}</li>
            ))}
          </ul>
          <Link href="/player" className="mt-1.5 inline-block text-xs font-medium text-[var(--accent)] hover:underline">
            {t("unlockToast.goEquip")}
          </Link>
        </div>
        <button
          onClick={onDismiss}
          aria-label={t("common.dismiss")}
          className="shrink-0 rounded p-0.5 text-[var(--faint)] hover:text-[var(--muted)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
