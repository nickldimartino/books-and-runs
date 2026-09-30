"use client";

// "Pass the device to X" interstitial shown before a pass-and-play player's
// turn is revealed, so the previous player doesn't see the next hand.

import { useEffect, useRef } from "react";
import { useT } from "../lib/i18n/LocaleProvider";

interface PassGateProps {
  name: string;
  onReveal: () => void;
}

export function PassGate({ name, onReveal }: PassGateProps) {
  const { t } = useT();
  // This screen fully replaces the board every time a human turn starts in
  // pass-and-play (game/page.tsx swaps it in while awaitingReveal is true),
  // and React reuses this same component instance across turns rather than
  // remounting it — nothing else moves focus here, so a screen-reader user
  // would otherwise get silence, or worse, find themselves still "on" the
  // previous player's now-stale, invisible hand. `[name]` refires this on
  // every new pass gate, not just the first.
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [name]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      {/* w-full + break-words: a max-length (20-char) custom name has no
          spaces to wrap at on its own, and this div had no width
          constraint of its own — a long unbroken name was overflowing
          past the viewport instead of wrapping, clipped off both edges. */}
      <div ref={headingRef} tabIndex={-1} className="w-full max-w-full outline-none">
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">{t("passGate.passTo")}</p>
        <h1 className="mt-2 break-words text-3xl font-bold text-[var(--heading)]">{name}</h1>
      </div>
      <button
        onClick={onReveal}
        className="rounded-lg bg-[var(--accent)] px-8 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
      >
        {t("passGate.ready")}
      </button>
    </main>
  );
}
