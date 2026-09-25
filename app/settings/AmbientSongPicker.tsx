"use client";

import { useEffect, useState } from "react";
import { useT } from "../lib/i18n/LocaleProvider";
import { AmbientTrackChoice } from "../lib/settingsStore";
import { AMBIENT_SONGS, isPreviewing, previewSong, stopPreview } from "../lib/ambience";

/**
 * Its own page rather than a section on the main Settings screen — same
 * reasoning as Theme/Card back/Card face (see SwatchPicker's own doc): ten
 * songs plus a preview button each was pushing Settings well past the
 * length anyone visiting just to flip a toggle should have to scroll
 * through. Unlike those pickers, there's no color or drawing to preview
 * here, so each row is a label to select plus a separate play/pause
 * control rather than a single tappable tile.
 */
export function AmbientSongPicker({
  active,
  disabled,
  onSelect,
}: {
  active: AmbientTrackChoice;
  disabled: boolean;
  onSelect: (id: AmbientTrackChoice) => void;
}) {
  const { t } = useT();
  const [previewingId, setPreviewingId] = useState<(typeof AMBIENT_SONGS)[number]["id"] | null>(null);

  // Never leave a preview playing behind after navigating away — nothing
  // else would stop it, since it's entirely independent of the real
  // game-screen startAmbience/stopAmbience lifecycle.
  useEffect(() => {
    return () => stopPreview();
  }, []);

  function togglePreview(id: (typeof AMBIENT_SONGS)[number]["id"]) {
    if (isPreviewing(id)) {
      stopPreview();
      setPreviewingId(null);
    } else {
      previewSong(id);
      setPreviewingId(id);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => onSelect("rotate")}
        disabled={disabled}
        className={`rounded-md px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
          active === "rotate"
            ? "bg-[var(--accent)] text-[var(--on-accent)]"
            : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        }`}
      >
        {t("settingsAmbientSong.playAll")}
      </button>
      {AMBIENT_SONGS.map((song) => (
        <div key={song.id} className="flex items-center gap-2">
          <button
            onClick={() => onSelect(song.id)}
            disabled={disabled}
            className={`flex-1 rounded-md px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              active === song.id
                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            }`}
          >
            {song.label}
          </button>
          <button
            type="button"
            onClick={() => togglePreview(song.id)}
            aria-label={t(previewingId === song.id ? "settingsAmbientSong.stopListening" : "settingsAmbientSong.listen", { name: song.label })}
            className="shrink-0 rounded-md bg-[var(--panel)] px-3 py-2 text-sm text-[var(--heading)] hover:bg-[var(--panel-soft)]"
          >
            {previewingId === song.id ? "⏸" : "▶"}
          </button>
        </div>
      ))}
    </div>
  );
}
