#!/usr/bin/env node
/**
 * Copies the pure game engine (src/) into
 * supabase/functions/solo-verify/_engine/ so the `solo-verify` Edge
 * Function can import it, adding the explicit `.ts` extensions Deno
 * requires on relative imports (the app's bundler/tsc don't need them, so
 * src/ stays extension-less). A near-duplicate of bundle-mp-engine.mjs
 * (same walk/SKIP/addExtensions logic, different SKIP list and output
 * dir) rather than a shared, parameterized script — kept deliberately
 * separate so nothing about the already-working `mp` bundle can regress
 * from a change made for this function.
 *
 * Run before deploying the function:
 *   node scripts/bundle-solo-verify-engine.mjs && supabase functions deploy solo-verify
 *
 * _engine/ is gitignored and fully regenerated each run.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(root, "src");
const OUT = join(root, "supabase/functions/solo-verify/_engine");

// solo-verify's import graph (gameEngine, meld, deck, scorer, types,
// moveLog, replayStats, solo/replay) never touches ai/*, mp/*, the
// tutorial's fixed deal, or app-progression code (achievements, leveling,
// the demo script) — skip all of it so the deployed bundle stays small,
// same spirit as bundle-mp-engine.mjs's own SKIP list.
const SKIP_FILES = new Set(["testHelpers.ts", "achievements.ts", "leveling.ts", "tutorial.ts", "demo.ts"]);
const SKIP_DIRS = new Set(["ai", "mp"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...walk(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !SKIP_FILES.has(entry)) {
      out.push(full);
    }
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
