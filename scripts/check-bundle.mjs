// Guards the "Supabase SDK is not in the initial bundle" optimisation (see
// app/lib/supabaseClient.ts loadSupabase). Run after `npm run build`.
//
//   node scripts/check-bundle.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";
const CHUNKS = join(OUT, "_next", "static", "chunks");

if (!existsSync(CHUNKS)) {
  console.error("no build output — run `npm run build` first");
  process.exit(1);
}

// Which chunk files contain the Supabase auth client?
const sdkChunks = readdirSync(CHUNKS)
  .filter((f) => f.endsWith(".js"))
  .filter((f) => readFileSync(join(CHUNKS, f), "utf8").includes("GoTrueClient"))
  .map((f) => f);

if (sdkChunks.length === 0) {
  console.error("couldn't find the Supabase SDK in any chunk — did the build change?");
  process.exit(1);
}

// Does any prerendered page HTML load one of those chunks directly?
const htmls = readdirSync(OUT).filter((f) => f.endsWith(".html"));
const offenders = htmls.filter((h) => {
  const html = readFileSync(join(OUT, h), "utf8");
  return sdkChunks.some((c) => html.includes(c));
});

if (offenders.length > 0) {
  console.error(
    `Supabase SDK is in the initial bundle of: ${offenders.join(", ")}\n` +
      `It must only load via loadSupabase()'s dynamic import.`
  );
  process.exit(1);
}

console.log(`OK — Supabase SDK (${sdkChunks.join(", ")}) is lazy-loaded on all ${htmls.length} pages.`);
