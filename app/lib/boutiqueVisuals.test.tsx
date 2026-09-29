// Guardrails against the exact bug this pass fixed: the 105-item Boutique
// catalog expansion added 15 items to 4 categories (badge, avatar_frame,
// card_back, card_face) whose rendering is driven by a per-item lookup
// (RARITY_BADGE_ELEMENTS/RARITY_BADGE_ICON_ELEMENTS, AVATAR_FRAME_COLOR, a
// `[data-cardback="X"]` CSS block, a CardFace() switch branch) that was
// never extended for the new items — every one of them silently fell back
// to a shared generic look (a plain recolored medal, an invisible
// transparent frame, no card-back pattern at all, or the Classic card
// face). These tests fail loudly the next time a boutique item is added to
// one of these catalogs without its matching visual wired in, instead of
// relying on someone noticing a dozen identical badges by eye.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOUTIQUE_AVATAR_EMOJI_OPTIONS, PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";
import { AVATAR_FRAME_OPTIONS, AVATAR_FRAME_COLOR } from "./profileCosmetics";
import { SIGNATURE_CARD_BACKS } from "./cardBackStore";
import { CARD_FACES } from "./cardFaceStore";
import { RARITY_BADGE_ELEMENTS } from "../components/PremiumBadgeIcon";
import { BOUTIQUE_AVATAR_ICON_ELEMENTS } from "../components/BoutiqueAvatarIcon";
import { RARITY_BADGE_ICON_ELEMENTS } from "./shareCard";

const GLOBALS_CSS = fs.readFileSync(path.resolve(__dirname, "../globals.css"), "utf8");
const CARD_FACE_TSX = fs.readFileSync(path.resolve(__dirname, "../components/CardFace.tsx"), "utf8");

describe("every boutique badge has its own icon (not the generic medal fallback)", () => {
  const boutiqueBadges = PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique");

  it("sanity: the boutique badge list isn't empty", () => {
    expect(boutiqueBadges.length).toBeGreaterThan(0);
  });

  it.each(boutiqueBadges.map((o) => o.emoji))("%s has a RARITY_BADGE_ELEMENTS entry (PremiumBadgeIcon.tsx)", (emoji) => {
    expect(RARITY_BADGE_ELEMENTS[emoji]).toBeDefined();
    expect(RARITY_BADGE_ELEMENTS[emoji]!.length).toBeGreaterThan(0);
  });

  it.each(boutiqueBadges.map((o) => o.emoji))("%s has a matching entry in shareCard.ts's parallel map", (emoji) => {
    expect(RARITY_BADGE_ICON_ELEMENTS[emoji]).toBeDefined();
    expect(RARITY_BADGE_ICON_ELEMENTS[emoji]!.length).toBeGreaterThan(0);
  });

  it("no two boutique badges share the exact same icon (the original bug: a dozen identical shapes)", () => {
    const serialized = boutiqueBadges.map((o) => JSON.stringify(RARITY_BADGE_ELEMENTS[o.emoji]));
    expect(new Set(serialized).size).toBe(serialized.length);
  });
});

describe("every boutique avatar picture has its own icon (not the raw emoji fallback)", () => {
  it("sanity: the boutique avatar picture list isn't empty", () => {
    expect(BOUTIQUE_AVATAR_EMOJI_OPTIONS.length).toBeGreaterThan(0);
  });

  it.each(BOUTIQUE_AVATAR_EMOJI_OPTIONS.map((o) => o.emoji))(
    "%s has a BOUTIQUE_AVATAR_ICON_ELEMENTS entry (BoutiqueAvatarIcon.tsx)",
    (emoji) => {
      expect(BOUTIQUE_AVATAR_ICON_ELEMENTS[emoji]).toBeDefined();
      expect(BOUTIQUE_AVATAR_ICON_ELEMENTS[emoji]!.length).toBeGreaterThan(0);
    }
  );

  it("no two boutique avatar pictures share the exact same icon (the original bug: 15 identical plain emoji)", () => {
    const serialized = BOUTIQUE_AVATAR_EMOJI_OPTIONS.map((o) => JSON.stringify(BOUTIQUE_AVATAR_ICON_ELEMENTS[o.emoji]));
    expect(new Set(serialized).size).toBe(serialized.length);
  });

  it("no boutique avatar picture icon collides with a boutique badge icon (the two systems stay visually separate)", () => {
    const boutiqueBadges = PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique");
    const badgeIcons = new Set(boutiqueBadges.map((o) => JSON.stringify(RARITY_BADGE_ELEMENTS[o.emoji])));
    const collisions = BOUTIQUE_AVATAR_EMOJI_OPTIONS.filter((o) =>
      badgeIcons.has(JSON.stringify(BOUTIQUE_AVATAR_ICON_ELEMENTS[o.emoji]))
    );
    expect(collisions).toEqual([]);
  });
});

describe("every boutique avatar frame has a real color (not the transparent fallback)", () => {
  const boutiqueFrames = AVATAR_FRAME_OPTIONS.filter((o) => o.source === "boutique");

  it("sanity: the boutique frame list isn't empty", () => {
    expect(boutiqueFrames.length).toBeGreaterThan(0);
  });

  it.each(boutiqueFrames.map((o) => o.id))("%s has an AVATAR_FRAME_COLOR entry", (id) => {
    expect(AVATAR_FRAME_COLOR[id]).toBeDefined();
    expect(AVATAR_FRAME_COLOR[id]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("no two boutique frames share the exact same color", () => {
    const colors = boutiqueFrames.map((o) => AVATAR_FRAME_COLOR[o.id]?.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("no boutique frame color collides with a free/earned frame's color", () => {
    const earned = AVATAR_FRAME_OPTIONS.filter((o) => o.source !== "boutique" && o.id !== "grandmaster").map(
      (o) => AVATAR_FRAME_COLOR[o.id]?.toLowerCase()
    );
    const boutique = boutiqueFrames.map((o) => AVATAR_FRAME_COLOR[o.id]?.toLowerCase());
    const collisions = boutique.filter((c) => earned.includes(c));
    expect(collisions).toEqual([]);
  });
});

describe("every boutique card back has a real, distinct [data-cardback] CSS rule", () => {
  const boutiqueBacks = SIGNATURE_CARD_BACKS.filter((o) => o.source === "boutique");

  it("sanity: the boutique card back list isn't empty", () => {
    expect(boutiqueBacks.length).toBeGreaterThan(0);
  });

  // Captures each [data-cardback="id"] { ...body... } block so we can both
  // confirm it exists and compare its body against every other block.
  function cardBackBlock(id: string): string | null {
    const re = new RegExp(`\\[data-cardback="${id}"\\]\\s*\\{([^}]*)\\}`, "m");
    const match = GLOBALS_CSS.match(re);
    return match ? match[1].trim() : null;
  }

  it.each(boutiqueBacks.map((o) => o.id))('%s has a [data-cardback] block in globals.css', (id) => {
    const block = cardBackBlock(id);
    expect(block).not.toBeNull();
    expect(block!.length).toBeGreaterThan(0);
  });

  it("no two boutique card backs render an identical pattern", () => {
    const blocks = boutiqueBacks.map((o) => cardBackBlock(o.id));
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it("this pass's 5 new card backs are identical to none of the 10 that already had CSS", () => {
    // The 10 that already had a real [data-cardback] block before this pass
    // (see globals.css's own "8 more Signature backs" comment plus
    // foilweave/static above it) vs. the 5 this pass had to add
    // (damask/filigree/obsidianweave/prismveil/goldleaf) — the exact split
    // called out in this fix's own scope.
    const alreadyHadCss = ["foilweave", "static", "houndstooth", "marble", "tartan", "quilted", "starfield", "brushed", "chevron", "basketweave", "confetti"];
    const newlyAdded = ["damask", "filigree", "obsidianweave", "prismveil", "goldleaf"];
    const existingBlocks = new Set(alreadyHadCss.map((id) => cardBackBlock(id)));
    for (const id of newlyAdded) {
      expect(existingBlocks.has(cardBackBlock(id))).toBe(false);
    }
  });
});

describe("every boutique card face has its own CardFace() branch (doesn't fall through to Classic)", () => {
  const boutiqueFaces = CARD_FACES.filter((o) => o.source === "boutique" && o.id !== "classic");

  it("sanity: the boutique card face list isn't empty", () => {
    expect(boutiqueFaces.length).toBeGreaterThan(0);
  });

  it.each(boutiqueFaces.map((o) => o.id))('%s has a `resolved === "..."` branch in CardFace.tsx', (id) => {
    expect(CARD_FACE_TSX).toMatch(new RegExp(`resolved === "${id}"`));
  });
});
