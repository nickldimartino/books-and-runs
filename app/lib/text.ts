// Small, generic string-formatting helpers with no other natural home —
// each was previously hand-copied into whichever file needed it first.

/** "medium" -> "Medium". Used anywhere a Difficulty/RoundMode/etc. id needs
 * its display label capitalized rather than shown lowercase — including,
 * deliberately, inside a <select>'s <option> text: rendering the actual
 * capitalized label there, rather than lowercase text plus a CSS
 * text-transform, avoids a real cross-platform bug where iOS Safari's
 * native picker wheel (the opened <select> list) doesn't apply
 * text-transform to <option> text, showing "easy" while the closed box —
 * rendered by the page itself, which does honor the CSS — shows "Easy". */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
