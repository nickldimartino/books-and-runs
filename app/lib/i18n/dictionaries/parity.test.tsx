// Dictionary guard: every locale must stay structurally identical to en.ts
// (the source of truth) so a new feature can't ship half-translated.
// Run alone with `npm run i18n:check`. See AGENTS.md "Adding user-visible text".
import { describe, expect, it } from "vitest";
import en from "./en";
import zh from "./zh";
import ja from "./ja";
import ko from "./ko";
import de from "./de";
import fr from "./fr";
import es from "./es";
import ptBR from "./pt-BR";
import ru from "./ru";
import it_ from "./it";
import { SAME_AS_ENGLISH_ALLOWLIST, allowsSameAsEnglish, allowsEmpty, EMPTY_OK } from "../sameAsEnglishAllowlist";

type Dict = Record<string, string>;
const ENGLISH = en as Dict;
const LOCALES: Record<string, Dict> = { zh, ja, ko, de, fr, es, "pt-BR": ptBR, ru, it: it_ };

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/;

/** Plural categories `locale` needs, straight from Intl.PluralRules. */
function requiredForms(locale: string): string[] {
  // Categories reachable for ordinary counts. CLDR's "many" for fr/es/it/pt is
  // only for whole millions ("1 million of books"), which no UI string here
  // ever shows, so it is not required there (tPlural falls back to .other).
  const pr = new Intl.PluralRules(locale);
  const seen = new Set<string>();
  for (let n = 0; n <= 1000; n++) seen.add(pr.select(n));
  seen.add(pr.select(1.5));
  return [...seen].sort();
}

/** Base keys that are plural families in en (have a ".other" sibling). */
function pluralBases(dict: Dict): string[] {
  return Object.keys(dict)
    .filter((k) => k.endsWith(".other") && dict[k.replace(/\.other$/, ".one")] !== undefined)
    .map((k) => k.replace(/\.other$/, ""));
}

describe("i18n dictionary parity", () => {
  for (const [id, dict] of Object.entries(LOCALES)) {
    describe(id, () => {
      it("has exactly the same keys as en.ts, modulo the locale's plural forms", () => {
        const enBases = new Set(pluralBases(ENGLISH));
        const norm = (keys: string[]) =>
          new Set(keys.filter((k) => !(PLURAL_SUFFIX.test(k) && enBases.has(k.replace(PLURAL_SUFFIX, "")))));
        const a = norm(Object.keys(ENGLISH));
        const b = norm(Object.keys(dict));
        const missing = [...a].filter((k) => !b.has(k));
        const extra = [...b].filter((k) => !a.has(k));
        expect({ missing, extra }, `keys missing/extra in ${id}`).toEqual({ missing: [], extra: [] });
      });

      it("has the same {placeholder} set for every key (plural siblings compared to .other)", () => {
        const bad: string[] = [];
        for (const [k, v] of Object.entries(dict)) {
          const ref = ENGLISH[k] ?? ENGLISH[k.replace(PLURAL_SUFFIX, ".other")];
          if (ref === undefined) continue; // covered by the key-set test
          // A plural form may legitimately drop {count} when it hard-codes the number
          // ("one book"); every other token must still match.
          const want = placeholders(ref).filter((p) => p !== "count");
          const got = placeholders(v).filter((p) => p !== "count");
          if (want.join() !== got.join()) bad.push(`${k}: en {${want}} vs ${id} {${got}}`);
        }
        expect(bad, `placeholder mismatches in ${id}`).toEqual([]);
      });

      it("has every plural form this locale's Intl.PluralRules needs", () => {
        const need = requiredForms(id === "pt-BR" ? "pt-BR" : id);
        const bad: string[] = [];
        for (const base of pluralBases(ENGLISH)) {
          for (const f of need) if (!dict[`${base}.${f}`]) bad.push(`${base}.${f} missing`);
        }
        expect(bad, `plural forms in ${id}`).toEqual([]);
      });

      it("has no empty or whitespace-only strings", () => {
        const empty = Object.entries(dict)
          .filter(([, v]) => typeof v !== "string" || v.trim() === "")
          .map(([k]) => k)
          .filter((k) => !allowsEmpty(id, k));
        expect(empty, `empty values in ${id}`).toEqual([]);
      });

      it("has no value that looks untranslated (identical to English) unless allowlisted", () => {
        const suspects: string[] = [];
        for (const [k, v] of Object.entries(dict)) {
          const ref = ENGLISH[k] ?? ENGLISH[k.replace(PLURAL_SUFFIX, ".other")];
          if (ref === undefined || v !== ref) continue;
          // Only words count: skip symbols/numbers/very short tokens.
          if (v.replace(/\{\w+\}/g, "").replace(/[^\p{L}]/gu, "").length <= 3) continue;
          if (allowsSameAsEnglish(id, k)) continue;
          suspects.push(`${k} = ${JSON.stringify(v)}`);
        }
        expect(
          suspects,
          `${id}: these values are identical to English. Translate them, or add the key to app/lib/i18n/sameAsEnglishAllowlist.ts with a reason:`,
        ).toEqual([]);
      });
    });
  }

  it("allowlist has no stale keys", () => {
    const stale = [...Object.keys(SAME_AS_ENGLISH_ALLOWLIST), ...Object.keys(EMPTY_OK)].filter((k) => !(k in ENGLISH));
    expect(stale, "sameAsEnglishAllowlist keys that no longer exist in en.ts").toEqual([]);
  });
});
