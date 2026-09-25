"use client";

import { useEffect, useRef, useState } from "react";
import { startAmbience, stopAmbience } from "../lib/ambience";
import { useT } from "../lib/i18n/LocaleProvider";
import { loadLocalSettings, saveLocalSettings } from "../lib/settingsStore";

/**
 * A one-tap mute/unmute for in-game audio — sound effects, and the ambient
 * music pad if it was playing — reachable right from the game screen
 * instead of only via a trip to Settings. Haptics has its own independent
 * toggle (see settingsStore.ts's hapticsEnabled) and isn't touched here.
 */
export function SoundQuickToggle() {
  const { t } = useT();
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  // Remembers whether ambient music was actually on before a mute, so
  // unmuting restores it instead of unconditionally turning it on.
  const wasAmbientOnRef = useRef(false);

  useEffect(() => {
    setMuted(!loadLocalSettings().soundEnabled);
    setReady(true);
  }, []);

  function toggle() {
    const settings = loadLocalSettings();
    if (settings.soundEnabled) {
      wasAmbientOnRef.current = settings.ambientMusicEnabled;
      saveLocalSettings({ ...settings, soundEnabled: false, ambientMusicEnabled: false });
      if (settings.ambientMusicEnabled) stopAmbience();
      setMuted(true);
    } else {
      const restoreAmbient = wasAmbientOnRef.current;
      saveLocalSettings({ ...settings, soundEnabled: true, ambientMusicEnabled: restoreAmbient });
      if (restoreAmbient) startAmbience();
      setMuted(false);
    }
  }

  if (!ready) return null;

  return (
    <button
      onClick={toggle}
      aria-label={muted ? t("common.unmuteSound") : t("common.muteSound")}
      title={muted ? t("common.unmuteSound") : t("common.muteSound")}
      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--panel-soft)]"
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
