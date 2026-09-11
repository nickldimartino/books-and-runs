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
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;
