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

// --- Boutique badges (15, avatarPresets.ts's PREMIUM_EMOJI_OPTIONS
// `source: "boutique"` entries, 🎻🗝️🎩🕶️🥃🧨🧿🏹🦉🛸🎰🀄🎆🎴🔮) — these used to
// fall through PremiumBadgeIcon.tsx to the generic MedalIcon uncolored
// (LEVEL_MEDAL_COLOR had no entry for any of them), so a dozen very
// different purchases all rendered as the same plain disc. Each gets its
// own silhouette below, themed to its real-world object, with element
// count/detail rising alongside the item's own rarity tier (common/
// uncommon stay a handful of primitives; epic+ layer in more strokes and
// small accent marks) — the same complexity-tracks-rarity idea the
// original 9 icons above and cosmeticRarity.ts's own doc already establish.

/** Violin (🎻, common) — scroll, neck/string, a waisted body outline, and a
 * pair of f-holes. */
export const VIOLIN_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 12, cy: 3.2, r: 1 },
  { kind: "path", d: "M12 4.2V19" },
  {
    kind: "path",
    d: "M12 8c-2.1 0-3.4 1.5-3.4 3.1 0 1.2.7 2 1.6 2.5-1 .5-1.7 1.3-1.7 2.6 0 1.9 1.6 3.4 3.5 3.4s3.5-1.5 3.5-3.4c0-1.3-.7-2.1-1.7-2.6.9-.5 1.6-1.3 1.6-2.5C15.4 9.5 14.1 8 12 8Z",
  },
  { kind: "path", d: "M9.6 12.6c-.3.5-.2 1.1.3 1.4M14.4 12.6c.3.5.2 1.1-.3 1.4" },
];

/** Ornate key (🗝️, common) — a ringed bow with a center jewel, a shaft, and
 * two teeth. */
export const ORNATE_KEY_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 12, cy: 6, r: 3 },
  { kind: "circle", cx: 12, cy: 6, r: 1, filled: true },
  { kind: "path", d: "M12 9v9.5" },
  { kind: "path", d: "M12 15.8h2.6" },
  { kind: "path", d: "M12 18.3h3.4" },
];

/** Top hat (🎩, uncommon) — a tall crown, a band, and a wide curved brim. */
export const TOP_HAT_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M4 18.5h16" },
  { kind: "path", d: "M5.5 18.5c0-1 .6-1.6 1.6-1.6h9.8c1 0 1.6.6 1.6 1.6" },
  { kind: "rect", x: 8, y: 6, w: 8, h: 11, rx: 0.5 },
  { kind: "rect", x: 8, y: 13.5, w: 8, h: 2, rx: 0 },
];

/** Sunglasses (🕶️, uncommon) — two lenses, a bridge, and angled temple arms. */
export const SUNGLASSES_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 7.5, cy: 12.5, r: 3.2 },
  { kind: "circle", cx: 16.5, cy: 12.5, r: 3.2 },
  { kind: "path", d: "M10.7 11.5c.6-1 1.9-1 2.6 0" },
  { kind: "path", d: "M4.3 11 2 9.5M19.7 11l2.3-1.5" },
];

/** Rocks glass (🥃, uncommon) — a tapered tumbler, a liquid line, and one
 * ice cube. */
export const TUMBLER_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M7 8h10l-1.2 11.2a1 1 0 0 1-1 .8H9.2a1 1 0 0 1-1-.8Z" },
  { kind: "path", d: "M7.6 13h8.8" },
  { kind: "rect", x: 10.3, y: 9.5, w: 2.6, h: 2.6, rx: 0.4 },
];

/** Lit dynamite stick (🧨, rare) — a wrapped stick, a curled fuse, and a
 * spark burst at the tip. */
export const DYNAMITE_ELEMENTS: IconElement[] = [
  { kind: "rect", x: 8, y: 9, w: 8, h: 11, rx: 1.4 },
  { kind: "path", d: "M8 12.5h8M8 16h8" },
  { kind: "path", d: "M12 9V5.5" },
  { kind: "path", d: "M12 5.5c.8-.6 1-1.6.5-2.4" },
  { kind: "path", d: "M12.5 2.2 13.6 1M14.3 3l1.6-.6M13.2 4.3l1.2 1.3" },
];

/** Evil-eye amulet (🧿, rare) — a teardrop pendant with concentric rings and
 * a pupil, like a nazar bead. */
export const EVIL_EYE_ELEMENTS: IconElement[] = [
  {
    kind: "path",
    d: "M12 3.5c4.8 0 8 3.9 8 8.3 0 3.4-1.8 6-4.4 7.3L12 21l-3.6-2c-2.6-1.3-4.4-3.9-4.4-7.3 0-4.4 3.2-8.2 8-8.2Z",
  },
  { kind: "circle", cx: 12, cy: 11, r: 4.6 },
  { kind: "circle", cx: 12, cy: 11, r: 2.8 },
  { kind: "circle", cx: 12, cy: 11, r: 1.1, filled: true },
];

/** Archery bow (🏹, rare) — a curved bow, its string, a nocked arrow shaft,
 * an arrowhead, and fletching. */
export const BOW_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M6 3.5c6 3 6 13.5 0 17" },
  { kind: "path", d: "M6 3.5 6 20.5" },
  { kind: "path", d: "M6 12h13" },
  { kind: "path", d: "M19 12 15.7 9.7M19 12l-3.3 2.3" },
  { kind: "path", d: "M6 12 9 10.6M6 12l3 1.4" },
];

/** Owl (🦉, rare) — ear tufts, a rounded head/body silhouette, large
 * ringed eyes with pupils, and a small beak. */
export const OWL_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M8 5.5 6.3 2.7M16 5.5l1.7-2.8" },
  {
    kind: "path",
    d: "M12 5c-3.6 0-5.8 2.6-5.8 6 0 2 .7 3.6 1.8 4.8L7 20.5c1.6.9 3.3 1.4 5 1.4s3.4-.5 5-1.4l-1-4.7c1.1-1.2 1.8-2.8 1.8-4.8 0-3.4-2.2-6-5.8-6Z",
  },
  { kind: "circle", cx: 9.3, cy: 10.2, r: 1.7 },
  { kind: "circle", cx: 14.7, cy: 10.2, r: 1.7 },
  { kind: "circle", cx: 9.3, cy: 10.2, r: 0.5, filled: true },
  { kind: "circle", cx: 14.7, cy: 10.2, r: 0.5, filled: true },
  { kind: "path", d: "M12 11.5 11 13.5 13 13.5Z" },
];

/** UFO (🛸, epic) — a flattened saucer body, a dome, three light-beam
 * streaks, and three underside lights. */
export const UFO_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M4 13c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5-3.6 2.5-8 2.5-8-1.1-8-2.5Z" },
  { kind: "path", d: "M9 10.5c.3-2.6 1.8-4 3-4s2.7 1.4 3 4" },
  { kind: "path", d: "M6 15.5 4.5 19M9 16.3 8 20M15 16.3l1 3.7M18 15.5l1.5 3.5" },
  { kind: "circle", cx: 7.2, cy: 13, r: 0.6, filled: true },
  { kind: "circle", cx: 12, cy: 13.4, r: 0.6, filled: true },
  { kind: "circle", cx: 16.8, cy: 13, r: 0.6, filled: true },
];

/** Slot machine (🎰, epic) — a cabinet, a 3-window reel display with
 * symbols, a coin-slot line, and a side lever with a knob. */
export const SLOT_MACHINE_ELEMENTS: IconElement[] = [
  { kind: "rect", x: 5, y: 4, w: 14, h: 15, rx: 1.5 },
  { kind: "rect", x: 7, y: 7, w: 10, h: 6, rx: 0.6 },
  { kind: "path", d: "M10.3 7v6M13.7 7v6" },
  { kind: "circle", cx: 8.7, cy: 10, r: 1, filled: true },
  { kind: "circle", cx: 12, cy: 10, r: 1, filled: true },
  { kind: "circle", cx: 15.3, cy: 10, r: 1, filled: true },
  { kind: "path", d: "M19.5 10.5h2V6.5" },
  { kind: "circle", cx: 21.5, cy: 5.6, r: 1, filled: true },
  { kind: "path", d: "M7.5 16.5h9" },
];

/** Mahjong tile (🀄, epic) — an outer tile with an engraved inner border and
 * an abstract carved-glyph mark, plus two corner ticks. */
export const MAHJONG_TILE_ELEMENTS: IconElement[] = [
  { kind: "rect", x: 5, y: 3.5, w: 14, h: 17, rx: 1.8 },
  { kind: "rect", x: 7, y: 5.5, w: 10, h: 13, rx: 1 },
  { kind: "path", d: "M12 8.5v7" },
  { kind: "path", d: "M9 9.5h6M9 15.5h6" },
  { kind: "path", d: "M9.3 12h5.4" },
  { kind: "path", d: "M7.8 6.3h1.4M14.8 6.3h1.4" },
];

/** Firework burst (🎆, mythic) — an 8-ray radial burst with spark tips and
 * two trailing streamers falling away below it. */
export const FIREWORK_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 12, cy: 9, r: 1.3, filled: true },
  {
    kind: "path",
    d: "M12 9L12 3M12 9L16.2 5.4M12 9L16.6 10.4M12 9L11 14.8M12 9L7.8 5.4M12 9L7.4 10.4M12 9L15.6 13.2M12 9L8.4 13.2",
  },
  { kind: "circle", cx: 12, cy: 3, r: 0.5, filled: true },
  { kind: "circle", cx: 16.2, cy: 5.4, r: 0.5, filled: true },
  { kind: "circle", cx: 16.6, cy: 10.4, r: 0.5, filled: true },
  { kind: "circle", cx: 7.8, cy: 5.4, r: 0.5, filled: true },
  { kind: "path", d: "M9.5 15.8 7.8 21" },
  { kind: "path", d: "M14.2 15.8 15.6 20.5" },
  { kind: "circle", cx: 7.5, cy: 21.5, r: 0.5, filled: true },
  { kind: "circle", cx: 15.8, cy: 20.8, r: 0.5, filled: true },
];

/** Playing-card fan (🎴, mythic) — three overlapping fanned cards (left
 * and right leaves rotated around a shared base, matching the achievement
 * melding icon's own "two overlapping rects" language but with a third,
 * angled pair) each with a small pip. */
export const CARD_FAN_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M5.4 10.2 11.1 8.1 14.8 18.5 9.2 20.5Z" },
  { kind: "rect", x: 9, y: 8.5, w: 6, h: 11, rx: 1 },
  { kind: "path", d: "M12.9 8.1 18.6 10.2 14.8 20.5 9.2 18.5Z" },
  { kind: "circle", cx: 7.4, cy: 12.6, r: 0.6, filled: true },
  { kind: "circle", cx: 12, cy: 11.3, r: 0.6, filled: true },
  { kind: "circle", cx: 16.5, cy: 12.6, r: 0.6, filled: true },
];

/** Crystal ball (🔮, apex) — genuine bespoke artwork, matching the pass's
 * one other apex icon (APEX_STARBURST_ELEMENTS above): an orb on a stand
 * with swirling mystical currents inside, a core spark, and sparkle
 * accents outside the glass — the most elaborate silhouette in this set. */
export const CRYSTAL_BALL_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M7.5 20.5c0-1.4 2-2.5 4.5-2.5s4.5 1.1 4.5 2.5" },
  { kind: "path", d: "M9.4 18.3 9 20.6M14.6 18.3l.4 2.3" },
  { kind: "circle", cx: 12, cy: 11, r: 7 },
  { kind: "path", d: "M8.3 8.2c1.6-1.8 4-2.6 6.2-2.1" },
  { kind: "path", d: "M8.8 14.2c2 1.7 5 1.9 7.1.2" },
  { kind: "path", d: "M12 7.2c-1.8 1.3-2.6 3.4-1.9 5.4" },
  { kind: "circle", cx: 12, cy: 11, r: 1, filled: true },
  { kind: "path", d: "M9 4.5 9.6 3M17.5 6l1.3-1M17 15.5l1.5.8" },
  { kind: "path", d: "M9.2 6.6c-.5-.6-.5-1.3 0-1.9" },
];
