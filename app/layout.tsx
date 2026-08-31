import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./AuthContext";
import { GameProvider } from "./GameContext";
import { PendingSaveSync } from "./PendingSaveSync";
import { PlayerLevelProvider } from "./PlayerLevelContext";
import { SettingsSync } from "./SettingsSync";
import { THEMES } from "./lib/themeStore";
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
export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

// Applies a previously-chosen theme before first paint, so static export's
// server-rendered (theme-less) HTML doesn't flash Midnight before swapping
// to whatever the visitor picked last time. The allow-list is generated
// from THEMES itself (not hand-copied) so adding a theme there can never
// again silently leave this check stale — a stale list here meant a saved
// theme applied fine within a session (applyTheme sets the attribute
// directly) but silently reverted to Midnight on every full page load.
const THEME_IDS_JSON = JSON.stringify(THEMES.map((t) => t.id));
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("booksAndRuns:theme");if(${THEME_IDS_JSON}.indexOf(t)!==-1){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

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
