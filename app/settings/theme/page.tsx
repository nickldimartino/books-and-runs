"use client";

import Link from "next/link";
import { useAuth } from "../../AuthContext";
import { BackLink } from "../../components/BackLink";
import { useT } from "../../lib/i18n/LocaleProvider";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { pushTheme } from "../../lib/accountSettingsSync";
import { applyCardBack, loadLocalCardBack } from "../../lib/cardBackStore";
import { supabase } from "../../lib/supabaseClient";
import { applyTheme, loadLocalTheme, saveLocalTheme, ThemeId } from "../../lib/themeStore";
import { useSyncedLocalPreference } from "../../lib/useSyncedLocalPreference";
import { SwatchPicker } from "../SwatchPicker";

/**
 * Its own page rather than a section on the main Settings screen — see
 * SwatchPicker's own doc for why: at a real color-block-per-tile size, this
 * grid alone was pushing Settings well past the length anyone visiting just
 * to flip a toggle should have to scroll through.
 *
 * Gated behind sign-in (when accounts exist at all — see `configured`
 * below): a signed-out visitor is always on the default theme
 * (AccountSwitchGuard.tsx enforces this, including self-healing a device
 * that still has a non-default theme cached from before this gate
 * existed), so letting them pick something else here would just be a dead
 * end — it could never actually stick.
 */
export default function ThemeSettingsPage() {
  const { t } = useT();
  const { configured, loading: authLoading, user } = useAuth();
  const [theme, setTheme, loading] = useSyncedLocalPreference(loadLocalTheme);

  function handleThemeChange(id: ThemeId) {
    setTheme(id);
    saveLocalTheme(id);
    applyTheme(id);
    // Card back mirrors the table theme by default (see cardBackStore.ts) —
    // re-apply it here too so a "match" card back visibly follows this
    // change immediately. A no-op whenever an explicit card back is already
    // chosen — changing the table theme must never disturb that.
    applyCardBack(loadLocalCardBack(), id);
    pushTheme(supabase, user?.id ?? null, id);
  }

  const signedOutGate = configured && !authLoading && !user;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <BackLink href="/settings#display" label={t("home.settings")} />
      <h1 className="-mt-2 text-2xl font-bold text-[var(--heading)]">{t("settings.theme")}</h1>

      {loading || authLoading ? (
        <LoadingSpinner />
      ) : signedOutGate ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            {t("settingsTheme.signInPrompt")}
          </p>
          <Link
            href="/sign-in"
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
          >
            {t("signIn.title")}
          </Link>
        </div>
      ) : (
        <SwatchPicker active={theme} onSelect={(id) => id !== "match" && handleThemeChange(id)} />
      )}
    </main>
  );
}
