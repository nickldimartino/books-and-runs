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

export type CardFaceId = "classic" | "realistic" | "bold" | "minimal" | "retro" | "pixel";

export interface CardFaceOption {
  id: CardFaceId;
  name: string;
  description: string;
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
];

export const DEFAULT_CARD_FACE: CardFaceId = "classic";

const KEY = "booksAndRuns:cardFace";
const EVENT = "br:cardface-changed";

export function loadLocalCardFace(): CardFaceId {
  if (typeof window === "undefined") return DEFAULT_CARD_FACE;
  try {
    const raw = window.localStorage.getItem(KEY);
    return CARD_FACES.some((f) => f.id === raw) ? (raw as CardFaceId) : DEFAULT_CARD_FACE;
  } catch {
    return DEFAULT_CARD_FACE;
  }
}

export function saveLocalCardFace(id: CardFaceId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable/full — the choice just won't persist across visits
  }
  window.dispatchEvent(new Event(EVENT));
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
