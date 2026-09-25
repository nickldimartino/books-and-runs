// Shared "sort my hand" comparators — used by GameContext.tsx (solo /
// pass-and-play / tutorial / Daily Deal, where sorting actually mutates the
// persisted hand order) and useMpGame.ts (multiplayer, where it's a
// purely-local display order — the server's own card order is untouched;
// see useMpGame's own handOrder doc). Kept in one place so both game modes'
// hand drawers sort identically instead of two copies quietly drifting.

import { Card } from "@/types";

export type SortMode = "suit" | "rank";

// Ace sorts high (after King), never low — wilds (2s and jokers) are always
// bucketed to the end separately below, so their position here is moot; this
// only governs where a natural Ace lands, and low would put it awkwardly
// next to the wild bucket (since natural "2"s don't exist to sit between).
const RANK_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "JOKER"];
// Alternates red/black so adjacent suits never share a color — easier to
// scan than grouping both reds together, then both blacks.
const SUIT_ORDER = ["hearts", "spades", "diamonds", "clubs", "joker"];

/** Groups same-suit cards together, in sequence — good for spotting runs. */
function compareBySuit(a: Card, b: Card): number {
  if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
  const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
}

/** Groups same-rank cards together — good for spotting books. */
export function compareByRank(a: Card, b: Card): number {
  if (a.isWild !== b.isWild) return a.isWild ? 1 : -1;
  const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  if (rankDiff !== 0) return rankDiff;
  return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
}

export function compareByMode(mode: SortMode): (a: Card, b: Card) => number {
  return mode === "rank" ? compareByRank : compareBySuit;
}

/**
 * Applies a player-chosen order to a subset of `cards` (typically all of
 * it, but excludes anything staged into a pending meld group) — cards not
 * named in `order` keep their existing slot in the array, only the named
 * cards' relative order changes. Same semantics as GameContext.tsx's own
 * reorderHand, extracted here so useMpGame's local-only reorder (see its
 * own doc) matches it exactly instead of approximating it.
 */
export function applyHandOrder(cards: Card[], order: string[] | null): Card[] {
  if (!order) return cards;
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const reordered = cards
    .filter((c) => orderIndex.has(c.id))
    .sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);
  let i = 0;
  return cards.map((c) => (orderIndex.has(c.id) ? reordered[i++] : c));
}

/**
 * Folds a reorder of only the *visible* cards (the drawer hides anything
 * staged into a meld/discard) back into a full-hand order. Every slot a
 * visible card occupied in `fullIds` is refilled, in sequence, from
 * `visibleOrder`; hidden (staged) cards keep their exact slots — so when one
 * is unstaged it returns to where it was instead of jumping to wherever the
 * server happens to list it.
 */
export function mergeVisibleOrder(fullIds: string[], visibleOrder: string[]): string[] {
  const visible = new Set(visibleOrder);
  let i = 0;
  return fullIds.map((id) => (visible.has(id) ? visibleOrder[i++] : id));
}
