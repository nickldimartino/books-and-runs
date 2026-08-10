import type { NextConfig } from "next";

// The whole app is client-rendered (game logic runs on-device, Supabase auth
// runs from the browser) — no server-only features are used, so it can ship
// as a fully static export for Capacitor to bundle into the iOS shell.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
