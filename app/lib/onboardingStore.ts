// Whether this device just created a brand-new account and hasn't seen the
// post-signup welcome prompt (language + push notifications) yet. Set the
// moment sign-up succeeds (sign-in/page.tsx) — localStorage, not
// sessionStorage, since Supabase's email-confirmation link can open in a
// new tab/window with its own separate sessionStorage, and this flag needs
// to survive that gap.
//
// hasJustSignedUp() is a plain, non-destructive read — Home checks it in an
// effect keyed on `user`, and the sign-in → Home redirect can genuinely
// mount Home more than once while auth state settles (Supabase's
// onAuthStateChange fires more than once — SIGNED_IN, then a session
// refresh — and each one can re-trigger sign-in's own router.replace("/")
// effect). A destructive "read and clear in the same call" here raced
// exactly that: the first mount would consume the flag and show the
// prompt, then a second mount reset showWelcome back to its initial
// `false` with nothing left to detect — the prompt would flash, if at all,
// and never actually render by the time anyone saw the page. Clearing only
// happens once the visitor actually dismisses the prompt (clearJustSignedUp,
// called from onDismiss), which is the one moment guaranteed not to race a
// remount.
const KEY = "booksAndRuns:justSignedUp";

export function markJustSignedUp(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // best-effort — worst case the welcome prompt just doesn't show once
  }
}

export function hasJustSignedUp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearJustSignedUp(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
