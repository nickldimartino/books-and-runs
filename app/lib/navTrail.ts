// "Back" that goes where you actually came from. The app has no browser-style
// back arrow of its own, and a fixed `href="/"` sent people back to Home from
// pages they had opened through a hub (Leaderboard → Progress, Friends →
// Social, …). NavTrailTracker (mounted once in the layout) records the previous
// in-app path on every route change; BackLink's `smart` mode sends you there,
// falling back to its own `href` when there is none (a page opened directly,
// or after a full reload in a fresh tab). Paths only — no query or hash.

import type { TranslationKey } from "./i18n/keys";

const KEY = "booksAndRuns:navTrail";

let last: string | null = null;
let prev: string | null = null;

/** Lower-case path without query/hash/trailing slash. */
export function normalizeTrailPath(pathname: string | null | undefined): string {
  const p = (pathname ?? "/").split(/[?#]/)[0].replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

// Screens that make a poor "back" destination: sign-in flows hand you on, and
// game screens shouldn't be re-entered by a stray Back.
const NEVER_BACK_TO = new Set(["/sign-in", "/reset-password", "/game", "/multiplayer/play"]);

function load() {
  if (last !== null) return;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { last?: string | null; prev?: string | null };
      last = parsed.last ?? null;
      prev = parsed.prev ?? null;
    }
  } catch {
    /* private mode — memory only */
  }
}

/** Record a route change. Repeated reports of the same path are ignored. */
export function recordPath(pathname: string | null | undefined): void {
  load();
  const path = normalizeTrailPath(pathname);
  if (path === last) return;
  prev = last;
  last = path;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ last, prev }));
  } catch {
    /* ignore */
  }
}

/** The in-app page before this one, or null when there isn't a usable one. */
export function previousPath(currentPathname?: string | null): string | null {
  load();
  const current = normalizeTrailPath(currentPathname ?? last);
  // If the tracker hasn't recorded this page yet (effect order), `last` is
  // still the page we came from.
  const candidate = last === current ? prev : last;
  if (!candidate || candidate === current || NEVER_BACK_TO.has(candidate)) return null;
  return candidate;
}

/** Tests only. */
export function resetNavTrailForTests(): void {
  last = null;
  prev = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const LABEL_KEYS: Record<string, TranslationKey> = {
  "/": "common.home",
  "/progress": "nav.progress",
  "/social": "nav.social",
  "/profile": "nav.profile",
  "/new-game": "newGame.title",
  "/settings": "home.settings",
  "/account": "home.account",
  "/clubs": "clubs.title",
  "/tournaments": "tournaments.title",
  "/how-to-play": "common.howToPlay",
  "/scorecard": "home.scorekeeper",
  "/history": "home.historyOfBooksAndRuns",
  "/leaderboard": "home.progressTile.leaderboard",
  "/achievements": "home.progressTile.achievements",
  "/friends": "home.progressTile.friends",
};

/** Translation key for a back-link label naming `path`; "Back" when unknown. */
export function labelKeyFor(path: string): TranslationKey {
  return LABEL_KEYS[normalizeTrailPath(path)] ?? "common.back";
}
