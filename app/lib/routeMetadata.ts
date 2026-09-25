// Per-route <head> metadata for the static export. Every screen except Home
// is a Client Component (`"use client"` can't export `metadata`), so each
// route gets a tiny server `layout.tsx` that calls this. Crawler- and
// link-preview-visible tags are English by design: the export is prerendered
// once per route at build time, and the display language is a client-side
// preference (localStorage) — there is one URL per screen, not one per
// language, so there is nothing for hreflang to point at. See CODEBASE_MAP.md
// "SEO / metadata" for what locale-prefixed routes would take.
//
// The title is the page-specific part only — the root layout's title.template
// appends " — Books & Runs".

import type { Metadata } from "next";

const SITE_NAME = "Books & Runs";
// A route that sets its own openGraph/twitter object *replaces* the root's —
// including the image the root's opengraph-image.tsx file convention adds —
// so the shared card is re-attached explicitly (the file is emitted at this
// un-hashed path by the static export).
const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Books & Runs — a free Contract Rummy card game" };

export function routeMetadata(opts: {
  title: string;
  description: string;
  /** Path for og:url, e.g. "/friends". */
  path: string;
  /** In-app screens that need an account or live state have nothing to
   * index; noindex keeps thin "sign in to see this" pages out of search. */
  index?: boolean;
}): Metadata {
  const { title, description, path, index = true } = opts;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? undefined : { index: false, follow: false },
    openGraph: { type: "website", siteName: SITE_NAME, title: `${title} — ${SITE_NAME}`, description, url: path, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} — ${SITE_NAME}`, description, images: [OG_IMAGE.url] },
  };
}
