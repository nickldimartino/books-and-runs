import type { MetadataRoute } from "next";

// Required for `output: "export"` — this route has no request-time data, so
// it can (and must) be emitted as a static file at build time.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Books & Runs",
    short_name: "Books & Runs",
    description:
      "A free browser-based Contract Rummy card game. Play solo against AI opponents or pass-and-play with friends on one device.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a2b20",
    theme_color: "#0a2b20",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
