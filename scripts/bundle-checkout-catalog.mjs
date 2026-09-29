#!/usr/bin/env node
/**
 * Copies the boutique store's pure pricing/request-building modules
 * (src/store/) into _engine/ under BOTH Edge Functions that need them —
 * create-checkout-session (price/name lookups, Checkout Session building)
 * AND stripe-webhook (CATALOG_BUNDLES + expandPurchasedSkus, to expand a
 * bundle sku into its member skus at entitlement-grant time — see
 * entitlements.ts) — adding the explicit `.ts` extensions Deno requires on
 * relative imports (the app's bundler/tsc don't need them, so src/ stays
 * extension-less) — same idea as bundle-mp-engine.mjs/
 * bundle-solo-verify-engine.mjs, kept as its own script rather than a
 * shared/parameterized one so nothing about those already-working bundles
 * can regress from a change made for this one. Deliberately narrow
 * (src/store/ only, not all of src/) since neither function touches the
 * game engine.
 *
 * Run before deploying EITHER function (both read from the same source,
 * so one run covers both):
 *   node scripts/bundle-checkout-catalog.mjs && npx supabase functions deploy create-checkout-session
 *   node scripts/bundle-checkout-catalog.mjs && npx supabase functions deploy stripe-webhook
 *
 * Both _engine/ dirs are gitignored and fully regenerated each run.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(root, "src/store");
const OUT_DIRS = [
  join(root, "supabase/functions/create-checkout-session/_engine/store"),
  join(root, "supabase/functions/stripe-webhook/_engine/store"),
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Rewrite `from "./x"` / `from "../y/z"` → add `.ts` when it resolves to a file. */
function addExtensions(code, fileDir) {
  return code.replace(
    /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,
    (match, kw, quote, spec) => {
      if (spec.endsWith(".ts") || spec.endsWith(".json")) return match;
      const asFile = resolve(fileDir, `${spec}.ts`);
      const asIndex = resolve(fileDir, spec, "index.ts");
      const target = existsSync(asFile) ? `${spec}.ts` : existsSync(asIndex) ? `${spec}/index.ts` : null;
      if (!target) {
        console.warn(`  ! could not resolve ${spec} from ${relative(root, fileDir)}`);
        return match;
      }
      return `${kw}${quote}${target}${quote}`;
    }
  );
}

const files = walk(SRC);
for (const OUT of OUT_DIRS) {
  rmSync(OUT, { recursive: true, force: true });
  for (const file of files) {
    const rel = relative(SRC, file);
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, addExtensions(readFileSync(file, "utf8"), dirname(file)));
  }
  console.log(`bundled ${files.length} store file(s) → ${relative(root, OUT)}/`);
}
