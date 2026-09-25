// Plumbing for the passwordless / OAuth sign-in paths (magic link, email
// code, Google/Apple) — the parts that live *around* Supabase's own calls:
//
//  - Where does the player land afterwards? An emailed link can open in a
//    different tab (or the mail app's own browser), so the `?next=` the
//    sign-in page was opened with is stashed in localStorage (not
//    sessionStorage) before the link is sent. Supabase's redirect allow-list
//    then only needs the bare `<origin>/sign-in`.
//  - Is this a brand-new account? Password sign-up flags itself
//    (markJustSignedUp), but a magic link or OAuth login *creates* accounts
//    implicitly, so the welcome onboarding has to be inferred from the user
//    record's own timestamps.
//  - What did a failed redirect say? Expired/used links come back as
//    `#error=…&error_description=…` in the URL hash (implicit flow).
//  - Which OAuth providers are switched on? A config flag, off by default.

const NEXT_KEY = "booksAndRuns:authNext";
const NEXT_TTL_MS = 60 * 60 * 1000;

/** Same-origin relative path only — rejects `//evil.com`, `/\evil.com`,
 * absolute URLs. Returns the path+query+hash, or "/" when unusable. */
export function safeNextPath(next: string | null | undefined, origin: string): string {
  if (!next) return "/";
  try {
    const u = new URL(next, origin);
    if (u.origin === origin && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    /* malformed — fall through */
  }
  return "/";
}

export function stashNextPath(next: string | null): void {
  try {
    if (next) localStorage.setItem(NEXT_KEY, JSON.stringify({ next, at: Date.now() }));
    else localStorage.removeItem(NEXT_KEY);
  } catch {
    /* best-effort */
  }
}

/** Reads (and clears) a stashed destination if it's still fresh. */
export function takeStashedNext(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(NEXT_KEY);
    if (!raw) return null;
    localStorage.removeItem(NEXT_KEY);
    const parsed = JSON.parse(raw) as { next?: unknown; at?: unknown };
    if (typeof parsed.next === "string" && typeof parsed.at === "number" && now - parsed.at < NEXT_TTL_MS) {
      return parsed.next;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** True for a user whose very first sign-in is happening now: created in the
 * last 15 minutes and `last_sign_in_at` within 2 minutes of `created_at`
 * (a later sign-in, even on a new device, moves last_sign_in_at on). */
export function isFreshAccount(
  user: { created_at?: string; last_sign_in_at?: string | null },
  now = Date.now()
): boolean {
  const created = Date.parse(user.created_at ?? "");
  if (Number.isNaN(created) || now - created > 15 * 60 * 1000) return false;
  const last = Date.parse(user.last_sign_in_at ?? "");
  if (Number.isNaN(last)) return true;
  return last - created < 2 * 60 * 1000;
}

/** Pulls Supabase's redirect error out of a URL hash/query string, if any. */
export function parseAuthRedirectError(hashOrQuery: string): string | null {
  const params = new URLSearchParams(hashOrQuery.replace(/^[#?]/, ""));
  const desc = params.get("error_description");
  if (desc) return desc.replace(/\+/g, " ");
  return params.get("error") ? "Token has expired or is invalid" : null;
}

export type OAuthProvider = "google" | "apple";
const KNOWN_PROVIDERS: OAuthProvider[] = ["google", "apple"];

/** NEXT_PUBLIC_AUTH_PROVIDERS="google,apple" → which "Continue with …"
 * buttons to show. Empty/unset (the default) shows none. */
export function enabledOAuthProviders(env: string | undefined): OAuthProvider[] {
  if (!env) return [];
  const wanted = env.split(",").map((s) => s.trim().toLowerCase());
  return KNOWN_PROVIDERS.filter((p) => wanted.includes(p));
}

export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };
