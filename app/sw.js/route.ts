// Emits /sw.js from sw/sw.template.js with a per-deploy build id stamped in
// (see the template's header for why the worker must differ on every deploy).
// Static like app/manifest.ts — evaluated once at `next build`, written to
// out/sw.js. Vercel serves it `no-cache` (vercel.json), so a redeploy is seen
// on the very next update check.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";

// The deploy's git SHA on Vercel; a build timestamp elsewhere (local builds,
// Capacitor bundles) so every build still produces a different worker.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? Date.now().toString(36);

export function GET() {
  const template = readFileSync(join(process.cwd(), "sw", "sw.template.js"), "utf8");
  return new Response(template.replaceAll("__BUILD_ID__", BUILD_ID), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
