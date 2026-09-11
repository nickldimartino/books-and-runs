import { UNDO_GRACE_MS } from "../GameContext";

// r=9 on a 24x24 viewBox — CIRCUMFERENCE here and the "to" value in
// globals.css's @keyframes undo-ring-drain both derive from that same
// radius; keep them in sync by hand if it ever changes (same trade-off
// THEME_BG/THEME_ERROR_COLORS already accept elsewhere in this app).
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A small ring around the Undo button that visibly drains over the grace
 * window (GameContext's UNDO_GRACE_MS) instead of the control just vanishing
 * with no warning. Pure CSS animation (globals.css's undo-ring-drain), not a
 * per-frame JS timer — `key={expiresAt}` forces a remount, and so a fresh
 * animation start, whenever a new grace window is armed (melding again
 * while one was already ticking restarts the sweep from full rather than
 * jumping partway through). Decorative only: GameContext's own setTimeout
 * is still what actually ends the grace window, so a throttled background
 * tab can only make this ring reach empty *before* Undo stops working, never
 * claim more time than it really has.
 */
export function UndoRing({ expiresAt }: { expiresAt: number }) {
  return (
    <svg key={expiresAt} viewBox="0 0 24 24" className="h-5 w-5 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={RADIUS} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        className="undo-ring-sweep"
        style={{ animationDuration: `${UNDO_GRACE_MS}ms` }}
      />
    </svg>
  );
}
