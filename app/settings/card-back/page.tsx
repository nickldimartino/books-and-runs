"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { BackLink } from "../../components/BackLink";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { onAccountSettingsSynced, pushCardBack } from "../../lib/accountSettingsSync";
import { applyCardBack, CardBackId, loadLocalCardBack, saveLocalCardBack } from "../../lib/cardBackStore";
import { supabase } from "../../lib/supabaseClient";
import { loadLocalTheme, ThemeId } from "../../lib/themeStore";
import { SwatchPicker } from "../SwatchPicker";

/**
 * Its own page rather than a section on the main Settings screen — see
 * SwatchPicker's own doc for why: at a real color-block-per-tile size, this
 * grid alone was pushing Settings well past the length anyone visiting just
 * to flip a toggle should have to scroll through.
 */
export default function CardBackSettingsPage() {
  const { user } = useAuth();
  const [cardBack, setCardBack] = useState<CardBackId>("match");
  // Read-only here — needed only to resolve "match" into a real id when
  // applying a card back, not something this page ever changes itself.
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCardBack(loadLocalCardBack());
    setTheme(loadLocalTheme());
    setLoading(false);
    return onAccountSettingsSynced(() => {
      setCardBack(loadLocalCardBack());
      setTheme(loadLocalTheme());
    });
  }, []);

  function handleCardBackChange(id: CardBackId) {
    setCardBack(id);
    saveLocalCardBack(id);
    applyCardBack(id, theme);
    pushCardBack(supabase, user?.id ?? null, id);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <BackLink href="/settings" label="Settings" />
      <div className="-mt-2">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Card back</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The pattern and color on the back of your cards — the draw pile, and another
          player&apos;s hand while it&apos;s face down. Separate from Theme, so any table look
          can be paired with any card back.
        </p>
      </div>

      {loading ? <LoadingSpinner /> : <SwatchPicker active={cardBack} onSelect={handleCardBackChange} matchOption />}
    </main>
  );
}
