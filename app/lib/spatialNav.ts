// Directional ("spatial") focus navigation for the gamepad layer: given the
// rect of the currently-focused control and the rects of every other
// focusable control, pick the one a D-pad press in `dir` should land on.
// Pure geometry — no DOM — so it's unit-testable.

export interface NavRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type NavDir = "up" | "down" | "left" | "right";

/** How much a sideways offset costs relative to travel in the pressed
 * direction: >1 keeps "down" landing on the thing roughly below you rather
 * than a nearer one way off to the side. */
const PERP_WEIGHT = 2.5;

export function pickNext<T>(from: NavRect, items: { item: T; rect: NavRect }[], dir: NavDir): T | null {
  const fromCx = (from.left + from.right) / 2;
  const fromCy = (from.top + from.bottom) / 2;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const { item, rect } of items) {
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    let primary: number;
    let perp: number;
    let overlapsPerp: boolean;
    switch (dir) {
      case "right":
        primary = rect.left >= from.right - 1 ? rect.left - from.right : cx - fromCx;
        perp = Math.abs(cy - fromCy);
        overlapsPerp = rect.top < from.bottom && rect.bottom > from.top;
        if (cx <= fromCx) continue;
        break;
      case "left":
        primary = rect.right <= from.left + 1 ? from.left - rect.right : fromCx - cx;
        perp = Math.abs(cy - fromCy);
        overlapsPerp = rect.top < from.bottom && rect.bottom > from.top;
        if (cx >= fromCx) continue;
        break;
      case "down":
        primary = rect.top >= from.bottom - 1 ? rect.top - from.bottom : cy - fromCy;
        perp = Math.abs(cx - fromCx);
        overlapsPerp = rect.left < from.right && rect.right > from.left;
        if (cy <= fromCy) continue;
        break;
      case "up":
        primary = rect.bottom <= from.top + 1 ? from.top - rect.bottom : fromCy - cy;
        perp = Math.abs(cx - fromCx);
        overlapsPerp = rect.left < from.right && rect.right > from.left;
        if (cy >= fromCy) continue;
        break;
    }
    // Controls in the same row/column (rects overlap on the other axis) get
    // their sideways offset discounted so a row of cards steps card by card.
    const score = Math.max(0, primary) + perp * (overlapsPerp ? 0.5 : PERP_WEIGHT);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}
