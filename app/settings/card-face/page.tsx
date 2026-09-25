"use client";

import { useAuth } from "../../AuthContext";
import { BackLink } from "../../components/BackLink";
import { useT } from "../../lib/i18n/LocaleProvider";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { pushCardFace } from "../../lib/accountSettingsSync";
import { useCardUnlockContext } from "../../lib/cardCosmeticUnlocks";
import { CardFaceId, loadLocalCardFace, saveLocalCardFace } from "../../lib/cardFaceStore";
import { supabase } from "../../lib/supabaseClient";
import { useSyncedLocalPreference } from "../../lib/useSyncedLocalPreference";
import { CardFacePicker } from "../CardFacePicker";

/**
 * Its own page rather than a section on the main Settings screen — same
 * reasoning as Theme and Card back (see SwatchPicker's own doc): a real
 * tile-per-option grid reads far better full-width than squeezed into the
 * middle of a page most visits are there to flip a toggle on.
 */
export default function CardFaceSettingsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const [cardFace, setCardFace, loading] = useSyncedLocalPreference(loadLocalCardFace);
  const { level, isCreator } = useCardUnlockContext(supabase, user?.id);

  function handleChange(id: CardFaceId) {
    setCardFace(id);
    saveLocalCardFace(id);
    pushCardFace(supabase, user?.id ?? null, id);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <BackLink href="/settings#display" label={t("home.settings")} />
      <div className="-mt-2">
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("settings.cardFace")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t("settingsCardFace.description")}
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <CardFacePicker active={cardFace} onSelect={handleChange} level={level} isCreator={isCreator} />
      )}
    </main>
  );
}
