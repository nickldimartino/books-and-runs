import type { NextConfig } from "next";

// The whole app is client-rendered (game logic runs on-device, Supabase auth
// runs from the browser) — no server-only features are used, so it can ship
// as a fully static export for Capacitor to bundle into the iOS shell.
// A short build identifier — the deploy's git SHA on Vercel, else the
// package version. Stamped onto client error reports and analytics so a
// spike can be tied to a release.
const appVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
  process.env.npm_package_version ??
  "dev";

const nextConfig: NextConfig = {
  output: "export",
  // Lets a side build (bundle analysis, Lighthouse) write to its own folder
  // without clobbering .next/out while a dev server or another build runs:
  //   BR_DIST_DIR=.build-alt npm run build   (static export lands in .build-alt)
  // (Side builds also skip the type check: they exist to measure bundles, and
  // `tsc --noEmit` is the gate for correctness.)
  ...(process.env.BR_DIST_DIR
    ? { distDir: process.env.BR_DIST_DIR, typescript: { ignoreBuildErrors: true } }
    : {}),
  images: { unoptimized: true },
  // Dev-only: the route badge sits bottom-left, right on top of the app nav's
  // Play tab (and intercepts Playwright's clicks on it). Compile/runtime error
  // overlays still show.
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;
