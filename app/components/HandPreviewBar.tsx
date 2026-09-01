"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Card } from "@/types";
import { RED_SUITS, SUIT_SYMBOL } from "./PlayingCard";

interface HandPreviewBarProps {
  cards: Card[];
  onTap: () => void;
}

// Below this width, cards render at their normal (phone) size. At or above
// it — roughly iPad-portrait and up — they render larger (see WIDE_* below)
// and the fan is given a much wider column to spread out in, since on a
// laptop/iPad the game board itself (<main>, capped at max-w-2xl) already
// leaves most of the viewport's width empty on either side; this bar is
// the one thing on the page allowed to actually use it.
const WIDE_BREAKPOINT = "(min-width: 768px)";

const CARD_W = 34;
const CARD_H = 50;
const GAP = 4;
const WIDE_CARD_W = 50;
const WIDE_CARD_H = 74;
const WIDE_GAP = 6;
// The narrowest a card can be compressed to and still show a legible corner
// rank + suit — fitting a big hand with zero scrolling only matters up to
// this floor; a hand large enough to need less than this is vanishingly
// unlikely in a 13-card-max game, and slightly overflowing the bar (clipped
// by its own overflow-hidden below) beats introducing a scrollbar here,
// which is the exact thing this bar exists to avoid.
const MIN_STEP = 14;
const WIDE_MIN_STEP = 22;
// On a laptop/iPad, <main> itself only ever uses max-w-2xl of the viewport —
// this bar is the one thing on the page allowed to spread into the rest of
// it. Rather than just centering the fan at its natural (un-stretched)
// spacing — which left a big hand looking like a small huddle in the middle
// of a mostly empty bar — isWide actively stretches the gaps between cards
// to fill most of the available width, capped by WIDE_MAX_STEP so a small
// hand (down to just 1-2 cards) doesn't end up scattered edge to edge.
const WIDE_FILL_FRACTION = 0.92;
const WIDE_MAX_STEP = 100;

/**
 * A compact, read-only preview of the active player's whole hand, pinned to
 * the bottom of the viewport — the permanent entry point to the hand drawer
 * at every screen size (see game/page.tsx). Cards only fan out — each one
 * overlapping the last, corner rank/suit only, the way a hand of real cards
 * held in a fan still reads at a glance — once the hand's too big to fit at
 * its natural spacing (see `fanned` below); shrinking every hand to fit,
 * even a small one with room to spare, would make a full 13-card hand
 * illegibly tiny for no benefit to a 3-card one. A small enough hand just
 * sits at its natural spacing instead, each card centered like every other
 * card in the app, since nothing's actually overlapping to hide behind a
 * corner. Tapping it opens the hand drawer (see onTap) rather than trying
 * to make individual mini-cards themselves tappable — deliberately not a
 * second interactive hand to keep in sync with the real one, just a
 * shortcut to it.
 */
export function HandPreviewBar({ cards, onTap }: HandPreviewBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(WIDE_BREAKPOINT);
    setIsWide(mql.matches);
    function onChange(e: MediaQueryListEvent) {
      setIsWide(e.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    function measure() {
      if (containerRef.current) setWidth(containerRef.current.clientWidth);
    }
    measure();
    // A resize here almost always means a phone rotating or a laptop window
    // resizing, not a live drag the way DraggableHand's own measurements
    // need to track — a plain resize listener is plenty, no need for a
    // ResizeObserver.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // isWide is a real dependency, not just a trigger to re-run the same
    // measurement: it switches the container between max-w-2xl and
    // max-w-6xl (see the render below), so its own clientWidth genuinely
    // changes when isWide flips — most commonly right after mount, when the
    // matchMedia effect's first read lands a beat after this effect's own
    // initial (narrow-default) measurement. Without this, that initial
    // measurement would stick around stale (measured against the wrong
    // max-width class) for the rest of the component's life, since nothing
    // else would ever prompt a re-measure.
  }, [isWide]);

  if (cards.length === 0) return null;

  const cardW = isWide ? WIDE_CARD_W : CARD_W;
  const cardH = isWide ? WIDE_CARD_H : CARD_H;
  const gap = isWide ? WIDE_GAP : GAP;
  const minStep = isWide ? WIDE_MIN_STEP : MIN_STEP;

  // `width` is containerRef's own clientWidth, which already excludes the
  // button's px-4 padding (that padding belongs to an ancestor, not this
  // element) — no further subtraction needed; verified directly against a
  // real measured layout rather than assumed, since an earlier version of
  // this line subtracted an extra 32px here that wasn't actually there,
  // needlessly over-compressing the fan by that much.
  const available = width;
  const naturalStep = cardW + gap;
  let step: number;
  if (isWide) {
    // Stretches outward instead of just centering at naturalStep — see
    // WIDE_FILL_FRACTION/WIDE_MAX_STEP above.
    const target =
      cards.length <= 1 ? naturalStep : (available * WIDE_FILL_FRACTION - cardW) / (cards.length - 1);
    step = Math.max(minStep, Math.min(WIDE_MAX_STEP, target));
  } else {
    step =
      cards.length <= 1 ? naturalStep : Math.max(minStep, Math.min(naturalStep, (available - cardW) / (cards.length - 1)));
  }
  // Fanned (corner-aligned rank/suit, so an overlapped card's identifying
  // text stays visible in front of whatever's stacked on top of it) exactly
  // when neighboring cards actually overlap — step < cardW. Above that
  // threshold nothing overlaps, whether because the hand fit at its natural
  // spacing (the non-wide path) or because isWide stretched the gaps out
  // past it, so each card reads the same centered way every other card in
  // the app does.
  const fanned = step < cardW;

  return (
    <button
      onClick={onTap}
      aria-label="Jump to your hand"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.25)]"
    >
      {/* max-w-2xl matches game/page.tsx's <main> exactly on a phone, so the
          fan lines up under the page's own centered content column instead
          of the viewport's raw edges (this bar itself spans full-bleed —
          fixed inset-x-0, above — like a toolbar). Once there's real room to
          spare (isWide), the column widens well past that to let the fan
          actually use the space a laptop/iPad leaves empty on either side
          of <main> — capped short of the true viewport edge so it still
          reads as a distinct bar, not a blocking full-width wall. */}
      <div
        ref={containerRef}
        // justify-center matters on top of mx-auto for a *small* hand — the
        // fan is only ever compressed enough to fill the available width
        // (see `step` above), never stretched past its natural size to fill
        // it, so a hand with just a couple of cards left is narrower than
        // this column and would otherwise still sit flush against its left
        // edge instead of genuinely centered as a group.
        className={`mx-auto flex items-center justify-center overflow-hidden ${
          isWide ? "max-w-6xl" : "max-w-2xl"
        }`}
        style={{ height: cardH }}
      >
        {cards.map((card, i) => (
          <MiniCard
            key={card.id}
            card={card}
            width={cardW}
            height={cardH}
            marginLeft={i === 0 ? 0 : step - cardW}
            fanned={fanned}
          />
        ))}
      </div>
    </button>
  );
}

function MiniCard({
  card,
  width,
  height,
  marginLeft,
  fanned,
}: {
  card: Card;
  width: number;
  height: number;
  marginLeft: number;
  fanned: boolean;
}) {
  const isRed = RED_SUITS.has(card.suit);
  const colorClass = card.isWild ? "wild" : isRed ? "red" : "";
  const label = card.rank === "JOKER" ? "JKR" : card.rank;
  const style: CSSProperties = { width, height, marginLeft };

  return (
    <div
      style={style}
      // Reuses .card-face (and its red/wild modifiers) from globals.css —
      // same theme-aware background/text colors as every real card. Layout
      // depends on whether anything's actually overlapping (see `fanned`
      // above): corner-aligned rank/suit only while fanned, so an
      // overlapped card's identifying text stays visible in front of
      // whatever's stacked on top of it; otherwise centered, the same way
      // every other card in the app reads. Deliberately no visual
      // indication of hand selection here — a selected card used to get a
      // ring, but with the drawer closed (this bar's only ever shown then)
      // that read as one card looking randomly different from the rest of
      // an otherwise plain, read-only preview, not as a meaningful signal.
      className={`card-face ${colorClass} shrink-0 rounded-md font-bold leading-none ${
        fanned ? "p-1 text-left" : "flex flex-col items-center justify-center gap-0.5"
      } ${width >= WIDE_CARD_W ? "text-sm" : "text-[11px]"}`}
    >
      <div>{label}</div>
      <div className={fanned ? "mt-0.5" : undefined}>{SUIT_SYMBOL[card.suit]}</div>
    </div>
  );
}
