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
  // Show the "Player activity this round" table (latest discard/pickup per
  // player) on the game board.
  showPlayerActivity: boolean;
  // Show the "Who's turn is it?" button on the game board, which pops up a
  // brief on-screen reminder of whose turn it currently is.
  showWhoseTurn: boolean;
  // "Group melds by type" and "Expandable hand drawer" used to live here as
  // their own toggles — both are permanent now (grouping books before runs
  // is just how Table melds always renders; the hand drawer is the only
  // hand layout there is, tutorial included — see game/page.tsx), so
  // there's nothing left for either to configure.
}

export const DEFAULT_SETTINGS: HouseSettings = {
  preferredAiDifficulty: "medium",
  soundEnabled: true,
  highlightLayoffs: true,
  showPlayerActivity: true,
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
