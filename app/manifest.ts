import type { MetadataRoute } from "next";

// Required for `output: "export"` — this route has no request-time data, so
// it can (and must) be emitted as a static file at build time.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Books & Runs",
    short_name: "Books & Runs",
    description:
      "A free browser-based Contract Rummy card game. Play solo against AI opponents or pass-and-play with friends on one device.",
    start_url: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    // "any", not "portrait": a locked portrait orientation is honoured by
    // Android/tablet installs and forced iPad-landscape and desktop windows
    // into a rotated layout. The UI is a centred column that works in both.
    orientation: "any",
    categories: ["games", "entertainment"],
    lang: "en",
    dir: "ltr",
    // Long-press the installed icon (Android/desktop) for these. Names are
    // English like the rest of the manifest — a static file can't follow the
    // in-app language setting.
    shortcuts: [
      {
        name: "New game",
        short_name: "New game",
        description: "Start a solo, pass-and-play or online game",
        url: "/new-game",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Multiplayer games",
        short_name: "Multiplayer",
        description: "Your turn-based games with friends",
        url: "/multiplayer",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Friends",
        short_name: "Friends",
        description: "Friend requests, invites and your friend code",
        url: "/friends",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    // Store-style previews: Chrome/Android show them in the richer install
    // dialog; a TWA/Play listing needs them. Real captures of the running app
    // (regenerate with `node scripts/capture-screenshots.mjs` against a build).
    screenshots: [
      { src: "/screenshots/home-narrow.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "Home: start a game, your daily deal and games in progress" },
      { src: "/screenshots/game-narrow.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "A round of Contract Rummy against the AI" },
      { src: "/screenshots/themes-narrow.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "Dozens of table themes" },
      { src: "/screenshots/home-wide.png", sizes: "1920x1080", type: "image/png", form_factor: "wide", label: "Home: start a game, your daily deal and games in progress" },
      { src: "/screenshots/game-wide.png", sizes: "1920x1080", type: "image/png", form_factor: "wide", label: "A round of Contract Rummy against the AI" },
    ],
    // Midnight is the default theme (see themeStore.ts) — matches the
    // before-paint theme init and the launch splash. The running page's own
    // <meta name="theme-color"> (layout.tsx) tracks the chosen theme after.
    background_color: "#0a2b20",
    theme_color: "#0a2b20",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The icon art (two cards, centred, on a full-bleed felt ground) keeps
      // its subject well inside the maskable safe zone, so the same files
      // double as maskable — a circular/squircle mask only clips the green.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
