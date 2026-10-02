// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HandPreviewBar } from "./HandPreviewBar";
import { makeHand } from "../../src/testHelpers";

// jsdom does no layout, so clientWidth is always 0 — which is exactly the
// value that used to leak into the fan math. Give the bar's inner container a
// real width the way a phone would.
const BAR_WIDTH = 343;
let original: PropertyDescriptor | undefined;

beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => BAR_WIDTH });
});

afterEach(() => {
  cleanup();
  if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
});

function marginsOf(ranks: Parameters<typeof makeHand>[0]) {
  render(<HandPreviewBar cards={makeHand(ranks)} onTap={() => {}} />);
  const bar = screen.getByRole("button");
  const cards = [...bar.querySelector("div")!.children] as HTMLElement[];
  return cards.slice(1).map((c) => parseFloat(c.style.marginLeft));
}

describe("HandPreviewBar spacing", () => {
  // Regression: portaling the bar made it render a beat after mount, and the
  // width measurement ran once before that — leaving width at 0 and squeezing
  // every hand, even three cards, into a tight overlap.
  it("leaves a small hand un-overlapped at its natural spacing", () => {
    // natural step = card width 34 + gap 4, so each card's margin is the +4 gap
    expect(marginsOf(["9", "4", "10"])).toEqual([4, 4]);
  });

  it("only overlaps once the hand genuinely can't fit", () => {
    const margins = marginsOf(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]);
    expect(margins.every((m) => m < 0)).toBe(true);
    // fitted to the real width: (343 - 34) / 12 - 34, not the MIN_STEP floor of -20
    expect(margins[0]).toBeCloseTo(-8.25, 2);
  });
});
