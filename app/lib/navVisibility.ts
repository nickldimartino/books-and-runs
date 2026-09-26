// Which screens show the persistent app navigation (bottom tab bar on phones,
// left rail on desktop — components/AppNav.tsx), and which tab each one
// belongs to. Pure so it is unit-testable; the component only asks
// `navStateFor(usePathname())`.
//
// Shown on hub / list / reference screens. Deliberately NOT shown on the
// in-game screens (/game, /multiplayer/*), the new-game setup flow, sign-in /
// reset-password, the settings sub-pickers, the scorekeeper tool or anything
// unknown (404) — those are focused flows with their own way out.

export type NavTab = "play" | "progress" | "social" | "profile";

export interface NavState {
  visible: boolean;
  /** The tab to highlight; null when the screen shows the nav but belongs to
   * none of the four (never today, kept for future screens). */
  active: NavTab | null;
}

const HIDDEN: NavState = { visible: false, active: null };

const TAB_BY_PATH: Record<string, NavTab> = {
  "/": "play",
  "/progress": "progress",
  "/achievements": "progress",
  "/leaderboard": "progress",
  "/stats": "progress",
  "/social": "social",
  "/friends": "social",
  "/clubs": "social",
  "/tournaments": "social",
  "/profile": "profile",
  "/player": "profile",
  "/settings": "profile",
  "/account": "profile",
  // Reference pages live under Profile → "Help & About".
  "/history": "profile",
  "/how-to-play": "profile",
  "/support": "profile",
  "/privacy": "profile",
  "/terms": "profile",
};

/** Lower-case, no query/hash, no trailing slash ("/friends/" → "/friends"). */
export function normalizePath(pathname: string | null | undefined): string {
  const p = (pathname ?? "/").split(/[?#]/)[0].replace(/\/+$/, "");
  return p === "" ? "/" : p.toLowerCase();
}

export function navStateFor(pathname: string | null | undefined): NavState {
  const path = normalizePath(pathname);
  const active = TAB_BY_PATH[path];
  return active ? { visible: true, active } : HIDDEN;
}
