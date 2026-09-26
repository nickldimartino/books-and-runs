// Dev-only pseudo-locale. Every English string becomes bracketed, accented
// text with {placeholders} preserved, e.g. "Unlock new streak" ->
// "[Ûñĺôçķ ñéŵ ŝţŕéàķ]". Any visible UI text that is still plain ASCII English
// on a page rendered in this locale was NOT routed through t() -- that is what
// e2e/pseudo-locale.spec.ts looks for, without needing 9 real translations.
//
// Enabled by LocaleProvider only in non-production builds, via `?lang=xx` or
// localStorage["booksAndRuns:pseudoLocale"] = "1". It is never a LocaleId and
// never shows in the language picker.

const FROM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TO = "àƀçďéƒĝĥíĵķĺḿñöƥɋŕśţûṽŵẋýžÀßÇĎÉƑĜĤÍĴĶĹḾÑÖƤɊŔŚŢÛṼŴẊÝŽ";

export const PSEUDO_STORAGE_KEY = "booksAndRuns:pseudoLocale";

export function toPseudo(s: string): string {
  let out = "";
  // Keep {placeholder} tokens intact so interpolation still works.
  for (const part of s.split(/(\{\w+\})/)) {
    if (/^\{\w+\}$/.test(part)) {
      out += part;
      continue;
    }
    for (const ch of part) {
      const i = FROM.indexOf(ch);
      out += i === -1 ? ch : TO[i];
    }
  }
  return `[${out}]`;
}

export function buildPseudoDictionary(en: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(en)) out[k] = v === "" ? v : toPseudo(v);
  return out;
}
