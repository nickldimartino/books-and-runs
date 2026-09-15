// Whether this device has ever actually started a game (tutorial included)
// — the one signal Home and New Game both need to tell a genuinely
// first-time visitor apart from a returning one. Home uses it to soften
// the Sign-in/Daily Deal/Weekly Challenge CTAs so they don't compete with
// New Game before anyone's played a single turn; New Game uses it to
// promote the tutorial link to a real button instead of a line of text
// easy to miss below the mode cards. Deliberately not tied to an account —
// a guest's very first visit is exactly the moment this matters most, and
// signing in later doesn't retroactively make someone a returning player.

const KEY = "booksAndRuns:hasStartedAGame";

export function hasStartedAGame(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function markGameStarted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // best-effort — worst case the softened Home treatment shows once more
  }
}
