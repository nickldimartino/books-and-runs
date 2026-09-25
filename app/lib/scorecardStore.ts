// localStorage persistence for the standalone pen-and-paper scorekeeper
// (app/scorecard/page.tsx) — a plain score grid with no game engine behind
// it, for scoring the physical card game at a real table. Entirely local;
// nothing here ever touches Supabase.

import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "./localStorageUtil";

const KEY = "booksAndRuns:scorecard";

export type RoundMode = "all" | "short" | "custom";

export interface ScorecardPlayer {
  id: string;
  name: string;
}

interface SavedScorecard {
  phase: "setup" | "scoring";
  players: ScorecardPlayer[];
  roundMode: RoundMode;
  customRounds: number[];
  // scores[playerId][round] as a raw input string (not a number) so an
  // in-progress edit like "-" or "" round-trips through localStorage without
  // getting coerced into 0 mid-keystroke.
  scores: Record<string, Record<number, string>>;
}

export function loadScorecard(): SavedScorecard | null {
  const raw = readLocalStorage(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedScorecard;
  } catch {
    return null;
  }
}

export function saveScorecard(data: SavedScorecard): void {
  writeLocalStorage(KEY, JSON.stringify(data));
}

export function clearScorecard(): void {
  removeLocalStorage(KEY);
}

export function newPlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
