// First-visit page tips — a short dismissible banner (see PageTip.tsx) shown
// the first time someone lands on a handful of key pages, explaining what's
// there or how it works. Dismissing one marks it seen for good, so it never
// shows again on this device (localStorage, like every other local
// preference in the app — not synced to the account). "Show tips again" in
// Settings clears every seen flag at once, for anyone who wants a refresher
// or is trying a fresh browser profile.

import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

export type TipId =
  | "home"
  | "account"
  | "new-game"
  | "new-game-local"
  | "new-game-multiplayer"
  | "multiplayer-play"
  | "settings"
  | "achievements"
  | "player-profile"
  | "leaderboard"
  | "leaderboard-season"
  | "friends"
  | "scorecard"
  | "clubs"
  | "tournaments"
  | "tournaments-new";

const KEY = "booksAndRuns:seenTips";

function loadSeen(): Set<TipId> {
  const raw = readLocalStorage(KEY);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as TipId[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<TipId>): void {
  writeLocalStorage(KEY, JSON.stringify([...seen]));
}

export function isTipSeen(id: TipId): boolean {
  return loadSeen().has(id);
}

export function dismissTip(id: TipId): void {
  const seen = loadSeen();
  seen.add(id);
  saveSeen(seen);
}

/** Clears every seen flag — "Show tips again" in Settings. */
export function resetSeenTips(): void {
  saveSeen(new Set());
}
