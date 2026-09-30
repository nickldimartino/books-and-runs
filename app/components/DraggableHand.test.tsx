// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Card } from "@/types";
import { DraggableHand } from "./DraggableHand";

afterEach(cleanup);

const HAND: Card[] = [
  { id: "c1", suit: "clubs", rank: "6", isWild: false },
  { id: "c2", suit: "clubs", rank: "K", isWild: false },
  { id: "c3", suit: "clubs", rank: "J", isWild: false },
  { id: "c4", suit: "spades", rank: "Q", isWild: false },
];

function renderHand(onCardClick = vi.fn(), onReorder = vi.fn()) {
  render(
    <DraggableHand cards={HAND} selectedCardIds={[]} lastDrawnCardId={null} onCardClick={onCardClick} onReorder={onReorder} />
  );
  return { onCardClick, onReorder };
}

describe("DraggableHand", () => {
  it("treats a quick tap (press and release well under the long-press threshold) as a card click", () => {
    const { onCardClick, onReorder } = renderHand();
    const card = screen.getByRole("button", { name: "6 of clubs" });
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(document, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onCardClick).toHaveBeenCalledWith(HAND[0]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  // Regression test: a press held past LONG_PRESS_MS (180ms) but released
  // without ever actually moving the card used to be misread as a drag —
  // finishDrag checked only `dragging` (set the instant the long-press
  // timer fires, regardless of movement), so it called onReorder with the
  // unchanged order instead of onCardClick. A real tap held a beat longer
  // than 180ms — ordinary touchscreen variance, nothing exotic — silently
  // did nothing at all, with no error and no visual sign anything was
  // wrong. See DraggableHand.tsx's `everMoved` field.
  it("still treats a tap held past the long-press threshold, with zero movement, as a click — not a silently-dropped no-op reorder", () => {
    vi.useFakeTimers();
    try {
      const { onCardClick, onReorder } = renderHand();
      const card = screen.getByRole("button", { name: "6 of clubs" });
      fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 2 });
      vi.advanceTimersByTime(250); // past LONG_PRESS_MS, no pointermove in between
      fireEvent.pointerUp(document, { clientX: 10, clientY: 10, pointerId: 2 });
      expect(onCardClick).toHaveBeenCalledWith(HAND[0]);
      expect(onReorder).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
