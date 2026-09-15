// Local pacing/dismissal state for the post-win "Enjoying the game?" nudge
// (ReviewPrompt.tsx) — a per-device nicety, never synced to an account,
// same spirit as tipsStore.ts's seen-tips. Deliberately asks after a real
// win, not the first game finished — a genuine positive moment, not
// interrupting someone who's still deciding whether they like the game.

const RESPONDED_KEY = "booksAndRuns:reviewPromptResponded";
const WINS_SINCE_SHOWN_KEY = "booksAndRuns:reviewPromptWinsSinceShown";

// Shown after every 3rd win until answered — reset to 0 each time it's
// actually shown, whether or not the player answers, so closing without
// picking either button just means "ask again in 3 more wins" rather than
// "ask again next win," which would feel naggy.
const WIN_THRESHOLD = 3;

function readWins(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(WINS_SINCE_SHOWN_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeWins(n: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WINS_SINCE_SHOWN_KEY, String(n));
  } catch {
    // best-effort — worst case this just asks again sooner than intended
  }
}

export function hasRespondedToReviewPrompt(): boolean {
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
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RESPONDED_KEY, "1");
  } catch {
    // best-effort
  }
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
