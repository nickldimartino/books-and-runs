"use client";

import { useAuth } from "../../AuthContext";
import { BackLink } from "../../components/BackLink";
import { useT } from "../../lib/i18n/LocaleProvider";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { pushHouseSettingsPatch } from "../../lib/accountSettingsSync";
import { AmbientTrackChoice, loadLocalSettings, saveLocalSettings } from "../../lib/settingsStore";
import { supabase } from "../../lib/supabaseClient";
import { useSyncedLocalPreference } from "../../lib/useSyncedLocalPreference";
import { AmbientSongPicker } from "../AmbientSongPicker";

/**
 * Its own page rather than a section on the main Settings screen — same
 * reasoning as Theme/Card back/Card face (see SwatchPicker's own doc): ten
 * songs plus a preview button each was pushing Settings well past the
 * length anyone visiting just to flip a toggle should have to scroll
 * through.
 */
export default function AmbientSongSettingsPage() {
  const { t } = useT();
  const { user } = useAuth();
  // ambientMusicEnabled rides along in the same synced value even though
  // this page never sets it itself (only reads it, to gray out the picker)
  // — it needs to reload from the same sync event ambientTrack does.
  const [{ ambientTrack, ambientMusicEnabled }, setAmbientState, loading] = useSyncedLocalPreference(() => {
    const settings = loadLocalSettings();
    return { ambientTrack: settings.ambientTrack, ambientMusicEnabled: settings.ambientMusicEnabled };
  });

  function handleChange(id: AmbientTrackChoice) {
    setAmbientState({ ambientTrack: id, ambientMusicEnabled });
    saveLocalSettings({ ...loadLocalSettings(), ambientTrack: id });
    pushHouseSettingsPatch(supabase, user?.id ?? null, { ambientTrack: id });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <BackLink href="/settings#audio" label={t("home.settings")} />
      <div className="-mt-2">
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("settings.ambientSong")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t("settingsAmbientSong.description")}
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <AmbientSongPicker active={ambientTrack} disabled={!ambientMusicEnabled} onSelect={handleChange} />
      )}
    </main>
  );
}
