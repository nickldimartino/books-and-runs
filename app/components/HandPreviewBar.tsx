"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Card } from "@/types";
import { RED_SUITS, SUIT_SYMBOL } from "./PlayingCard";

interface HandPreviewBarProps {
  cards: Card[];
  // True once the real "Your hand" section is at least partly in view (or
  // there's nothing to preview) — see game/page.tsx's IntersectionObserver.
  // Only meaningful in the default (scroll-to-hand) layout; the expandable-
  // hand-drawer layout always passes false, since this bar is the permanent
  // entry point there rather than something that hides once you've scrolled
  // to a separate full-size section.
  hidden: boolean;
  onTap: () => void;
  // Rings the matching mini-card(s) in the fan — lets a player who selected
  // a card inside the (now-closed) hand drawer still see what's selected
  // while they go tap a meld on the table to lay it off. Omitted entirely
  // in the default scroll layout, where selection is only ever made in the
  // real, visible hand right below this bar, so nothing here needs echoing.
  selectedCardIds?: string[];
  // Off by default: sm:hidden, since on the default scroll layout a laptop/
  // tablet already has enough room that this bar would be redundant chrome.
  // The expandable-hand-drawer layout sets this true — there, the bar isn't
  // a "just on phones" fallback, it's the permanent way to reach your hand
  // at every screen size.
  showOnAllScreens?: boolean;
}

const CARD_W = 34;
const CARD_H = 50;
const GAP = 4;
// The narrowest a card can be compressed to and still show a legible corner
// rank + suit — fitting a big hand with zero scrolling only matters up to
// this floor; a hand large enough to need less than this is vanishingly
// unlikely in a 13-card-max game, and slightly overflowing the bar (clipped
// by its own overflow-hidden below) beats introducing a scrollbar here,
// which is the exact thing this bar exists to avoid.
const MIN_STEP = 14;

/**
 * A compact, read-only preview of the active player's whole hand, pinned to
 * the bottom of the viewport on phones (sm:hidden — laptops/tablets already
 * have room to see the piles, table, and hand without much scrolling, so
 * this would just be redundant chrome there). Cards only fan out — each one
 * overlapping the last, corner rank/suit only, the way a hand of real cards
 * held in a fan still reads at a glance — once the hand's too big to fit at
 * its natural spacing (see `fanned` below); shrinking every hand to fit,
 * even a small one with room to spare, would make a full 13-card hand
 * illegibly tiny for no benefit to a 3-card one. A small enough hand just
 * sits at its natural spacing instead, each card centered like every other
 * card in the app, since nothing's actually overlapping to hide behind a
 * corner. It exists purely so
 * a player can see their whole hand without hunting for it while scrolling
 * a long Table melds section; tapping it jumps to the real, full-size,
 * interactive hand section below (see onTap) rather than trying to make
 * individual mini-cards themselves tappable — deliberately not a second
 * interactive hand to keep in sync with the real one, just a shortcut to it.
 */
export function HandPreviewBar({ cards, hidden, onTap, selectedCardIds, showOnAllScreens }: HandPreviewBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    function measure() {
      if (containerRef.current) setWidth(containerRef.current.clientWidth);
    }
    measure();
    // A resize here almost always means a phone rotating, not a live drag
    // the way DraggableHand's own measurements need to track — a plain
    // resize listener is plenty, no need for a ResizeObserver.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (cards.length === 0) return null;

  // `width` is containerRef's own clientWidth, which already excludes the
  // button's px-4 padding (that padding belongs to an ancestor, not this
  // element) — no further subtraction needed; verified directly against a
  // real measured layout rather than assumed, since an earlier version of
  // this line subtracted an extra 32px here that wasn't actually there,
  // needlessly over-compressing the fan by that much.
  const available = width;
  const naturalStep = CARD_W + GAP;
  const step =
    cards.length <= 1 ? naturalStep : Math.max(MIN_STEP, Math.min(naturalStep, (available - CARD_W) / (cards.length - 1)));
  // step only ever gets compressed *down from* naturalStep when the hand
  // doesn't fit at its natural spacing — so step === naturalStep is exactly
  // "nothing needed shrinking," i.e. no card is actually overlapping its
  // neighbor. Corner-aligned rank/suit only matters once that's no longer
  // true: it's what keeps a card's identifying text out from under whatever
  // overlaps it. A hand small enough to sit at its natural spacing has
  // nothing overlapping anything, so it reads the same centered way every
  // other card in the app does instead.
  const fanned = step < naturalStep;

  return (
    <button
      onClick={onTap}
      aria-label="Jump to your hand"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.25)] transition-transform duration-200 ${
        showOnAllScreens ? "" : "sm:hidden"
      } ${hidden ? "translate-y-full" : "translate-y-0"}`}
    >
      {/* max-w-2xl mx-auto matches game/page.tsx's <main> exactly — this bar
          itself spans the full viewport edge-to-edge (fixed inset-x-0,
          above) like a toolbar, but without this the fan inside it was
          anchored to the *viewport's* left edge, not the page's own
          centered content column. Barely visible on a phone (the column
          already fills the screen) but glaringly left-anchored on a wide
          laptop window, where the fan sat noticeably left of everything
          else on screen instead of lining up under it. */}
      <div
        ref={containerRef}
        // justify-center matters on top of mx-auto for a *small* hand — the
        // fan is only ever compressed enough to fill the available width
        // (see `step` above), never stretched past its natural size to fill
        // it, so a hand with just a couple of cards left is narrower than
        // this column and would otherwise still sit flush against its left
        // edge instead of genuinely centered as a group.
        className="mx-auto flex max-w-2xl items-center justify-center overflow-hidden"
        style={{ height: CARD_H }}
      >
        {cards.map((card, i) => (
          <MiniCard
            key={card.id}
            card={card}
            marginLeft={i === 0 ? 0 : step - CARD_W}
            selected={!!selectedCardIds?.includes(card.id)}
            fanned={fanned}
          />
        ))}
      </div>
    </button>
  );
}

function MiniCard({
  card,
  marginLeft,
  selected,
  fanned,
}: {
  card: Card;
  marginLeft: number;
  selected: boolean;
  fanned: boolean;
}) {
  const isRed = RED_SUITS.has(card.suit);
  const colorClass = card.isWild ? "wild" : isRed ? "red" : "";
  const label = card.rank === "JOKER" ? "JKR" : card.rank;
  const style: CSSProperties = { width: CARD_W, height: CARD_H, marginLeft };

  return (
    <div
      style={style}
      // Reuses .card-face (and its red/wild modifiers) from globals.css —
      // same theme-aware background/text colors as every real card. Layout
      // depends on whether anything's actually overlapping (see `fanned`
      // above): corner-aligned rank/suit only while fanned, so an
      // overlapped card's identifying text stays visible in front of
      // whatever's stacked on top of it; otherwise centered, the same way
      // every other card in the app reads. The selected ring uses a
      // relative z-index bump too — otherwise a later (overlapping) card's
      // own box would paint over this one's ring on the shared edge between
      // them, since normal DOM/paint order alone doesn't account for it.
      className={`card-face ${colorClass} shrink-0 rounded-md text-[11px] font-bold leading-none ${
        fanned ? "p-1 text-left" : "flex flex-col items-center justify-center gap-0.5"
      } ${selected ? "relative z-10 ring-2 ring-[var(--accent)]" : ""}`}
    >
      <div>{label}</div>
      <div className={fanned ? "mt-0.5" : undefined}>{SUIT_SYMBOL[card.suit]}</div>
    </div>
  );
}
