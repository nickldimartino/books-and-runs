import { Difficulty } from "@/types";

const KEY = "booksAndRuns:settings";

export interface HouseSettings {
  preferredAiDifficulty: Difficulty;
  // Local-only, like theme — not synced to the account (see settings/page.tsx's
  // handleSave, which never includes these in the Supabase upsert).
  soundEnabled: boolean;
  // Within each player's table melds, show all their books before their
  // runs instead of the order they were confirmed in.
  groupMeldsByType: boolean;
  // Badge hand cards and the top discard-pile card that could currently be
  // laid off onto some meld on the table.
  highlightLayoffs: boolean;
  // Show the "Player activity this round" table (latest discard/pickup per
  // player) on the game board.
  showPlayerActivity: boolean;
  // Show the "Who's turn is it?" button on the game board, which pops up a
  // brief on-screen reminder of whose turn it currently is.
  showWhoseTurn: boolean;
  // On (default): "Your hand" opens as a bottom sheet — tap the compact
  // read-only preview pinned to the bottom of the screen (see
  // HandPreviewBar) and sorting, dragging, grouping a meld, laying off, and
  // discarding all happen right there, so managing your hand never requires
  // scrolling at all. Off: "Your hand" goes back to being its own section
  // in the normal page flow, with that same compact preview just scrolling
  // you there on tap instead of opening it. Ignored during the tutorial,
  // which always uses the off/scroll layout regardless of this — its
  // scripted steps target specific on-page sections directly (see
  // game/page.tsx's TUTORIAL_STEPS handling), not whatever's currently
  // inside a collapsed drawer.
  expandableHand: boolean;
}

export const DEFAULT_SETTINGS: HouseSettings = {
  preferredAiDifficulty: "medium",
  soundEnabled: true,
  groupMeldsByType: true,
  highlightLayoffs: true,
  showPlayerActivity: true,
  showWhoseTurn: true,
  expandableHand: true,
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
