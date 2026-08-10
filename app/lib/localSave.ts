import { GameState } from "@/types";
import { RoundHistoryEntry } from "./recordGameResult";

const SAVE_KEY = "booksAndRuns:savedGame";

export interface SavedGame {
  state: GameState;
  hasDrawn: boolean;
  roundStartScores: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
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
