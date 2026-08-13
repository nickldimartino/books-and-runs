import { GameState } from "@/types";
import { RoundHistoryEntry } from "./recordGameResult";

const QUEUE_KEY = "booksAndRuns:pendingSaves";

/**
 * A finished game whose stats/achievement writes couldn't reach Supabase
 * (offline, mid-sync failure) — kept here so it survives leaving the
 * game-over screen or closing the app entirely, and gets retried once the
 * connection comes back (see PendingSaveSync.tsx). `gameResultDone`/
 * `achievementDone` track each write independently, same reason as
 * GameOverScreen's own in-session retry: neither write is safe to repeat
 * once it's actually succeeded.
 */
export interface PendingSave {
  id: string;
  userId: string;
  state: GameState;
  roundHistory: RoundHistoryEntry[];
  counters: Record<string, number>;
  gameResultDone: boolean;
  achievementDone: boolean;
}

export function loadPendingSaves(): PendingSave[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingSave[];
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingSave[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage unavailable/full — the in-session "Try again" button still works
  }
}

/** Adds a new entry, or overwrites the existing one with the same id. */
export function upsertPendingSave(entry: PendingSave): void {
  const next = loadPendingSaves().filter((e) => e.id !== entry.id);
  next.push(entry);
  saveQueue(next);
}

export function removePendingSave(id: string): void {
  saveQueue(loadPendingSaves().filter((e) => e.id !== id));
}

// A game whose GameOverScreen is still on-screen owns retrying its own
// save — the background flush in PendingSaveSync.tsx skips it, so a manual
// "Try again" click and an automatic reconnect flush can never both fire
// the same not-safe-to-repeat Supabase writes for the same game at once.
let activeForegroundGameId: string | null = null;

export function setActiveForegroundGame(id: string | null): void {
  activeForegroundGameId = id;
}

export function isActiveForegroundGame(id: string): boolean {
  return activeForegroundGameId === id;
}
