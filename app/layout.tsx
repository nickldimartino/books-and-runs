import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./AuthContext";
import { GameProvider } from "./GameContext";
import { SettingsSync } from "./SettingsSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "Books & Runs",
  description: "Local pass-and-play card game with AI opponents",
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
// to whatever the visitor picked last time.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("booksAndRuns:theme");if(["midnight","daylight","pastel","casino","arcade"].indexOf(t)!==-1){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <SettingsSync />
          <GameProvider>{children}</GameProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
