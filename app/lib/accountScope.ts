// Detects a genuine account handoff on this device — as opposed to the
// same account continuing, or a guest session — so AccountSwitchGuard.tsx
// can reset the local caches below before any of them get a chance to leak
// one account's data into a different one's session.
//
// Deliberately narrow: only a REAL account differing from the last REAL
// account this device is associated with counts as a switch. Guest
// sessions never update or check the marker (there's no identity to
// isolate a guest against), and a guest signing in for the first time
// under a real account is treated as that account claiming its own local
// data, not a switch — exactly the "I started playing, then decided to
// sign in" flow this should never disrupt. Concretely:
//   guest -> user A            no switch (A claims whatever's local)
//   user A -> user A           no switch (same account, e.g. a refresh)
//   user A -> guest -> user A  no switch (marker is untouched by guest)
//   user A -> guest -> user B  a switch, once B signs in
//   user A -> user B           a switch (this device had no guest interlude)

const KEY = "booksAndRuns:lastRealUserId";

/**
 * True the first time this is called for a real user id that differs from
 * whichever real user id this device last saw — meaning every per-account
 * local cache (solo save, Daily Deal streak, favorite game config,
 * first-visit tips, and every Settings/Theme/Card back/Card face
 * preference) might still reflect a DIFFERENT account and needs resetting
 * before anything reads or syncs it. Updates the stored marker as a side
 * effect either way, so this only ever returns true once per actual
 * switch, not on every render/sign-in check for the same account. A never
 * having tracked anything before (a fresh browser profile, or the first
 * time this shipped) is not itself a switch — nothing to reset against.
 */
export function accountSwitched(userId: string): boolean {
  if (typeof window === "undefined") return false;
  let last: string | null;
  try {
    last = window.localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (last === userId) return false;
  try {
    window.localStorage.setItem(KEY, userId);
  } catch {
    // ignore — worst case this same check runs again next time
  }
  return last !== null;
}
