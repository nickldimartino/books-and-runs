import type { MetadataRoute } from "next";

// Required for `output: "export"` — emitted as a static /sitemap.xml file.
export const dynamic = "force-static";

const SITE = "https://books-and-runs.vercel.app";

// The pages worth indexing: the marketing/rules surface, not the in-app
// screens (which need an account or an in-progress game to mean anything).
const PATHS = ["", "/how-to-play", "/history", "/scorecard", "/new-game", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PATHS.map((path) => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
