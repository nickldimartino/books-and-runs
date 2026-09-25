import type { MetadataRoute } from "next";

// Required for `output: "export"` — emitted as a static /sitemap.xml file.
export const dynamic = "force-static";

const SITE = "https://books-and-runs.vercel.app";

// The pages worth indexing: the marketing/rules surface, not the in-app
// screens (which need an account or an in-progress game to mean anything).
const PATHS = ["", "/how-to-play", "/history", "/scorecard", "/new-game", "/privacy", "/terms", "/support"];

// A real content date instead of "now on every build" (which tells crawlers
// every page changed every deploy and gets the signal ignored). Bump when
// public-page content meaningfully changes.
const CONTENT_UPDATED = new Date("2026-09-25");

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({
    url: `${SITE}${path}`,
    lastModified: CONTENT_UPDATED,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
