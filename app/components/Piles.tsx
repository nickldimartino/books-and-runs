"use client";

import { Card } from "@/types";
import { PlayingCard } from "./PlayingCard";

const CARD_BACK: Card = { id: "back", suit: "joker", rank: "JOKER", isWild: true };

// Stable small angle per card id, so a discard doesn't re-jitter the whole
// pile on every render.
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The draw pile with visible thickness — a couple of card backs stepped
 * down-right behind the top one, thinning to a single card as the pile
 * runs low. Same 56×80 footprint as a hand card; the stepped edge
 * overflows a few px into the padding the parent column already leaves.
 */
export function DrawPile({ count }: { count: number }) {
  const depth = count <= 2 ? 0 : count <= 12 ? 1 : 2;
  return (
    <div className="relative h-20 w-14">
      {Array.from({ length: depth }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{ transform: `translate(${(depth - i) * 2.5}px, ${(depth - i) * 2.5}px)` }}
        >
          <PlayingCard card={CARD_BACK} faceDown />
        </div>
      ))}
      <div className="absolute inset-0">
        <PlayingCard card={CARD_BACK} faceDown />
      </div>
    </div>
  );
}

/**
 * The discard pile as a small messy stack — the last few discards fanned a
 * degree or two each under the current top card, which stays flat and
 * fully readable (and carries the lay-off badge). An empty pile is the
 * dashed slot.
 */
export function DiscardPile({ cards, canLayOff }: { cards: Card[]; canLayOff?: boolean }) {
  if (cards.length === 0) {
    return <div className="h-20 w-14 rounded-lg border-2 border-dashed border-[var(--border)]" />;
  }
  const shown = cards.slice(-4);
  const under = shown.slice(0, -1);
  const top = shown[shown.length - 1];
  return (
    <div className="relative h-20 w-14">
      {under.map((c, i) => {
        const h = hashId(c.id);
        // deeper cards (lower i) sit further off-centre, so the pile reads
        // as a few loose cards rather than one rotated card
        const depth = under.length - i;
        return (
          <div
            key={c.id}
            className="absolute inset-0"
            style={{
              transform: `translate(${((h % 5) - 2) * depth * 0.8}px, ${((h % 3) - 1) * depth * 0.8}px) rotate(${
                ((h % 9) - 4) * (depth * 0.5)
              }deg)`,
              opacity: 0.9,
            }}
          >
            <PlayingCard card={c} />
          </div>
        );
      })}
      <div className="absolute inset-0">
        <PlayingCard card={top} canLayOff={canLayOff} />
      </div>
    </div>
  );
}
