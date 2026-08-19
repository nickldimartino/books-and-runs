import { GameState } from "@/types";
import { RoundHistoryEntry } from "./recordGameResult";

const SAVE_KEY = "booksAndRuns:savedGame";

export interface SavedGame {
  state: GameState;
  hasDrawn: boolean;
  roundStartScores: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
  // Achievement counter deltas accumulated so far this game (see
  // GameContext.tsx's sessionCountersRef) — persisted so resuming a saved
  // game after closing the app doesn't silently drop this game's progress.
  // Optional since saves made before this field existed won't have it.
  sessionCounters?: Record<string, number>;
  savedAt: number;
}

export function loadSavedGame(): SavedGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedGame;
  } catch {
    return null;
  }
}

export function saveGame(data: Omit<SavedGame, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // storage unavailable/full — local persistence is a nicety, not required
  }
}

export function clearSavedGame(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// A tutorial game deliberately never touches SAVE_KEY (see GameContext.tsx's
// persist()), so /game's "recover from localStorage if a navigation here
// landed with no in-memory state" fallback has nothing to find for one.
// This is a much smaller, ephemeral signal for exactly that one case: the
// tutorial is a fixed, scripted deal (see src/tutorial.ts), so "recovering"
// it just means starting it fresh again — nothing real to lose. sessionStorage
// (not localStorage) since this should never survive past the current tab.
const TUTORIAL_STARTING_KEY = "booksAndRuns:tutorialStarting";

export function markTutorialStarting(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TUTORIAL_STARTING_KEY, "1");
  } catch {
    // ignore
  }
}

/** Reads and clears the flag in one step — it's only ever meant to be acted on once. */
export function consumeTutorialStartingFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const was = window.sessionStorage.getItem(TUTORIAL_STARTING_KEY) === "1";
    window.sessionStorage.removeItem(TUTORIAL_STARTING_KEY);
    return was;
  } catch {
    return false;
  }
}
