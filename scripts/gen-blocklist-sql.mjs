#!/usr/bin/env node
/**
 * Prints the SQL `insert` for public.content_blocklist (migration 0060) from
 * src/safety/blocklist.ts, already normalised exactly like the client filter
 * (src/safety/contentFilter.ts) — so the database trigger and the client
 * pre-check can't drift. Run after editing the blocklist:
 *
 *   node scripts/gen-blocklist-sql.mjs
 *
 * then paste the output between the "-- BEGIN GENERATED" / "-- END GENERATED"
 * markers in the migration (or a follow-up migration). contentFilter.test.ts
 * fails if the migration is missing any entry.
 */
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const dir = mkdtempSync(join(tmpdir(), "blocklist-"));
const out = join(dir, "filter.mjs");
await build({
  entryPoints: [join(root, "src/safety/contentFilter.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "silent",
});
const mod = await import(pathToFileURL(out).href);
const q = (s) => `'${s.replace(/'/g, "''")}'`;
const rows = [
  ...mod.compiledBlocklist().map((c) => `  (${q(c.term)}, ${q(c.loose)}, ${q(c.mode)})`),
  ...mod.compiledReserved().map((c) => `  (${q(c.term)}, ${q(c.term)}, ${q(c.mode)})`),
];
console.log("-- BEGIN GENERATED (scripts/gen-blocklist-sql.mjs)");
console.log("insert into public.content_blocklist (term, term_loose, mode) values");
console.log(rows.join(",\n"));
console.log("on conflict (term, mode) do nothing;");
console.log("-- END GENERATED");
console.log(`-- accent from: ${mod.ACCENT_FROM}`);
console.log(`-- accent to:   ${mod.ACCENT_TO}`);
