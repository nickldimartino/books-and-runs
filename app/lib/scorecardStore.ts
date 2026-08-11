const KEY = "booksAndRuns:scorecard";

export type RoundMode = "all" | "short" | "custom";

export interface ScorecardPlayer {
  id: string;
  name: string;
}

export interface SavedScorecard {
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
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedScorecard;
  } catch {
    return null;
  }
}

export function saveScorecard(data: SavedScorecard): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable/full — local persistence is a nicety, not required
  }
}

export function clearScorecard(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function newPlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
