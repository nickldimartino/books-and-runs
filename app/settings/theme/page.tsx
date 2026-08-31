"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { applyCardBack, loadLocalCardBack } from "../../lib/cardBackStore";
import { applyTheme, loadLocalTheme, saveLocalTheme, ThemeId } from "../../lib/themeStore";
import { SwatchPicker } from "../SwatchPicker";

/**
 * Its own page rather than a section on the main Settings screen — see
 * SwatchPicker's own doc for why: at a real color-block-per-tile size, this
 * grid alone was pushing Settings well past the length anyone visiting just
 * to flip a toggle should have to scroll through.
 */
export default function ThemeSettingsPage() {
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTheme(loadLocalTheme());
    setLoading(false);
  }, []);

  function handleThemeChange(id: ThemeId) {
    setTheme(id);
    saveLocalTheme(id);
    applyTheme(id);
    // Card back mirrors the table theme by default (see cardBackStore.ts) —
    // re-apply it here too so a "match" card back visibly follows this
    // change immediately. A no-op whenever an explicit card back is already
    // chosen — changing the table theme must never disturb that.
    applyCardBack(loadLocalCardBack(), id);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <Link
        href="/settings"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Settings
      </Link>
      <h1 className="-mt-2 text-2xl font-bold text-[var(--heading)]">Theme</h1>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <SwatchPicker active={theme} onSelect={(id) => id !== "match" && handleThemeChange(id)} />
      )}
    </main>
  );
}
