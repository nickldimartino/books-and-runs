"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { onAccountSettingsSynced, pushHouseSettingsPatch } from "../../lib/accountSettingsSync";
import { AmbientTrackChoice, loadLocalSettings, saveLocalSettings } from "../../lib/settingsStore";
import { supabase } from "../../lib/supabaseClient";
import { AmbientSongPicker } from "../AmbientSongPicker";

/**
 * Its own page rather than a section on the main Settings screen — same
 * reasoning as Theme/Card back/Card face (see SwatchPicker's own doc): ten
 * songs plus a preview button each was pushing Settings well past the
 * length anyone visiting just to flip a toggle should have to scroll
 * through.
 */
export default function AmbientSongSettingsPage() {
  const { user } = useAuth();
  const [ambientTrack, setAmbientTrack] = useState<AmbientTrackChoice>("rotate");
  const [ambientMusicEnabled, setAmbientMusicEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  function loadFromLocal() {
    const settings = loadLocalSettings();
    setAmbientTrack(settings.ambientTrack);
    setAmbientMusicEnabled(settings.ambientMusicEnabled);
  }

  useEffect(() => {
    loadFromLocal();
    setLoading(false);
    return onAccountSettingsSynced(loadFromLocal);
  }, []);

  function handleChange(id: AmbientTrackChoice) {
    setAmbientTrack(id);
    saveLocalSettings({ ...loadLocalSettings(), ambientTrack: id });
    pushHouseSettingsPatch(supabase, user?.id ?? null, { ambientTrack: id });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <Link
        href="/settings"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Settings
      </Link>
      <div className="-mt-2">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Ambient song</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Play through all of them forward, then back again, 3 minutes each and blending into each
          other — or pin it to just one.
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
