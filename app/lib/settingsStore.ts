import { Difficulty } from "@/types";

const KEY = "booksAndRuns:settings";

export interface HouseSettings {
  preferredAiDifficulty: Difficulty;
  // Local-only, like theme — not synced to the account (see settings/page.tsx's
  // handleSave, which never includes this in the Supabase upsert).
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: HouseSettings = {
  preferredAiDifficulty: "medium",
  soundEnabled: true,
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
