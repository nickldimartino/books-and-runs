import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./AuthContext";
import { GameProvider } from "./GameContext";
import { PendingSaveSync } from "./PendingSaveSync";
import { PlayerLevelProvider } from "./PlayerLevelContext";
import { SettingsSync } from "./SettingsSync";
import { DEFAULT_THEME, THEME_BG, THEMES } from "./lib/themeStore";
import { COLORBLIND_MODES } from "./lib/colorblindStore";
import "./globals.css";

export const metadata: Metadata = {
  title: "Books & Runs",
  description:
    "Books & Runs is a free browser-based Contract Rummy card game. Play solo against AI opponents or pass-and-play with friends on one device — no download required.",
  verification: {
    google: "jI87NzjdGYGEBETrJ4QjX6sIetF6C7kZLg-p4zkwYbc",
  },
};

// viewport-fit=cover lets the app draw under the notch/home indicator so the
// env(safe-area-inset-*) padding in globals.css has something to react to —
// otherwise iOS just letterboxes instead of extending edge-to-edge.
//
// themeColor renders the <meta name="theme-color"> tag Safari uses to tint
// its status-bar/tab-bar area — without one, that tint is left to Safari's
// own heuristic of sampling the page's background, which doesn't reliably
// pick up --bg here (body's background is a multi-layer gradient stack with
// background-attachment: fixed for the felt-table glow — see globals.css),
// so the safe-area strip could sit a stale dark color even against a light
// theme. Starts at DEFAULT_THEME's color, same fallback THEME_INIT_SCRIPT
// below uses for data-theme itself; THEME_INIT_SCRIPT corrects it to the
// visitor's actual saved theme before first paint, and applyTheme()
// (themeStore.ts) keeps it in sync on every later in-app theme change.
export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  themeColor: THEME_BG[DEFAULT_THEME],
};

// Applies a previously-chosen theme before first paint, so static export's
// server-rendered (theme-less) HTML doesn't flash Midnight before swapping
// to whatever the visitor picked last time. The allow-list is generated
// from THEMES itself (not hand-copied) so adding a theme there can never
// again silently leave this check stale — a stale list here meant a saved
// theme applied fine within a session (applyTheme sets the attribute
// directly) but silently reverted to Midnight on every full page load.
// Also re-points the theme-color <meta> tag (see the `viewport` export
// above) at the saved theme's own --bg, for the same reason and on the same
// before-first-paint schedule — otherwise every page load would show
// DEFAULT_THEME's status-bar tint for an instant (or indefinitely, for
// anyone who never happens to touch the theme picker mid-session) instead
// of the visitor's actual theme.
const THEME_IDS_JSON = JSON.stringify(THEMES.map((t) => t.id));
const THEME_BG_JSON = JSON.stringify(THEME_BG);
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("booksAndRuns:theme");if(${THEME_IDS_JSON}.indexOf(t)!==-1){document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');var bg=${THEME_BG_JSON};if(m&&bg[t])m.setAttribute("content",bg[t]);}}catch(e){}})();`;

// Same reasoning as THEME_INIT_SCRIPT, for the colorblind card-color
// override (see colorblindStore.ts) — applied before first paint so a
// returning visitor with a non-default mode saved doesn't see a flash of
// standard card colors before hydration catches up. "off" is deliberately
// excluded from the allow-list: applyColorblindMode() never sets the
// attribute for "off" (it removes it instead), and the CSS in globals.css
// has no [data-colorblind="off"] block to match anyway.
const COLORBLIND_IDS_JSON = JSON.stringify(COLORBLIND_MODES.map((m) => m.id).filter((id) => id !== "off"));
const COLORBLIND_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem("booksAndRuns:colorblindMode");if(${COLORBLIND_IDS_JSON}.indexOf(c)!==-1){document.documentElement.setAttribute("data-colorblind",c);}}catch(e){}})();`;

// Same reasoning again, for the card back (see cardBackStore.ts) — computed
// rather than just copied from data-theme, since the saved choice might be
// "match" (mirror whatever the table theme is, the default) or a real theme
// id of its own; reuses THEME_IDS_JSON's own allow-list and "midnight"
// fallback so this can never drift out of step with loadLocalTheme's own
// default. Runs after THEME_INIT_SCRIPT sets data-theme, but computes its
// own `theme` value independently rather than reading the attribute back
// off <html> — cheaper, and avoids any ordering assumption between the two
// script tags.
const CARDBACK_INIT_SCRIPT = `(function(){try{var ids=${THEME_IDS_JSON};var t=localStorage.getItem("booksAndRuns:theme");var theme=ids.indexOf(t)!==-1?t:"midnight";var cb=localStorage.getItem("booksAndRuns:cardBack");var effective=cb==="match"?theme:(ids.indexOf(cb)!==-1?cb:theme);document.documentElement.setAttribute("data-cardback",effective);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: COLORBLIND_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: CARDBACK_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <SettingsSync />
          <PlayerLevelProvider>
            <PendingSaveSync />
            <GameProvider>{children}</GameProvider>
          </PlayerLevelProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
