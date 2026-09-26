// The root layout — mounted once for every route. Wires up the app-wide
// provider tree (see CODEBASE_MAP.md §3a for the full mount order and why
// it's ordered the way it is) plus SEO/social metadata and the pre-paint
// theme script below. Nothing route-specific belongs here.

import type { Metadata, Viewport } from "next";
import { AccountSettingsSync } from "./AccountSettingsSync";
import { AccountSwitchGuard } from "./AccountSwitchGuard";
import { AuthProvider } from "./AuthContext";
import { GameProvider } from "./GameContext";
import { AppNav } from "./components/AppNav";
import { DocumentTitleLocalizer } from "./components/DocumentTitleLocalizer";
import { InstallHint } from "./components/InstallHint";
import { NavTrailTracker } from "./components/NavTrailTracker";
import { ShellEffects } from "./components/ShellEffects";
import { ToastHost } from "./components/ToastHost";
import { GamepadNavigation } from "./components/GamepadNavigation";
import { LocaleProvider } from "./lib/i18n/LocaleProvider";
import { NotificationsProvider } from "./lib/NotificationsContext";
import { LocalSaveSync } from "./LocalSaveSync";
import { PendingSaveSync } from "./PendingSaveSync";
import { PlayerLevelProvider } from "./PlayerLevelContext";
import { HtmlAttrsRestore } from "./components/HtmlAttrsRestore";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";
import { UpdateAvailableBanner } from "./UpdateAvailableBanner";
import { DEFAULT_THEME, THEME_BG } from "./lib/themeStore";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://books-and-runs.vercel.app"),
  title: {
    default: "Books & Runs — free Contract Rummy card game",
    template: "%s — Books & Runs",
  },
  description:
    "Books & Runs is a free browser-based Contract Rummy card game. Play solo against five levels of AI, pass-and-play with friends on one device, or turn-based online — no download required.",
  applicationName: "Books & Runs",
  category: "games",
  // iOS Home Screen: "Add to Home Screen" launches full-screen with this title
  // (Chrome's equivalent comes from the web manifest). Emits
  // <meta name="mobile-web-app-capable"> + the apple-mobile-web-app-* tags.
  appleWebApp: { capable: true, title: "Books & Runs" },
  formatDetection: { telephone: false },
  keywords: ["Contract Rummy", "card game", "rummy", "books and runs", "free card game", "Liverpool Rummy"],
  verification: {
    google: "jI87NzjdGYGEBETrJ4QjX6sIetF6C7kZLg-p4zkwYbc",
  },
  openGraph: {
    type: "website",
    siteName: "Books & Runs",
    locale: "en_US",
    // Deliberately just the name, not the full "Books & Runs — free
    // Contract Rummy..." <title> — iMessage/Safari's rich link preview
    // strips a title's leading "SiteName — " prefix when it matches
    // og:site_name, so with the longer title this widget was showing only
    // the tagline half ("free Contract Rummy card game") with no app name
    // visible at all. A bare og:title sidesteps that stripping entirely.
    title: "Books & Runs",
    description:
      "Play Contract Rummy solo against AI, pass-and-play on one device, or turn-based online with friends. Free, no download.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Books & Runs — free Contract Rummy card game",
    description: "Contract Rummy solo vs AI, pass-and-play, or online with friends. Free, no download.",
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

// Applies the saved theme/colorblind-mode/card-back before first paint, and
// arms the first-visit intro — all four used to be inline
// <script dangerouslySetInnerHTML> tags here, generated from THEMES/
// THEME_BG/COLORBLIND_MODES at build time. Moved to public/init.js, loaded
// below as a plain, deliberately-synchronous <script src> in the same spot
// — the whole point is running during HTML parsing, before the browser's
// first paint, so a returning visitor's saved theme is already applied by
// the time anything is on screen; that's also exactly why it's NOT
// next/script's beforeInteractive strategy despite the name — that
// executes once Next's own client bootstrap runs and inserts it, which
// isn't guaranteed to land before first paint the way parsing a plain
// synchronous <script> does (verified by watching for a theme flash with
// each approach). The eslint-disable below is that same tradeoff, not an
// oversight — a blocking script is the point, not a bug.
//
// This was originally meant to also let vercel.json's CSP drop
// script-src 'unsafe-inline' — turned out not to be reachable: this
// (modified) Next's App Router streams the RSC payload into the client via
// its own inline `<script>self.__next_f.push(...)</script>` tags (visible
// in `out/*.html` after a build), a different mechanism entirely and not
// something app code controls. Tested directly (a local static server
// replaying vercel.json's header with 'unsafe-inline' removed): those
// tags get blocked and hydration fails outright (React error #412) on
// every page. Keeping this file external anyway — real code organization
// win, and it's one less inline script in the count if Next ever offers a
// nonce/hash mechanism for the RSC payload itself.

// Structured data for search results (SoftwareApplication → rich "free game"
// result). A data block, not executable, so the CSP's script-src doesn't apply.
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Books & Runs",
  url: "https://books-and-runs.vercel.app",
  applicationCategory: "GameApplication",
  operatingSystem: "Any (web browser)",
  inLanguage: ["en", "zh", "ja", "ko", "de", "fr", "es", "pt-BR", "ru", "it"],
  description:
    "A free browser-based Contract Rummy card game: solo against AI, pass-and-play, or turn-based online with friends.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- deliberately blocking, see the comment above */}
        <script src={`/init.js?v=${process.env.NEXT_PUBLIC_APP_VERSION}`} />
      </head>
      <body className="min-h-screen antialiased">
        <HtmlAttrsRestore />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
        <ServiceWorkerRegistrar />
        <LocaleProvider>
          <UpdateAvailableBanner />
          <ToastHost />
          <DocumentTitleLocalizer />
          <GamepadNavigation />
          <AuthProvider>
            <AccountSwitchGuard />
            <AccountSettingsSync />
            <NavTrailTracker />
            <ShellEffects />
            <InstallHint />
            <PlayerLevelProvider>
              <PendingSaveSync />
              <GameProvider>
                <NotificationsProvider>
                  <LocalSaveSync />
                  {children}
                  <AppNav />
                </NotificationsProvider>
              </GameProvider>
            </PlayerLevelProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
