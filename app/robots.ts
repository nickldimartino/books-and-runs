import type { MetadataRoute } from "next";

// Required for `output: "export"` — emitted as a static /robots.txt file.
export const dynamic = "force-static";

const SITE = "https://books-and-runs.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // In-progress-game and account screens have nothing to index and
        // some carry query params (?g=, ?add=, ?from=) that shouldn't be
        // crawled or surfaced.
        disallow: ["/game", "/multiplayer/", "/reset-password", "/account"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
