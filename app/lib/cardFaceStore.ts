"use client";

// The visual style of a card's printed face — separate from Theme (the
// table's colors) and Card back (the reverse side): this only changes what's
// drawn on the front. Six options, `classic` the default: it's the same
// big-centered-rank-and-suit design the collapsed hand bar
// (HandPreviewBar.tsx) has always used, now also the default for every
// full-size card — brought back after a "make the icons bigger, I can't see
// them" request made clear the traditional corner-index layout (now the
// `realistic` option) doesn't read well at a glance for everyone.
//
// Read by CardFace.tsx via useCardFace() below, not passed as a prop through
// PlayingCard's ~8 call sites — the same "apply once, read everywhere"
// pattern as ThemeId, just via a localStorage-backed hook instead of a
// `[data-theme]` CSS attribute, since these styles differ in actual SVG
// markup, not just color.

import { useEffect, useState } from "react";
import { CosmeticRarity } from "./cosmeticRarity";
import { CosmeticUnlockRule } from "./cosmeticUnlocks";
import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

export type CardFaceId =
  | "classic"
  | "realistic"
  | "bold"
  | "minimal"
  | "retro"
  | "pixel"
  | "foil"
  | "outline"
  | "shadow"
  | "neon"
  | "deco"
  | "sketch"
  | "mono"
  | "ribbon"
  | "halo"
  | "ledger"
  | "engraved"
  | "chalk"
  | "blueprint"
  | "marquee"
  | "inked"
  | "royal";

export interface CardFaceOption {
  id: CardFaceId;
  name: string;
  description: string;
  /** Absent for every one of the original 6 styles — all explicitly
   * grandfathered free, no regression for anyone. Boutique items carry
   * `{ kind: "boutique" }`. See cardCosmeticUnlocks.ts's own doc for why
   * this is checked entirely client-side, unlike badge/frame/title/
   * banner. */
  unlock?: CosmeticUnlockRule;
  rarity?: CosmeticRarity;
  source?: "boutique";
}

export const CARD_FACES: CardFaceOption[] = [
  {
    id: "classic",
    name: "Classic",
    description: "One big rank and suit, centered — the clearest option at a glance.",
  },
  {
    id: "realistic",
    name: "Realistic",
    description: "A traditional printed card: corner indices and a full pip layout.",
  },
  {
    id: "bold",
    name: "Bold",
    description: "The largest rank of any style, for maximum readability.",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "A quiet, understated face with a thin outlined suit.",
  },
  {
    id: "retro",
    name: "Retro",
    description: "A vintage card-table look with a serif rank and a framed border.",
  },
  {
    id: "pixel",
    name: "Pixel",
    description: "A chunky, blocky retro-game face.",
  },
  {
    id: "foil",
    name: "Foil",
    description: "The Classic layout with a shimmering pass of light, like a foil trading card.",
    unlock: { kind: "level", level: 30 },
  },
  {
    id: "outline",
    name: "Outline",
    description: "The Classic layout drawn in a clean stroke only, nothing filled in.",
    rarity: "common",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "outline" },
  },
  {
    id: "mono",
    name: "Mono",
    description: "A quiet monospace rank over a faint baseline grid.",
    rarity: "common",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "mono" },
  },
  {
    id: "ledger",
    name: "Ledger",
    description: "Horizontal rule lines and a right-aligned rank, like a ledger column.",
    rarity: "uncommon",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "ledger" },
  },
  {
    id: "sketch",
    name: "Sketch",
    description: "A loose hand-drawn feel — a dashed border and a slightly skewed rank.",
    rarity: "uncommon",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "sketch" },
  },
  {
    id: "shadow",
    name: "Shadow",
    description: "A huge embossed rank, with a soft offset copy behind it for depth.",
    rarity: "uncommon",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "shadow" },
  },
  {
    id: "neon",
    name: "Neon",
    description: "A stroke-only face with a soft glow pass behind the crisp line.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "neon" },
  },
  {
    id: "ribbon",
    name: "Ribbon",
    description: "A diagonal ribbon band carries the rank at an angle across the card.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "ribbon" },
  },
  {
    id: "engraved",
    name: "Engraved",
    description: "A fine cross-hatched engraving fills the rank, like old currency.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "engraved" },
  },
  {
    id: "chalk",
    name: "Chalkboard",
    description: "A rough chalk-textured rank on a dark slate background.",
    rarity: "rare",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "chalk" },
  },
  {
    id: "halo",
    name: "Halo",
    description: "The suit sits inside two faint concentric rings, like a target.",
    rarity: "epic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "halo" },
  },
  {
    id: "deco",
    name: "Deco",
    description: "An Art Deco double border with corner ticks around a slim rank.",
    rarity: "epic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "deco" },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    description: "A technical-drawing rank with fine grid lines and crisp corner marks.",
    rarity: "epic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "blueprint" },
  },
  {
    id: "marquee",
    name: "Marquee",
    description: "The rank framed by a ring of bulb-like dots, like a theater marquee.",
    rarity: "mythic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "marquee" },
  },
  {
    id: "inked",
    name: "Inked",
    description: "A bold brush-stroke rank with a slightly uneven, hand-inked edge.",
    rarity: "mythic",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "inked" },
  },
  {
    id: "royal",
    name: "Royal Seal",
    description: "The rank set inside an ornate wax-seal medallion border.",
    rarity: "apex",
    source: "boutique",
    unlock: { kind: "boutique", category: "card_face", itemId: "royal" },
  },
];

export const DEFAULT_CARD_FACE: CardFaceId = "classic";

const KEY = "booksAndRuns:cardFace";
const EVENT = "br:cardface-changed";

export function loadLocalCardFace(): CardFaceId {
  const raw = readLocalStorage(KEY);
  return CARD_FACES.some((f) => f.id === raw) ? (raw as CardFaceId) : DEFAULT_CARD_FACE;
}

export function saveLocalCardFace(id: CardFaceId): void {
  writeLocalStorage(KEY, id);
  // Unconditional (even if the write above silently failed) and guarded
  // separately from writeLocalStorage's own SSR check, same as the
  // original — useCardFace's listener is what keeps an already-open picker
  // in sync without a remount, and only ever exists client-side anyway.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** Live-reads the current card face, updating in place if it changes
 * elsewhere on the same page (mirrors how Theme/Card back stay in sync
 * without a full remount). */
export function useCardFace(): CardFaceId {
  const [id, setId] = useState<CardFaceId>(DEFAULT_CARD_FACE);
  useEffect(() => {
    setId(loadLocalCardFace());
    const onChange = () => setId(loadLocalCardFace());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return id;
}
