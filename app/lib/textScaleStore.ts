// A [data-text-scale] attribute on <html>, applied the same way (and for the
// same reason) as colorblindStore.ts's [data-colorblind]. Scales Tailwind's
// own --text-* theme tokens (see globals.css) rather than the root font-size
// — those tokens feed every text-xs..text-4xl utility class's font-size
// (and its paired line-height, which is already a unitless ratio and so
// scales automatically), so this reaches nearly all of the site's copy
// with zero changes to individual pages. Deliberately doesn't touch
// spacing/padding/layout utilities, only font-size — so it can't make a
// fixed-size control overflow its own container, only make the text inside
// whatever room already exists bigger. Two places opt back out of this
// entirely rather than growing: the actual game board (/game,
// /multiplayer/play — gameplay itself is explicitly out of scope, see
// their own [data-no-text-scale] wrapper) and Home's own square tile
// buttons, which already size their own label as a percentage of the
// tile's rendered width (see app/page.tsx's ProgressTile) rather than
// through these Tailwind classes at all, so they're untouched by
// construction, not by an explicit opt-out.
//
// Kept as its own small store, separate from settingsStore.ts's
// HouseSettings, so it can apply itself immediately on selection — like
// theme and colorblind mode, and unlike the Save-button-gated toggles in
// Settings — instead of waiting for "Save settings". Available signed out
// too, unlike Theme (see settings/theme/page.tsx) — this is an
// accessibility need, not a look to keep in sync across devices for its
// own sake, so there's no reason to gate it behind an account.

import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

export type TextScale = "default" | "large" | "xlarge";

interface TextScaleOption {
  id: TextScale;
  name: string;
  description: string;
}

export const TEXT_SCALES: TextScaleOption[] = [
  { id: "default", name: "Default", description: "Standard text size." },
  { id: "large", name: "Large", description: "About 15% bigger — noticeably easier to read at a glance." },
  { id: "xlarge", name: "Extra large", description: "About 30% bigger — for the smallest print on the page." },
];

export const DEFAULT_TEXT_SCALE: TextScale = "default";

const KEY = "booksAndRuns:textScale";

export function loadLocalTextScale(): TextScale {
  const raw = readLocalStorage(KEY);
  return TEXT_SCALES.some((s) => s.id === raw) ? (raw as TextScale) : DEFAULT_TEXT_SCALE;
}

export function saveLocalTextScale(scale: TextScale): void {
  writeLocalStorage(KEY, scale);
}

export function applyTextScale(scale: TextScale): void {
  if (typeof document === "undefined") return;
  if (scale === "default") {
    document.documentElement.removeAttribute("data-text-scale");
  } else {
    document.documentElement.setAttribute("data-text-scale", scale);
  }
}
