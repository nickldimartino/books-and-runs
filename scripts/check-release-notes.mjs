// Fails CI when a push/PR touches player-facing code without also touching
// app/lib/releases.ts — the running changelog behind /releases and the
// notification bell's "release" items. Exists because that file went
// completely unmaintained for ~2 days and ~24 real shipped changes before
// anyone noticed (see its own git history around 2026-09-29/30) — nothing
// was ever going to catch that on its own; a human (or an AI assistant)
// has to remember every single time, and relying on memory alone had
// already failed once by the time this script was written. This doesn't
// generate entries — releases.ts's own doc comment is clear that a real
// entry takes editorial judgment (what's player-facing, feature vs. fix,
// plain-language copy) that a script has no business guessing at. It only
// makes forgetting loud instead of silent.
//
//   node scripts/check-release-notes.mjs <base-sha> <head-sha>
//
// Run from CI (see .github/workflows/ci.yml's `check` job) with the
// push/PR's own before/head SHAs. Runnable locally the same way, or with
// no args at all to diff against origin/main for a quick local check
// before pushing.

import { execFileSync } from "node:child_process";

const [, , baseArg, headArg] = process.argv;
const base = baseArg || "origin/main";
const head = headArg || "HEAD";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

// A push's recorded "before" SHA is all-zeros for a brand-new branch's
// first push (nothing to diff against yet) — nothing to check.
if (/^0+$/.test(base)) {
  console.log("check-release-notes: new branch, nothing to diff — skipping.");
  process.exit(0);
}

let changedFiles;
try {
  changedFiles = git(["diff", "--name-only", `${base}..${head}`]).split("\n").filter(Boolean);
} catch (err) {
  // A shallow checkout (the default for actions/checkout) may not have
  // `base` available at all for a push that landed a long chain of commits
  // at once, or for history actionlint/local tooling never fetched. Fail
  // open rather than block every push over a checkout-depth problem that
  // has nothing to do with whether release notes are actually missing.
  console.warn(`check-release-notes: couldn't diff ${base}..${head} (${err.message.split("\n")[0]}) — skipping.`);
  process.exit(0);
}

const RELEASES_FILE = "app/lib/releases.ts";

// Paths whose changes are plausibly something a player would notice —
// deliberately NOT .github/, e2e/, scripts/, docs, or config/tooling
// files, none of which ship anything a player sees. A change inside one
// of these paths that genuinely isn't player-facing (a pure refactor, an
// internal-only fix) still needs a human decision, not a silent
// exclusion rule here — see the opt-out marker below.
const RELEASE_WORTHY = [/^app\//, /^src\//, /^public\//, /^supabase\/migrations\//, /^supabase\/functions\//];
const NEVER_COUNTS = [/\.test\.tsx?$/, new RegExp(`^${RELEASES_FILE}$`)];

const triggering = changedFiles.filter(
  (f) => RELEASE_WORTHY.some((re) => re.test(f)) && !NEVER_COUNTS.some((re) => re.test(f))
);

if (triggering.length === 0) {
  console.log("check-release-notes: no player-facing paths changed — nothing required.");
  process.exit(0);
}

if (changedFiles.includes(RELEASES_FILE)) {
  console.log(`check-release-notes: ${RELEASES_FILE} was updated — OK.`);
  process.exit(0);
}

// Explicit, visible opt-out for a change that genuinely isn't player-
// facing (a pure refactor, moving code between files, an internal-only
// fix) despite touching a release-worthy path — a line of its own,
// anywhere in any commit message in range, same spirit as this repo's
// existing `Co-Authored-By:` trailer convention. Deliberately a human
// decision made in the commit itself, not a path this script guesses at.
const commitMessages = git(["log", "--format=%B", `${base}..${head}`]);
if (/^Release-note: none$/m.test(commitMessages)) {
  console.log("check-release-notes: commit message opted out with 'Release-note: none' — OK.");
  process.exit(0);
}

console.error(
  [
    "check-release-notes: player-facing code changed without updating app/lib/releases.ts.",
    "",
    "Files that triggered this:",
    ...triggering.map((f) => `  - ${f}`),
    "",
    `Add a new entry to ${RELEASES_FILE} (see its own doc comment for the format —`,
    "feature vs. fix, version bump, plain player-facing copy matching the existing entries).",
    "",
    "If this genuinely isn't player-facing (a pure refactor, an internal-only fix),",
    "add a line reading exactly `Release-note: none` to the commit message instead.",
  ].join("\n")
);
process.exit(1);
