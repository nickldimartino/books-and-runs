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
    orientation: "portrait",
    categories: ["games", "entertainment"],
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
