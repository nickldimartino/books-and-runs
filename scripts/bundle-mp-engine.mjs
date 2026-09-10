#!/usr/bin/env node
/**
 * Copies the pure game engine (src/) into supabase/functions/mp/_engine/ so
 * the `mp` Edge Function can import it, adding the explicit `.ts` extensions
 * Deno requires on relative imports (the app's bundler/tsc don't need them,
 * so src/ stays extension-less).
 *
 * Run before deploying the function:
 *   node scripts/bundle-mp-engine.mjs && supabase functions deploy mp
 *
 * _engine/ is gitignored and fully regenerated each run.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(root, "src");
const OUT = join(root, "supabase/functions/mp/_engine");

// Only the pieces the MP adapter's import graph touches. The rest of src/
// (achievements, leveling, the tutorial deal, the demo script) is
// app-progression code the Edge Function never runs.
const SKIP = (f) =>
  f.endsWith(".test.ts") ||
  ["testHelpers.ts", "achievements.ts", "leveling.ts", "tutorial.ts", "demo.ts"].includes(f);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts") && !SKIP(entry)) out.push(full);
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
console.log(`bundled ${files.length} engine file(s) → ${relative(root, OUT)}/`);
