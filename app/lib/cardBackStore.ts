import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";
import { THEMES, ThemeId } from "./themeStore";

// A card back is any of the same 38 theme identities — see globals.css's
// [data-cardback="X"] blocks, one per theme, each freezing that theme's own
// motif and color independent of whichever table theme happens to be
// active. "match" (the default) isn't a 39th identity — it means "mirror
// whatever the table theme currently is," which is exactly today's
// long-standing behavior preserved as the default, so nobody's card back
// visibly changes until they open this picker and choose something else.
export type CardBackId = ThemeId | "match";

export const DEFAULT_CARD_BACK: CardBackId = "match";

const KEY = "booksAndRuns:cardBack";

export function loadLocalCardBack(): CardBackId {
  const raw = readLocalStorage(KEY);
  if (raw === "match") return "match";
  return THEMES.some((t) => t.id === raw) ? (raw as ThemeId) : DEFAULT_CARD_BACK;
}

export function saveLocalCardBack(id: CardBackId): void {
  writeLocalStorage(KEY, id);
}

/**
 * Applies the effective card back to the DOM as a `data-cardback` attribute
 * — `id` itself when it's a real theme id, or `activeTheme` when it's
 * "match". Takes the active theme as an explicit argument rather than
 * reading `data-theme` back off `<html>`: Settings' own theme picker needs
 * the two attributes to update in the same tick whenever the table theme
 * changes while "match" is selected, and handing the value in directly is
 * more robust than reading back a DOM attribute that may or may not have
 * finished being written yet.
 */
export function applyCardBack(id: CardBackId, activeTheme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-cardback", id === "match" ? activeTheme : id);
}

/** A human label for a card back id — used on the profile page to show
 * off what someone's equipped (see migration 0028's showcase_card_back). */
export function cardBackLabel(id: string | null): string {
  if (!id || id === "match") return "Match table theme";
  return THEMES.find((t) => t.id === id)?.name ?? id;
}
