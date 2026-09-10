// "House settings" — the preferences on the Settings page. Persisted in
// localStorage; only `preferredAiDifficulty` is also synced to the account
// (see SettingsSync / settings page). Everything else is per-device.

import { Difficulty } from "@/types";

const KEY = "booksAndRuns:settings";

export interface HouseSettings {
  preferredAiDifficulty: Difficulty;
  // Local-only, like theme — not synced to the account (see settings/page.tsx's
  // handleSave, which never includes these in the Supabase upsert).
  soundEnabled: boolean;
  // Badge hand cards and the top discard-pile card that could currently be
  // laid off onto some meld on the table.
  highlightLayoffs: boolean;
  // Show the "Who's turn is it?" button on the game board, which pops up a
  // brief on-screen reminder of whose turn it currently is.
  showWhoseTurn: boolean;
  // "Player activity", "Group melds by type", and "Expandable hand drawer"
  // used to live here as toggles. All three are gone now: the always-on
  // opponent strip (OpponentStrip.tsx) replaced Player activity, grouping
  // books before runs is just how Table melds renders, and the hand drawer
  // is the only hand layout there is — nothing left for any of them to
  // configure.
}

export const DEFAULT_SETTINGS: HouseSettings = {
  preferredAiDifficulty: "medium",
  soundEnabled: true,
  highlightLayoffs: true,
  showWhoseTurn: true,
};

export function loadLocalSettings(): HouseSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<HouseSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveLocalSettings(settings: HouseSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable/full — local persistence is a nicety, not required
  }
}
