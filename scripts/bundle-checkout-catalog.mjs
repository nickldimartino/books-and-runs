#!/usr/bin/env node
/**
 * Copies the boutique store's pure pricing/request-building modules
 * (src/store/) into supabase/functions/create-checkout-session/_engine/
 * so the function can import them, adding the explicit `.ts` extensions
 * Deno requires on relative imports (the app's bundler/tsc don't need
 * them, so src/ stays extension-less) — same idea as
 * bundle-mp-engine.mjs/bundle-solo-verify-engine.mjs, kept as its own
 * script rather than a shared/parameterized one so nothing about those
 * already-working bundles can regress from a change made for this
 * function. Deliberately narrow (src/store/ only, not all of src/) since
 * create-checkout-session never touches the game engine.
 *
 * Run before deploying the function:
 *   node scripts/bundle-checkout-catalog.mjs && supabase functions deploy create-checkout-session
 *
 * _engine/ is gitignored and fully regenerated each run.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(root, "src/store");
const OUT = join(root, "supabase/functions/create-checkout-session/_engine/store");

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

rmSync(OUT, { recursive: true, force: true });
const files = walk(SRC);
for (const file of files) {
  const rel = relative(SRC, file);
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, addExtensions(readFileSync(file, "utf8"), dirname(file)));
}
console.log(`bundled ${files.length} store file(s) → ${relative(root, OUT)}/`);
