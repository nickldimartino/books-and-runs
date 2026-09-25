// Client-side pre-check (and the reference implementation) for public text:
// display names, bios, club/tournament names. Framework-free. The database
// enforces the same rules with a trigger (migration 0060: content_flagged())
// so this file is a friendly early rejection, never the only gate.
//
// Pipeline (mirrored 1:1 in SQL — keep the two in step, and the leet/accent
// tables below are printed into the migration by scripts/gen-blocklist-sql.mjs):
//   1. NFKC (folds full-width/compat forms) + lower-case
//   2. accent-fold (é→e, ñ→n, ß→ss, ё→е …) and leet-fold (0→o 1→i 3→e 4→a
//      5→s 7→t @→a $→s)
//   3. split into words on anything that isn't a letter/number; runs of 3+
//      single letters ("f u c k", "f.u.c.k") are joined back into one word
//      (also without a leading "a"/"i": "a f u c k")
//   4. "squash" = all words joined; runs of 3+ identical a-z letters are
//      cut to 2 (fuuuuck → fuuck) and, for the looser second pass, every
//      run to 1 (fuuck → fuck), so stretched spellings still match.

import { BLOCKED_TERMS, RESERVED_NAMES } from "./blocklist";

export type ContentKind = "name" | "bio" | "title";
export type ContentIssue = "empty" | "profanity" | "impersonation" | "link";

export interface ContentCheck {
  ok: boolean;
  issue?: ContentIssue;
}

// Accent-fold groups: every character on the left maps to the letter on the
// right. Built as pairs so the two strings printed into SQL (translate(x,
// FROM, TO)) can never fall out of alignment.
const ACCENT_GROUPS: [string, string][] = [
  ["àáâãäåāăą", "a"],
  ["çćč", "c"],
  ["ďđ", "d"],
  ["èéêëēėęě", "e"],
  ["ìíîïīį", "i"],
  ["ł", "l"],
  ["ñńň", "n"],
  ["òóôõöøōő", "o"],
  ["ŕř", "r"],
  ["śšş", "s"],
  ["ť", "t"],
  ["ùúûüūůűų", "u"],
  ["ýÿ", "y"],
  ["źżž", "z"],
  ["ё", "\u0435"], // Cyrillic ё → е
];
export const ACCENT_FROM = ACCENT_GROUPS.map(([f]) => f).join("");
export const ACCENT_TO = ACCENT_GROUPS.map(([f, t]) => t.repeat([...f].length)).join("");
export const LEET_FROM = "013457@$";
export const LEET_TO = "oieastas";
/** Multi-character folds applied before the 1:1 translate (ß→ss …). */
export const MULTI_FOLDS: [string, string][] = [
  ["ß", "ss"],
  ["æ", "ae"],
  ["œ", "oe"],
];

const ACCENT_MAP = new Map<string, string>([...ACCENT_FROM].map((c, i) => [c, [...ACCENT_TO][i]]));
const LEET_MAP = new Map<string, string>([...LEET_FROM].map((c, i) => [c, LEET_TO[i]]));

/** Steps 1–2. */
export function foldText(input: string): string {
  let s = input.normalize("NFKC").toLowerCase();
  for (const [from, to] of MULTI_FOLDS) s = s.split(from).join(to);
  let out = "";
  for (const ch of s) out += ACCENT_MAP.get(ch) ?? LEET_MAP.get(ch) ?? ch;
  return out;
}

/** Runs of 3+ identical a-z letters cut to 2. */
const cut3 = (s: string) => s.replace(/([a-z])\1{2,}/g, "$1$1");
/** Every run of identical a-z letters cut to 1. */
const cut1 = (s: string) => s.replace(/([a-z])\1+/g, "$1");

interface Forms {
  /** Words with runs of 3+ letters cut to 2. */
  words: string[];
  /** Parallel to `words`: the raw word contained a 3+ run (a "stretched"
   * spelling like fuuuck), so the fully-collapsed form may be compared too.
   * Natural double letters (shiitake) never earn the loose comparison. */
  stretched: boolean[];
  squash: string;
  squashLoose: string;
}

const STRETCH_RE = /([a-z])\1{2,}/;

/** "f u c k" / "f.u.c.k": 3+ consecutive single-letter words are one word. */
function mergeSpelledOut(words: string[]): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length >= 3) {
      out.push(buf.join(""));
      // "you are a f u c k": the real one-letter word "a"/"i" glued onto the
      // front of the run must not hide it, so also try the run without it.
      if ((buf[0] === "a" || buf[0] === "i") && buf.length >= 4) out.push(buf.slice(1).join(""));
    } else out.push(...buf);
    buf = [];
  };
  for (const w of words) {
    if (/^[a-z]$/.test(w)) buf.push(w);
    else {
      flush();
      out.push(w);
    }
  }
  flush();
  return out;
}

export function formsOf(input: string): Forms {
  const raw = foldText(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const words = mergeSpelledOut(raw);
  const squash = cut3(raw.join(""));
  return { words: words.map(cut3), stretched: words.map((w) => STRETCH_RE.test(w)), squash, squashLoose: cut1(squash) };
}

interface Compiled {
  term: string; // 3+→2 form
  loose: string; // fully collapsed form
  mode: "sub" | "stem" | "word";
}

/** Compiled blocklist entries as stored in the database (term, loose, mode). */
export function compiledBlocklist(): Compiled[] {
  const seen = new Set<string>();
  const out: Compiled[] = [];
  for (const b of BLOCKED_TERMS) {
    const f = formsOf(b.term);
    const term = f.squash;
    const key = `${b.mode}:${term}`;
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push({ term, loose: f.squashLoose, mode: b.mode });
  }
  return out;
}

/** Impersonation guards as stored in the database (mode res_exact /
 * res_contains / res_prefix; `term_loose` is unused for these). */
export function compiledReserved(): { term: string; mode: "res_exact" | "res_contains" | "res_prefix" }[] {
  const squash = (t: string) => formsOf(t).squash;
  return [
    ...RESERVED_NAMES.exact.map((t) => ({ term: squash(t), mode: "res_exact" as const })),
    ...RESERVED_NAMES.contains.map((t) => ({ term: squash(t), mode: "res_contains" as const })),
    ...RESERVED_NAMES.prefix.map((t) => ({ term: squash(t), mode: "res_prefix" as const })),
  ];
}

const COMPILED = compiledBlocklist();
const RESERVED = {
  exact: compiledReserved().filter((r) => r.mode === "res_exact").map((r) => r.term),
  contains: compiledReserved().filter((r) => r.mode === "res_contains").map((r) => r.term),
  prefix: compiledReserved().filter((r) => r.mode === "res_prefix").map((r) => r.term),
};

const LINK_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|gg|ly|me|co|app|xyz|ru|cn)\b|@[a-z0-9-]+\.[a-z]{2,})/i;

function hasProfanity(f: Forms): boolean {
  for (const b of COMPILED) {
    if (b.mode === "sub") {
      // Strict form only: the loose (fully-collapsed) form would turn
      // "nigeria" into a match for "niger"-like terms.
      if (f.squash.includes(b.term)) return true;
    } else if (b.mode === "stem") {
      if (f.words.some((w, i) => w.startsWith(b.term) || (f.stretched[i] && cut1(w).startsWith(b.loose)))) return true;
    } else if (f.words.some((w, i) => w === b.term || (f.stretched[i] && cut1(w) === b.loose))) {
      return true;
    }
  }
  return false;
}

function isImpersonation(f: Forms): boolean {
  const s = f.squash;
  if (!s) return false;
  return (
    RESERVED.exact.includes(s) ||
    RESERVED.contains.some((t) => s.includes(t)) ||
    RESERVED.prefix.some((t) => s.startsWith(t))
  );
}

/** Checks one piece of public text. `name` also rejects staff impersonation
 * and links; `bio` rejects links; `title` (club/tournament names) is like
 * `name`. Empty text is fine for a bio (means "clear it"); names must not be
 * blank. */
export function checkContent(text: string, kind: ContentKind): ContentCheck {
  const trimmed = text.trim();
  if (!trimmed) return kind === "bio" ? { ok: true } : { ok: false, issue: "empty" };
  const f = formsOf(trimmed);
  if (hasProfanity(f)) return { ok: false, issue: "profanity" };
  if (kind !== "bio" && isImpersonation(f)) return { ok: false, issue: "impersonation" };
  if (LINK_RE.test(trimmed)) return { ok: false, issue: "link" };
  return { ok: true };
}

export const checkDisplayName = (t: string) => checkContent(t, "name");
export const checkBio = (t: string) => checkContent(t, "bio");
export const checkTitle = (t: string) => checkContent(t, "title");
