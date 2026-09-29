// Custom line-art for the 15 Boutique avatar PICTURES (avatarPresets.ts's
// BOUTIQUE_AVATAR_EMOJI_OPTIONS) — the same problem the 15 boutique badges
// had (see rarityBadgeIconPaths.ts's own header): every one of these
// rendered as the exact plain system emoji on a flat colored circle, which
// is indistinguishable from picking the same emoji character for free on
// any phone's keyboard. Deliberately a *separate* system from
// rarityBadgeIconPaths.ts/achievementIconPaths.ts, not a reskin of either —
// these are competing whole PICTURES a person's face-stand-in everywhere
// their profile shows up (Leaderboard, Friends, Profile, share cards), not
// small badge accessories, so the animal subjects and the exact silhouettes
// below share no design with any of the 9+15 badge icons.
//
// Same data shape as rarityBadgeIconPaths.ts (one IconElement[] per item,
// rendered as JSX by BoutiqueAvatarIcon.tsx) and the same "detail rises with
// rarity" idea: the 2 common items are a handful of primitives, the apex
// item (eagle) is the most elaborate bespoke artwork in this file, matching
// how rarityBadgeIconPaths.ts treats its own apex item. Bolder, slightly
// simpler linework than the badge set throughout — these need to still read
// as "a turtle" / "an eagle" at the smallest avatar chip sizes (28px), not
// just at Profile-header size (96px), so BoutiqueAvatarIcon.tsx's stroke
// width is deliberately heavier than ACHIEVEMENT_ICON_PROPS's.

import { IconElement } from "./achievementIconPaths";

// --- Common (2): turtle, snail — the simplest silhouettes in the set. ---

/** Turtle (🐢) — a domed shell, a small head on a short neck, two visible
 * legs, and a stub tail. */
export const TURTLE_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M4 14c0-4.6 3.7-7.3 8-7.3s8 2.7 8 7.3" },
  { kind: "path", d: "M4 14h16" },
  { kind: "circle", cx: 20.3, cy: 13.3, r: 1.6 },
  { kind: "path", d: "M18.3 13.3h1.4" },
  { kind: "path", d: "M6.5 14.6v2.4" },
  { kind: "path", d: "M17 14.6v2.4" },
  { kind: "path", d: "M3.6 14.8l-1.4.9" },
];

/** Snail (🐌) — a spiral shell, a curved body/foot trailing to a base line,
 * and two eye stalks. */
export const SNAIL_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 14.5, cy: 9.6, r: 4.2 },
  { kind: "path", d: "M14.5 9.6a2.2 2.2 0 1 0-2.2 2.2 1.1 1.1 0 1 0 1.1-1.1" },
  { kind: "path", d: "M3.5 19.2c0-3 2.6-5.3 6-5.3 2 0 3.8.9 5 2.4" },
  { kind: "path", d: "M3.5 19.2h10" },
  { kind: "path", d: "M8.5 14.2 7.9 11.7M10.6 13.8 10.3 11.3" },
];

// --- Uncommon (3): sloth, hedgehog, chipmunk. ---

/** Sloth (🦥) — hanging from a branch by two long arms, a round masked
 * face, and a small smiling snout. */
export const SLOTH_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M2 6h20" },
  { kind: "path", d: "M8 6v5.6" },
  { kind: "path", d: "M16 6v5.6" },
  { kind: "circle", cx: 12, cy: 15.3, r: 5 },
  { kind: "circle", cx: 9.6, cy: 14.3, r: 1.6 },
  { kind: "circle", cx: 14.4, cy: 14.3, r: 1.6 },
  { kind: "circle", cx: 9.6, cy: 14.3, r: 0.5, filled: true },
  { kind: "circle", cx: 14.4, cy: 14.3, r: 0.5, filled: true },
  { kind: "path", d: "M10.3 17.4c.5.9 1.3 1.4 1.7 1.4s1.2-.5 1.7-1.4" },
];

/** Hedgehog (🦔) — a domed body, a row of back spikes, a pointed snout, and
 * three short legs. */
export const HEDGEHOG_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M3.5 18a8 5 0 0 1 16 0" },
  { kind: "path", d: "M5 13l1.6 2.3M8.3 11l1 2.6M11.6 10l.3 2.8M15 11l-.9 2.5M18 13l-1.7 2.3" },
  { kind: "path", d: "M18.7 16.3c1.2.1 2-.5 2.2-1.4" },
  { kind: "circle", cx: 16.3, cy: 15.6, r: 0.55, filled: true },
  { kind: "path", d: "M7 20.5v-2" },
  { kind: "path", d: "M11 20.7v-2" },
  { kind: "path", d: "M15 20.5v-2" },
];

/** Chipmunk (🐿️) — a round head with pointed ears, a stuffed cheek pouch, a
 * single back stripe, and a bushy curled tail. */
export const CHIPMUNK_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 9.3, cy: 11, r: 3.8 },
  { kind: "path", d: "M6.8 8.2 6 6.3M11.5 8.2l.9-2" },
  { kind: "path", d: "M12.7 12.4a2 2 0 1 0 .3-3.7" },
  { kind: "circle", cx: 8.3, cy: 10.3, r: 0.55, filled: true },
  { kind: "path", d: "M4.8 20c-.8-3.7 1-6.8 4.4-7.7" },
  { kind: "path", d: "M6.6 15c1.7 1.7 4 2.5 6.3 2.2" },
  { kind: "path", d: "M14 15.3c3.2.2 5.3-2.3 4.8-5.5-.3-2.1-2.1-3.4-1.8-5.3" },
  { kind: "path", d: "M7 20.3h2.6" },
];

// --- Rare (4): otter, beaver, seal, parrot. ---

/** Otter (🦦) — a round whiskered head floating above a body on its back,
 * paws raised together. */
export const OTTER_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 8, cy: 8.5, r: 3.3 },
  { kind: "path", d: "M5.9 6.4c-.3-.9 0-1.7.6-2.1M10.1 6.4c.3-.9 0-1.7-.6-2.1" },
  { kind: "circle", cx: 6.9, cy: 8.2, r: 0.5, filled: true },
  { kind: "circle", cx: 9.1, cy: 8.2, r: 0.5, filled: true },
  { kind: "path", d: "M4.7 9.3 2 8.8M4.7 10.3 2.2 11M11.3 9.3 14 8.8M11.3 10.3l2.7.7" },
  { kind: "path", d: "M3.5 20.3c0-4.3 3.8-6.8 8-6.8s8 2.5 8 6.8" },
  { kind: "path", d: "M18.5 19c1.6-.5 2.6-1.9 2.3-3.4" },
  { kind: "path", d: "M9 19.3c.8.5 1.6.6 2.4.2M12.6 19.3c.8.5 1.6.6 2.4.2" },
];

/** Beaver (🦫) — a round head with buck teeth, and the one unmistakable
 * feature: a large flat textured paddle tail. */
export const BEAVER_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 9, cy: 9, r: 3.6 },
  { kind: "path", d: "M6.2 6.6c-.4-.9-.2-1.7.5-2.2M11.3 6.6c.4-.9.2-1.7-.5-2.2" },
  { kind: "circle", cx: 7.6, cy: 8.4, r: 0.5, filled: true },
  { kind: "path", d: "M8.2 11c0 .9.5 1.4 1.1 1.4h1.4c.6 0 1.1-.5 1.1-1.4" },
  { kind: "path", d: "M9.9 11v1.4" },
  { kind: "path", d: "M4 21c-1-5 2.4-9.4 7.5-9.4 2.7 0 4.9 1.2 6.2 3" },
  { kind: "path", d: "M16 13.3c2.6-.3 4.8 1 5.4 3.4.6 2.4-.8 4.6-3.3 5.2-2.5.6-4.9-.7-5.5-3.1-.3-1.3 0-2.5.7-3.5Z" },
  { kind: "path", d: "M15.7 17h5.6M16.3 19.4l4.6-1" },
  { kind: "path", d: "M7.4 21v-1.6M12 21.2v-1.6" },
];

/** Seal (🦭) — a sleek lying-down body, whiskers, and small front/tail
 * flippers. */
export const SEAL_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M3.5 18c-.3-5.6 4.2-10 9.6-10 4.8 0 8.4 2.8 8.4 6.6 0 3.6-3.5 5.9-8 5.9-3.6 0-7-.7-10-2.5" },
  { kind: "circle", cx: 8.6, cy: 11, r: 0.6, filled: true },
  { kind: "path", d: "M6.6 12 4 11.6M6.6 12.8 4.2 13.4M6.6 13.6 4.4 14.6" },
  { kind: "path", d: "M9 17c1 1.3 2.6 1.8 4 1.4" },
  { kind: "path", d: "M19 14.3c1 .8 1.2 2 .6 3" },
  { kind: "path", d: "M7.6 12.8c.4.3.9.3 1.2 0" },
  { kind: "path", d: "M3 19.3h9.5" },
  { kind: "path", d: "M9 8.6c1.6-.8 3.5-.9 5.2-.3" },
];

/** Parrot (🦜) — a hooked beak, a crest feather, a single wing, and fanned
 * tail feathers. */
export const PARROT_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 10, cy: 8, r: 3.4 },
  { kind: "path", d: "M13.2 7.6c1.6-.2 2.8.4 3 1.6.2 1.1-.8 1.9-2.2 2-.9.1-1.7-.2-2.1-.8" },
  { kind: "circle", cx: 9.6, cy: 7.2, r: 0.55, filled: true },
  { kind: "path", d: "M8.6 4.8c.2-1 1-1.7 2-1.8" },
  { kind: "path", d: "M6 11c-2.4.6-3.8 2.7-3.4 5 .4 2.2 2.6 3.5 5 3 2-.4 3.3-2 3.4-3.8" },
  { kind: "path", d: "M7 10.3c-1.4 1-2.2 2.6-2.2 4.4 0 3 2.4 5.3 5.6 5.3 2.4 0 4.5-1.4 5.4-3.5" },
  { kind: "path", d: "M15.5 16.3l4.5 2.4M16 18.3l4 3.2M14.8 18.1l3 4" },
  { kind: "path", d: "M11.3 20.8v1.6M13 20.6v1.8" },
];

// --- Epic (3): flamingo, crocodile, whale. ---

/** Flamingo (🦩) — a small head, a bent black-tipped beak, a long S-curved
 * neck, an oval body, and the signature one-leg stance. */
export const FLAMINGO_ELEMENTS: IconElement[] = [
  { kind: "circle", cx: 15.5, cy: 5.5, r: 2.2 },
  { kind: "path", d: "M17.5 5.3c1.4-.1 2.5.6 2.7 1.8" },
  { kind: "path", d: "M20.2 7.1c-.3.9-1.1 1.4-2 1.3" },
  { kind: "circle", cx: 15.1, cy: 4.9, r: 0.4, filled: true },
  { kind: "path", d: "M13.6 6.8c-2.4 1.8-3.6 4.6-3.2 7.6.3 2 1.3 3.6 2.8 4.7" },
  { kind: "path", d: "M9 15.5c0-2.4 2.2-4.3 5-4.3s5 1.9 5 4.3-2.2 4.3-5 4.3-5-1.9-5-4.3Z" },
  { kind: "path", d: "M8.6 14c1.6-1 3.5-1.3 5.4-.9" },
  { kind: "path", d: "M18.5 14.5l2.6-.8M18.8 16l2.8.4" },
  { kind: "path", d: "M11.5 19.7v-2.2l-1.6-1.6M11.5 19.7l-1.8 1" },
  { kind: "path", d: "M9.4 20.9h2.2" },
  { kind: "path", d: "M13 19.9c.4-1.1.3-2.3-.3-3.3" },
];

/** Crocodile (🐊) — a long flat snout with zigzag teeth, twin eye bumps,
 * back ridges, and a tapering tail. */
export const CROCODILE_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M2 12.5c3-1.3 6.7-2 10.5-2s7.2.5 9.5 1.6" },
  { kind: "path", d: "M2 14c3-.8 6.7-1.3 10.5-1.3s7.2.3 9.5 1" },
  { kind: "path", d: "M5 12.6l1 1.1 1-1.2 1 1.1 1-1.2 1 1.1 1-1.1" },
  { kind: "circle", cx: 15, cy: 10.6, r: 1 },
  { kind: "circle", cx: 17.6, cy: 11, r: 0.9 },
  { kind: "circle", cx: 15, cy: 10.6, r: 0.35, filled: true },
  { kind: "circle", cx: 17.6, cy: 11, r: 0.3, filled: true },
  { kind: "path", d: "M12 12c.6-1 1.6-1.6 2.7-1.6M9 12.4c.5-.9 1.4-1.5 2.4-1.5" },
  { kind: "path", d: "M2 14.3c-.6 2 .6 3.8 2.6 4.2 3 .6 6-1 6-1" },
  { kind: "path", d: "M10.6 17.5c1.4.6 2.2 2 2 3.4" },
  { kind: "path", d: "M6 18.3v2" },
];

/** Whale (🐳) — a rounded body, a belly curve, a forked tail fluke, a
 * pectoral fin, and a three-stream blowhole spout. */
export const WHALE_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M2.5 12c0-3.3 3.8-5.6 8.8-5.6 5.3 0 9 2.6 10 5.9" },
  { kind: "path", d: "M2.8 13c1.7 3.6 6 6 10.5 6 1.7 0 3.3-.3 4.7-.9" },
  { kind: "path", d: "M18 15.8c2-.2 4 .6 5.3 2.2-2 .5-4.1.1-5.6-1.2" },
  { kind: "path", d: "M18.3 17.6c1.5 1.3 1.9 3.1 1 4.7-1.7-1-2.7-2.6-2.4-4.4" },
  { kind: "path", d: "M9.5 13.8c-.5 1.6-.2 3.1.9 4.2 0-1.7.3-3.1.9-4.4" },
  { kind: "circle", cx: 7.2, cy: 10.6, r: 0.55, filled: true },
  { kind: "path", d: "M6 5.3c-.3-1 0-2 .8-2.7M7.4 5c.2-1.2.9-2.1 1.9-2.5M8.6 5.4c.6-.9 1.6-1.4 2.6-1.3" },
  { kind: "path", d: "M6.4 6.2c.3-.2.7-.2 1 0" },
  { kind: "path", d: "M2.8 12.6c1.6.5 3.4.8 5.2.8" },
  { kind: "path", d: "M13 6.6c.5-.3 1.1-.3 1.6 0M15.6 6.9c.5-.3 1.1-.3 1.6.1" },
];

// --- Mythic (2): shark, squid — noticeably more elaborate than epic. ---

/** Shark (🦈) — a torpedo body, a triangular dorsal fin, a forked tail,
 * gill slits, and a toothed mouth. */
export const SHARK_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M1.5 13.6c0-3.3 4.2-5.6 9.6-5.6 6.1 0 10.4 2.8 11 6.1" },
  { kind: "path", d: "M1.8 14.6c2 2.9 5.9 4.8 10.2 4.8 2.5 0 4.9-.6 6.8-1.8" },
  { kind: "path", d: "M10 8.4c.2-2.3 1.6-4 3.6-4.5-.3 2.2.3 3.9 1.6 5" },
  { kind: "path", d: "M19.5 12.8c1.2-1.1 2.8-1.3 4-.6" },
  { kind: "path", d: "M19.7 14c1 1.3 1.2 3 .3 4.4-1.4-1-2.1-2.5-1.8-4.1" },
  { kind: "path", d: "M6.5 13.3v2M8 13.3v2.2M9.5 13.3v2.3" },
  { kind: "circle", cx: 4.6, cy: 11.8, r: 0.55, filled: true },
  { kind: "path", d: "M2.3 14.8h3" },
  { kind: "path", d: "M3 14.5v.7M4 14.5v.7" },
  { kind: "path", d: "M12 15.6c-.3 1.6.3 3 1.7 3.9.2-1.7.9-3 2-3.9" },
  { kind: "path", d: "M13 16.6c.6.2 1.2.6 1.6 1.1" },
];

/** Squid (🦑) — a tapered mantle with side fins, two large eyes, and six
 * trailing curled tentacles, the most elaborate silhouette besides the
 * apex item. */
export const SQUID_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M12 2.3c3 2.6 4.8 6.4 4.8 10.4 0 1.7-.3 3.3-1 4.7H8.2c-.7-1.4-1-3-1-4.7 0-4 1.8-7.8 4.8-10.4Z" },
  { kind: "path", d: "M6.5 8.3c-1.6.4-2.7 1.7-2.7 3.3" },
  { kind: "path", d: "M17.5 8.3c1.6.4 2.7 1.7 2.7 3.3" },
  { kind: "circle", cx: 9.6, cy: 9, r: 1.4 },
  { kind: "circle", cx: 14.4, cy: 9, r: 1.4 },
  { kind: "circle", cx: 9.6, cy: 9, r: 0.5, filled: true },
  { kind: "circle", cx: 14.4, cy: 9, r: 0.5, filled: true },
  { kind: "path", d: "M8 17.6c-.6 1.6-.3 3.2.8 4.4" },
  { kind: "path", d: "M9.8 17.6c-.2 1.8.5 3.4 2 4.4" },
  { kind: "path", d: "M11.6 17.6v4.6" },
  { kind: "path", d: "M13.5 17.6c.3 1.7-.3 3.3-1.7 4.3" },
  { kind: "path", d: "M15.2 17.6c.6 1.6.3 3.2-.8 4.4" },
  { kind: "path", d: "M16.9 17.6c.9 1.4.9 3-.1 4.2" },
];

// --- Apex (1): eagle — genuine bespoke artwork, the single most elaborate
// silhouette in this file, matching how rarityBadgeIconPaths.ts reserves
// its own richest linework for its one apex item. ---

/** Eagle (🦅) — a raised head with a hooked beak and crown feather, spread
 * wings with feather-tip detail, chest feather lines, a fanned tail, and
 * gripping talons. */
export const EAGLE_ELEMENTS: IconElement[] = [
  { kind: "path", d: "M12 2.3c-1.7 0-3 1.3-3 3 0 1.1.6 2.1 1.5 2.6l-1 1.7h5l-1-1.7c.9-.5 1.5-1.5 1.5-2.6 0-1.7-1.3-3-3-3Z" },
  { kind: "path", d: "M9 6.5c-1 .2-1.8.8-2.1 1.7 1 0 1.9-.2 2.6-.7" },
  { kind: "circle", cx: 11, cy: 5.2, r: 0.5, filled: true },
  { kind: "path", d: "M10.3 3.4c.5-.5 1.1-.8 1.7-.8s1.2.3 1.7.8" },
  { kind: "path", d: "M12 9.5c-3.6-.3-7.2.4-10.5 2 3 1.8 6.8 2.4 10.5 1.7" },
  { kind: "path", d: "M1.5 11.5c1.2 1.3 2.8 2.2 4.6 2.6M4.3 11c1 1 2.3 1.7 3.7 2" },
  { kind: "path", d: "M12 9.5c3.6-.3 7.2.4 10.5 2-3 1.8-6.8 2.4-10.5 1.7" },
  { kind: "path", d: "M22.5 11.5c-1.2 1.3-2.8 2.2-4.6 2.6M19.7 11c-1 1-2.3 1.7-3.7 2" },
  { kind: "path", d: "M12 9.8c-1.4 2.5-1.8 5.4-1.1 8.2h2.2c.7-2.8.3-5.7-1.1-8.2Z" },
  { kind: "path", d: "M11 12.5c.3.8.7 1.6.7 2.4M13 12.5c-.3.8-.7 1.6-.7 2.4" },
  { kind: "path", d: "M9.5 18c.8 1.8.8 3.6 0 5.3M12 18v5.5M14.5 18c-.8 1.8-.8 3.6 0 5.3" },
  { kind: "path", d: "M10.3 17.6c-.6.8-1.6 1.2-2.6 1.1" },
  { kind: "path", d: "M13.7 17.6c.6.8 1.6 1.2 2.6 1.1" },
];
