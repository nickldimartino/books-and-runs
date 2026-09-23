// One shared convention for how a locked cosmetic renders in the Edit
// Profile picker (Badge/Frame/Title/Banner/Boutique) — previously each tab
// reinvented this slightly differently (different opacity values, one tab
// hiding the art entirely instead of dimming it). The rule now: a locked
// item's real art always renders, dimmed, never hidden or swapped out —
// hiding what you'd be working toward is the opposite of what makes a
// locked reward worth chasing.

/** Applied to a locked option's button/swatch — dims the real art without
 * hiding it. Combine with the option's own selected/hover classes when
 * unlocked instead of this. */
export const LOCKED_ITEM_CLASS = "cursor-default opacity-40";

/** A locked item's caption gets a 🔒 prefix rather than losing its label —
 * seeing the name (Aurora Crown, Dealer's Table, ...) alongside the
 * requirement tooltip is part of making the goal legible. */
export function lockedCaption(label: string, unlocked: boolean): string {
  return unlocked ? label : `🔒 ${label}`;
}
