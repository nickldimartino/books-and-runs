import { AchievementCategory } from "@/achievements";

/**
 * Raw path/circle/rect data for the 9 achievement-category icons, factored
 * out of AchievementIcons.tsx so it has exactly one home: the React
 * component renders these as JSX, and shareCard.ts replays the same data
 * as Path2D draws on a <canvas> (which has no SVG renderer of its own).
 * Keeping this as data rather than JSX is what lets both consumers stay in
 * sync automatically instead of two hand-copied icon sets drifting apart.
 */
export type IconElement =
  | { kind: "path"; d: string }
  | { kind: "circle"; cx: number; cy: number; r: number; filled?: boolean }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx: number };

export const ACHIEVEMENT_ICON_ELEMENTS: Record<AchievementCategory, IconElement[]> = {
  // Account-level stats (Tablehand, Champion, Sharpshooter, Consistent) — a trophy.
  accountStats: [
    { kind: "path", d: "M7 4h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z" },
    { kind: "path", d: "M7 5H4a3 3 0 0 0 3 4" },
    { kind: "path", d: "M17 5h3a3 3 0 0 1-3 4" },
    { kind: "path", d: "M12 12v3.5" },
    { kind: "path", d: "M9 19.5h6" },
    { kind: "path", d: "M10 15.5h4l1 4H9l1-4Z" },
  ],
  // Wins against each AI difficulty (Rival: Beginner..Expert AI) — crossed swords.
  aiRivals: [
    { kind: "path", d: "M4.5 19.5 18 6" },
    { kind: "path", d: "M15 6h3v3" },
    { kind: "circle", cx: 4.5, cy: 19.5, r: 1, filled: true },
    { kind: "path", d: "M19.5 19.5 6 6" },
    { kind: "path", d: "M9 6H6v3" },
    { kind: "circle", cx: 19.5, cy: 19.5, r: 1, filled: true },
  ],
  // Melding (Bookworm, Runner, Wild Card, Purist, ...) — two overlapping cards.
  melding: [
    { kind: "rect", x: 3, y: 6, w: 10, h: 14, rx: 1.5 },
    { kind: "rect", x: 11, y: 4, w: 10, h: 14, rx: 1.5 },
  ],
  // Laying off (Offloader, Generous, Team Player, Decisive) — a card dropping onto a pile.
  layingOff: [
    { kind: "rect", x: 7, y: 2, w: 10, h: 12, rx: 1.5 },
    { kind: "path", d: "M12 16.5v4" },
    { kind: "path", d: "M9 17.5l3 3 3-3" },
  ],
  // Draw/discard economy (Gambler, Scavenger, Lucky Draw, Declutterer) — a card with a refresh cycle.
  drawDiscard: [
    { kind: "rect", x: 3, y: 6, w: 9, h: 13, rx: 1.3 },
    { kind: "path", d: "M15 8a5 5 0 1 1-1.3 8.4" },
    { kind: "path", d: "M17.7 12.2l-2.4-.4.4-2.4" },
  ],
  // Going out (Round Winner, Clean Sweep, Just in Time, No Rummy, Flawless) — a finish flag.
  goingOut: [
    { kind: "path", d: "M6 21V4" },
    { kind: "path", d: "M6 4h13l-3 4 3 4H6" },
  ],
  // Per-contract completion (2 Books Regular ... The Hardest Round) — a checked clipboard.
  contracts: [
    { kind: "rect", x: 5, y: 4, w: 14, h: 17, rx: 1.5 },
    { kind: "path", d: "M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" },
    { kind: "path", d: "M9 13l2 2 4-4" },
  ],
  // Table composition (Around the Table, Solo Act, Full House, Marathoner) — seats around a table.
  tableComposition: [
    { kind: "circle", cx: 12, cy: 12, r: 3 },
    { kind: "circle", cx: 4, cy: 6, r: 1.6, filled: true },
    { kind: "circle", cx: 20, cy: 6, r: 1.6, filled: true },
    { kind: "circle", cx: 4, cy: 18, r: 1.6, filled: true },
    { kind: "circle", cx: 20, cy: 18, r: 1.6, filled: true },
  ],
  // Multiplayer vs. real people (Sociable, Friendly Rivalry, Hot Hand, ...) — two figures.
  multiplayer: [
    { kind: "circle", cx: 8.5, cy: 8, r: 2.75 },
    { kind: "path", d: "M3.5 19.5a5 5 0 0 1 10 0" },
    { kind: "circle", cx: 16, cy: 9.5, r: 2.25 },
    { kind: "path", d: "M15 14.6a4.3 4.3 0 0 1 5.5 4.9" },
  ],
};

/** The level-milestone medal's ribbon lines (see PremiumBadgeIcon.tsx's
 * MedalIcon) — the disc and its inner ring are drawn separately by each
 * consumer since the disc's fill color varies (bronze/silver/gold/diamond). */
export const MEDAL_RIBBON_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M9 3.5 6.5 10" },
  { kind: "path", d: "M15 3.5 17.5 10" },
];
export const MEDAL_DISC = { cx: 12, cy: 14, discR: 6, ringR: 2.25 };

/** The Creator badge's star glyph (see player/page.tsx's CreatorBadgeIcon)
 * — a single filled path, no stroke. */
export const CREATOR_STAR_PATH =
  "M12 2.5l2.7 6.28 6.8.57-5.18 4.5 1.57 6.65L12 16.9l-5.89 3.6 1.57-6.65-5.18-4.5 6.8-.57Z";
