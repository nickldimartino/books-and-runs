import { CosmeticRarity } from "./cosmeticRarity";
import { CosmeticUnlockRule } from "./cosmeticUnlocks";
import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";
import { THEMES, ThemeId } from "./themeStore";

// A card back is any of the same 38 theme identities — see globals.css's
// [data-cardback="X"] blocks, one per theme, each freezing that theme's own
// motif and color independent of whichever table theme happens to be
// active. "match" (the default) isn't a 39th identity — it means "mirror
// whatever the table theme currently is," which is exactly today's
// long-standing behavior preserved as the default, so nobody's card back
// visibly changes until they open this picker and choose something else.
export type SignatureCardBackId = "foilweave" | "static";

export type CardBackId = ThemeId | "match" | SignatureCardBackId;

export interface SignatureCardBackOption {
  id: SignatureCardBackId;
  name: string;
  description: string;
  /** Absent for a free pick. Boutique items carry `{ kind: "boutique" }`.
   * See cardCosmeticUnlocks.ts's own doc for why this is checked entirely
   * client-side, unlike badge/frame/title/banner. */
  unlock?: CosmeticUnlockRule;
  rarity?: CosmeticRarity;
  source?: "boutique";
}

/** Standalone card backs, independent of any theme — every id here has its
 * own [data-cardback="X"] block in globals.css (following the exact
 * convention the 38 theme-derived blocks already use), just not derived
 * from a theme's own --card-back-shape/tile the way those are. */
export const SIGNATURE_CARD_BACKS: readonly SignatureCardBackOption[] = [
  {
    id: "foilweave",
    name: "Foil Weave",
    description: "A fine diagonal metallic weave — pairs with the Foil card face.",
    unlock: { kind: "level", level: 30 },
  },
  {
    id: "static",
    name: "Static",
    description: "A scattered dot pattern, like an old TV between channels.",
    source: "boutique",
    unlock: { kind: "boutique" },
  },
];

export function findSignatureCardBack(id: string | null): SignatureCardBackOption | null {
  if (!id) return null;
  return SIGNATURE_CARD_BACKS.find((s) => s.id === id) ?? null;
}

export function isSignatureCardBack(id: CardBackId): id is SignatureCardBackId {
  return SIGNATURE_CARD_BACKS.some((s) => s.id === id);
}

export const DEFAULT_CARD_BACK: CardBackId = "match";

const KEY = "booksAndRuns:cardBack";

export function loadLocalCardBack(): CardBackId {
  const raw = readLocalStorage(KEY);
  if (raw === "match") return "match";
  if (isSignatureCardBack(raw as CardBackId)) return raw as SignatureCardBackId;
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
