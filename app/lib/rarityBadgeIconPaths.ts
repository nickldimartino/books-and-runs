// New silhouettes for the badges above the level-medal ladder (see
// PremiumBadgeIcon.tsx) — previously every one of these rendered through
// the same MedalIcon shape as a basic level-up medal, just recolored,
// which is exactly backwards for the badges meant to be the biggest
// flexes in the game. Same data/JSX/canvas split as
// achievementIconPaths.ts (one IconElement[] source, rendered as JSX by
// PremiumBadgeIcon.tsx and replayed as Path2D draws by shareCard.ts, so
// the two consumers can't visually drift apart), same thin-stroke
// line-art style as every AchievementIcon — except APEX, which gets real
// bespoke multi-path artwork (a genuinely distinct faceted starburst, not
// a recolor of anything else), matching the one place this rarity pass
// approved custom art investment.

import { IconElement } from "./achievementIconPaths";

/** Eclipse (specialist, 🧭) — a compass rose: cardinal ticks around a ring,
 * a diamond needle, a center pivot. */
export const ECLIPSE_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 12, cy: 12, r: 8.5 },
  { kind: "path", d: "M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" },
  { kind: "path", d: "M12 7.5l2 4.5-2 4.5-2-4.5 2-4.5Z" },
  { kind: "circle", cx: 12, cy: 12, r: 1, filled: true },
];

/** Forge (ironwill, ⚔️) — an anvil and hammer, matching its name more
 * directly than a generic weapon. */
export const FORGE_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M4.5 17.5h15" },
  { kind: "path", d: "M6.5 17.5v-2.7h11v2.7" },
  { kind: "path", d: "M5.5 14.8h13l-2-3.3h-9l-2 3.3Z" },
  { kind: "path", d: "M12 11.5V7" },
  { kind: "rect", x: 9.3, y: 3.5, w: 5.4, h: 3.4, rx: 0.8 },
];

/** Nova (virtuoso, 🏵️) — a radiating starburst/rosette. */
export const NOVA_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 12, cy: 12, r: 3.2 },
  {
    kind: "path",
    d: "M12 2v3.2M12 18.8v3M22 12h-3.2M5.2 12H2M19.1 4.9l-2.3 2.3M7.2 14.8l-2.3 2.3M19.1 19.1l-2.3-2.3M7.2 9.2 4.9 6.9",
  },
];

/** Aurora Crown (ascendant, 🌌) — a three-point crown with a single gem. */
export const AURORA_CROWN_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M4.5 18.5h15" },
  { kind: "path", d: "M5.5 18 6.5 10l3.7 3.8L12 7l1.8 6.8L17.5 10l1 8Z" },
  { kind: "circle", cx: 12, cy: 6.3, r: 1, filled: true },
];

/** Daily Fire (unbroken, 🏮) — a flame over a small base, for the Daily
 * Deal streak reward. */
export const DAILY_FIRE_ELEMENTS: IconElement[] = [
  {
    kind: "path",
    d: "M12 2.8c-1.6 3-4.6 4.6-4.6 8.6a4.6 4.6 0 1 0 9.2 0c0-1.9-1-3.1-1.9-4.3.1 1.4-.6 2.3-1.3 2.3-1 0-1-1.6-1.5-2.6-.5-1-.4-2.5.1-4Z",
  },
  { kind: "path", d: "M8.3 19.5h7.4" },
];

/** Victory Lap (undefeated, 🏆) — a laurel wreath around a single star,
 * deliberately not a trophy cup (already the accountStats category icon). */
export const VICTORY_LAP_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M12 20.3c-4-1-6.3-5-5.2-10.2 1 2.1 2.3 3.1 5.2 3.1" },
  { kind: "path", d: "M12 20.3c4-1 6.3-5 5.2-10.2-1 2.1-2.3 3.1-5.2 3.1" },
  { kind: "path", d: "M12 3.5l1 2.4 2.6.2-2 1.7.6 2.5-2.2-1.4-2.2 1.4.6-2.5-2-1.7 2.6-.2 1-2.4Z" },
];

/** Steady Hand (averageScoreUnder, ⚖️) — a balance scale, for a career
 * average kept consistently low. */
export const SCALES_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M12 3v15" },
  { kind: "path", d: "M5 8h14" },
  { kind: "path", d: "M5 8 2.5 13a2.5 2.5 0 0 0 5 0L5 8Z" },
  { kind: "path", d: "M19 8l-2.5 5a2.5 2.5 0 0 0 5 0L19 8Z" },
  { kind: "path", d: "M8.5 20.5h7" },
];

/** Hot Streak (mpWinStreak, 📈) — an ascending trend line, for a real
 * multiplayer win streak rather than a solo/streak-day reward. */
export const STREAK_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M3 17l5-5 4 4 8-9" },
  { kind: "path", d: "M16 6h4v4" },
  { kind: "circle", cx: 8, cy: 12, r: 1, filled: true },
  { kind: "circle", cx: 12, cy: 16, r: 1, filled: true },
];

/** The single apex reward (prismatic, 💫) — genuine bespoke artwork, the
 * one place this pass invests in custom art rather than a CSS-tier
 * silhouette: an 8-point star with a rotated inner star, so it reads as a
 * cut gem/faceted burst no other tier's icon resembles. */
export const APEX_STARBURST_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M12 1.8l2.4 7.1 7.4 2.6-7.4 2.6L12 21.2l-2.4-7.1-7.4-2.6 7.4-2.6L12 1.8Z" },
  { kind: "path", d: "M12 7.3l1.2 3.5 3.6 1.2-3.6 1.2L12 16.7l-1.2-3.5-3.6-1.2 3.6-1.2L12 7.3Z" },
  { kind: "circle", cx: 12, cy: 12, r: 1, filled: true },
];
