// Local pacing/dismissal state for the post-win "Enjoying the game?" nudge
// (ReviewPrompt.tsx) — a per-device nicety, never synced to an account,
// same spirit as tipsStore.ts's seen-tips. Deliberately asks after a real
// win, not the first game finished — a genuine positive moment, not
// interrupting someone who's still deciding whether they like the game.

import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

const RESPONDED_KEY = "booksAndRuns:reviewPromptResponded";
const WINS_SINCE_SHOWN_KEY = "booksAndRuns:reviewPromptWinsSinceShown";

// Shown after every 3rd win until answered — reset to 0 each time it's
// actually shown, whether or not the player answers, so closing without
// picking either button just means "ask again in 3 more wins" rather than
// "ask again next win," which would feel naggy.
const WIN_THRESHOLD = 3;

function readWins(): number {
  return Number(readLocalStorage(WINS_SINCE_SHOWN_KEY) ?? "0") || 0;
}

function writeWins(n: number): void {
  writeLocalStorage(WINS_SINCE_SHOWN_KEY, String(n));
}

function hasRespondedToReviewPrompt(): boolean {
  // Deliberately not just "readLocalStorage(...) === '1'": a genuinely
  // absent key (never responded) and a read that failed outright (private
  // browsing, storage disabled) both come back as null from
  // readLocalStorage, but they need different fallbacks here — an absent
  // key means the prompt hasn't been answered yet (show it), while a
  // broken read means this device can't reliably remember an answer at
  // all, so defaulting to "already responded" avoids nagging forever on
  // every visit instead of just once.
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(RESPONDED_KEY) === "1";
  } catch {
    return true;
  }
}

/** Picking either button (not just closing the prompt) calls this — stops
 * it from ever showing again on this device. */
export function markReviewPromptResponded(): void {
  writeLocalStorage(RESPONDED_KEY, "1");
}

/** Call once per real (non-tutorial, non-tie) win — returns whether the
 * prompt should actually show this time. */
export function shouldShowReviewPromptAfterWin(): boolean {
  if (hasRespondedToReviewPrompt()) return false;
  const wins = readWins() + 1;
  if (wins < WIN_THRESHOLD) {
    writeWins(wins);
    return false;
  }
  writeWins(0);
  return true;
}
