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
export type SignatureCardBackId =
  | "foilweave"
  | "static"
  | "houndstooth"
  | "marble"
  | "tartan"
  | "quilted"
  | "starfield"
  | "brushed"
  | "chevron"
  | "basketweave"
  | "damask"
  | "confetti"
  | "filigree"
  | "obsidianweave"
  | "prismveil"
  | "goldleaf";

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
    rarity: "common",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "static" },
  },
  {
    id: "brushed",
    name: "Brushed Steel",
    description: "Fine parallel lines, like brushed metal catching the light.",
    rarity: "common",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "brushed" },
  },
  {
    id: "basketweave",
    name: "Basketweave",
    description: "Thick crossed bands, like a woven basket.",
    rarity: "uncommon",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "basketweave" },
  },
  {
    id: "houndstooth",
    name: "Houndstooth",
    description: "A classic crossed-diagonal tweed pattern.",
    rarity: "uncommon",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "houndstooth" },
  },
  {
    id: "tartan",
    name: "Tartan",
    description: "A crossed-grid plaid, like a classic card-room table cloth.",
    rarity: "uncommon",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "tartan" },
  },
  {
    id: "chevron",
    name: "Chevron",
    description: "An alternating diagonal checker, like a zigzag herringbone.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "chevron" },
  },
  {
    id: "quilted",
    name: "Quilted Diamond",
    description: "A crossed diamond-grid stitch pattern.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "quilted" },
  },
  {
    id: "damask",
    name: "Damask",
    description: "An ornate repeating floral-scroll pattern, like fine upholstery.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "damask" },
  },
  {
    id: "confetti",
    name: "Confetti",
    description: "Scattered flecks of color on a dark ground, like a card just dealt at a party.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "confetti" },
  },
  {
    id: "marble",
    name: "Marbled Vein",
    description: "A soft, irregular stone-vein texture.",
    rarity: "epic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "marble" },
  },
  {
    id: "starfield",
    name: "Starfield",
    description: "Scattered points of light at two different sizes, on near-black.",
    rarity: "epic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "starfield" },
  },
  {
    id: "filigree",
    name: "Filigree",
    description: "A delicate lattice of curling metallic lines.",
    rarity: "epic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "filigree" },
  },
  {
    id: "obsidianweave",
    name: "Obsidian Weave",
    description: "A near-black woven texture with a faint glossy sheen.",
    rarity: "mythic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "obsidianweave" },
  },
  {
    id: "prismveil",
    name: "Prism Veil",
    description: "Soft shifting bands of color, like light through a curtain.",
    rarity: "mythic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "prismveil" },
  },
  {
    id: "goldleaf",
    name: "Gold Leaf",
    description: "Cracked gold-leaf fragments over a deep lacquer black.",
    rarity: "apex",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_back", itemId: "goldleaf" },
  },
];

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
