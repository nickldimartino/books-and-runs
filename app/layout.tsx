import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./AuthContext";
import { GameProvider } from "./GameContext";
import { PendingSaveSync } from "./PendingSaveSync";
import { PlayerLevelProvider } from "./PlayerLevelContext";
import { SettingsSync } from "./SettingsSync";
import { THEMES } from "./lib/themeStore";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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
