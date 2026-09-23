import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";
import { SoloVerifyPayload } from "./verifySoloGame";

const QUEUE_KEY = "booksAndRuns:pendingSaves";

/**
 * A finished game whose solo-verify call couldn't reach Supabase (offline,
 * mid-sync failure) — kept here so it survives leaving the game-over screen
 * or closing the app entirely, and gets retried once the connection comes
 * back (see PendingSaveSync.tsx). `payload` is exactly what verifySoloGame
 * needs to replay it — the whole point of the seed+move-log design is that
 * this replay is order-independent of *when* it's verified, only what
 * actually happened, so queuing the full payload and retrying it later is
 * exactly as sound as verifying it immediately would have been.
 */
export interface PendingSave {
  id: string;
  userId: string;
  payload: SoloVerifyPayload;
}

export function loadPendingSaves(): PendingSave[] {
  const raw = readLocalStorage(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingSave[];
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingSave[]): void {
  writeLocalStorage(QUEUE_KEY, JSON.stringify(queue));
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
