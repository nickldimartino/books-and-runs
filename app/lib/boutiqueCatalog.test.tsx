import { describe, expect, it } from "vitest";
import {
  BOUTIQUE_AVATAR_EMOJI_OPTIONS,
  EMOJI_OPTIONS,
  PREMIUM_EMOJI_OPTIONS,
} from "./avatarPresets";
import { BANNER_OPTIONS } from "./bannerPresets";
import { SIGNATURE_CARD_BACKS } from "./cardBackStore";
import { CARD_FACES } from "./cardFaceStore";
import { CosmeticRarity } from "./cosmeticRarity";
import { CosmeticUnlockRule } from "./cosmeticUnlocks";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "./profileCosmetics";

// `source: "boutique"` marks an item as meant to eventually be a real
// purchase — gated behind the "boutique" CosmeticUnlockRule kind
// (creator-only for now, see cosmeticUnlocks.ts's own doc on why that's a
// distinct kind from creatorOnly). The two fields need to agree exactly:
// every boutique item is gated by that kind and nothing else, and nothing
// non-boutique uses that kind (it would be unreachable for anyone but the
// creator with no way to ever change that, unlike a real Boutique item
// whose gate is meant to loosen once payments exist).
describe("`source: \"boutique\"` and `unlock: { kind: \"boutique\" }` always agree", () => {
  const catalogs: { name: string; entries: readonly { unlock?: CosmeticUnlockRule; source?: "boutique" }[] }[] = [
    { name: "PREMIUM_EMOJI_OPTIONS (badge)", entries: PREMIUM_EMOJI_OPTIONS },
    { name: "AVATAR_FRAME_OPTIONS (frame)", entries: AVATAR_FRAME_OPTIONS },
    { name: "TITLE_OPTIONS (title)", entries: TITLE_OPTIONS },
    { name: "BANNER_OPTIONS (banner)", entries: BANNER_OPTIONS },
    { name: "CARD_FACES (card face)", entries: CARD_FACES },
    { name: "SIGNATURE_CARD_BACKS (card back)", entries: SIGNATURE_CARD_BACKS },
    { name: "BOUTIQUE_AVATAR_EMOJI_OPTIONS (avatar emoji)", entries: BOUTIQUE_AVATAR_EMOJI_OPTIONS },
  ];

  for (const { name, entries } of catalogs) {
    it(name, () => {
      const mismatched = entries.filter((e) => (e.source === "boutique") !== (e.unlock?.kind === "boutique"));
      expect(mismatched).toEqual([]);
    });
  }
});

// The store.md-mandated catalog expansion: every one of the 7 boutique
// categories has exactly 15 items in the exact 2/3/4/3/2/1
// common/uncommon/rare/epic/mythic/apex distribution. Src/store/catalog.ts
// re-derives its own item list from these same ids and is checked
// separately (catalog.test.ts) for price/sku correctness; this file checks
// the presentation-layer catalogs' own `rarity` field is what it should be.
const EXPECTED_DISTRIBUTION: Record<CosmeticRarity, number> = {
  common: 2,
  uncommon: 3,
  rare: 4,
  epic: 3,
  mythic: 2,
  apex: 1,
};

function rarityCounts(rarities: readonly (CosmeticRarity | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rarities) counts[r ?? "MISSING"] = (counts[r ?? "MISSING"] ?? 0) + 1;
  return counts;
}

describe("every boutique category has exactly 15 items in the 2/3/4/3/2/1 rarity distribution", () => {
  const categories: { name: string; boutiqueRarities: readonly (CosmeticRarity | undefined)[] }[] = [
    { name: "badge", boutiqueRarities: PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.rarity) },
    { name: "avatar_frame", boutiqueRarities: AVATAR_FRAME_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.rarity) },
    { name: "title", boutiqueRarities: TITLE_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.rarity) },
    { name: "banner", boutiqueRarities: BANNER_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.rarity) },
    { name: "card_face", boutiqueRarities: CARD_FACES.filter((o) => o.source === "boutique").map((o) => o.rarity) },
    { name: "card_back", boutiqueRarities: SIGNATURE_CARD_BACKS.filter((o) => o.source === "boutique").map((o) => o.rarity) },
    { name: "avatar_emoji", boutiqueRarities: BOUTIQUE_AVATAR_EMOJI_OPTIONS.map((o) => o.rarity) },
  ];

  for (const { name, boutiqueRarities } of categories) {
    it(name, () => {
      expect(boutiqueRarities).toHaveLength(15);
      expect(rarityCounts(boutiqueRarities)).toEqual(EXPECTED_DISTRIBUTION);
    });
  }
});

// badge + avatar_emoji share one emoji namespace (avatarPresets.ts) — every
// emoji across the free avatar picker (EMOJI_OPTIONS), every earned/boutique
// badge (PREMIUM_EMOJI_OPTIONS), and every boutique avatar emoji
// (BOUTIQUE_AVATAR_EMOJI_OPTIONS) must be unique. This intentionally does
// NOT check EMOJI_OPTIONS against PREMIUM_EMOJI_OPTIONS's *non-boutique*
// entries for pre-existing collisions (🎯 is deliberately reused today, as a
// free avatar pick and a separate earned badge, predating this catalog
// expansion) — only that this expansion's own additions never re-collide.
describe("avatar emoji are unique across avatarPresets.ts", () => {
  it("no duplicate emoji within the boutique badges", () => {
    const emoji = PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.emoji);
    expect(new Set(emoji).size).toBe(emoji.length);
  });

  it("no duplicate emoji within the boutique avatar emoji", () => {
    const emoji = BOUTIQUE_AVATAR_EMOJI_OPTIONS.map((o) => o.emoji);
    expect(new Set(emoji).size).toBe(emoji.length);
  });

  it("no boutique badge or boutique avatar emoji collides with a free avatar emoji, a free/earned badge, or each other", () => {
    const free = new Set(EMOJI_OPTIONS);
    const earnedBadges = new Set(PREMIUM_EMOJI_OPTIONS.filter((o) => o.source !== "boutique").map((o) => o.emoji));
    const boutiqueBadges = PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.emoji);
    const boutiqueAvatarEmoji = BOUTIQUE_AVATAR_EMOJI_OPTIONS.map((o) => o.emoji);

    const collisions: string[] = [];
    for (const e of [...boutiqueBadges, ...boutiqueAvatarEmoji]) {
      if (free.has(e)) collisions.push(`${e} collides with a free avatar emoji`);
      if (earnedBadges.has(e)) collisions.push(`${e} collides with an earned badge`);
    }
    // Cross-check the two boutique lists against each other too.
    const badgeSet = new Set(boutiqueBadges);
    for (const e of boutiqueAvatarEmoji) {
      if (badgeSet.has(e)) collisions.push(`${e} is both a boutique badge and a boutique avatar emoji`);
    }
    expect(collisions).toEqual([]);
  });
});

// Every boutique id (or emoji, for badge/avatar_emoji) must be unique
// *within* its own category — this is what src/store/catalog.ts's sku
// ("<category>:<id>") depends on to be collision-free.
describe("boutique ids are unique within each category", () => {
  const categories: { name: string; ids: readonly string[] }[] = [
    { name: "badge", ids: PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.emoji) },
    { name: "avatar_frame", ids: AVATAR_FRAME_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.id) },
    { name: "title", ids: TITLE_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.id) },
    { name: "banner", ids: BANNER_OPTIONS.filter((o) => o.source === "boutique").map((o) => o.id) },
    { name: "card_face", ids: CARD_FACES.filter((o) => o.source === "boutique").map((o) => o.id) },
    { name: "card_back", ids: SIGNATURE_CARD_BACKS.filter((o) => o.source === "boutique").map((o) => o.id) },
    { name: "avatar_emoji", ids: BOUTIQUE_AVATAR_EMOJI_OPTIONS.map((o) => o.emoji) },
  ];

  for (const { name, ids } of categories) {
    it(name, () => {
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
});

// Every boutique `unlock` rule must carry the `category`/`itemId` that
// matches its own item — without these, cosmeticUnlocks.ts's "boutique" case
// can never resolve `ctx.ownedSkus.has(...)` for that item, so a real
// purchase would never actually unlock it (see cosmeticUnlocks.ts's own doc
// on why these fields are optional there — only so an as-yet-unfilled
// catalog entry keeps compiling, not because a shipped item should ever
// omit them).
describe("every boutique unlock rule carries its own category/itemId", () => {
  const categories: {
    name: string;
    category: string;
    entries: readonly { unlock?: CosmeticUnlockRule; id: string }[];
  }[] = [
    {
      name: "badge",
      category: "badge",
      entries: PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique").map((o) => ({ unlock: o.unlock, id: o.emoji })),
    },
    {
      name: "avatar_frame",
      category: "avatar_frame",
      entries: AVATAR_FRAME_OPTIONS.filter((o) => o.source === "boutique"),
    },
    { name: "title", category: "title", entries: TITLE_OPTIONS.filter((o) => o.source === "boutique") },
    { name: "banner", category: "banner", entries: BANNER_OPTIONS.filter((o) => o.source === "boutique") },
    { name: "card_face", category: "card_face", entries: CARD_FACES.filter((o) => o.source === "boutique") },
    { name: "card_back", category: "card_back", entries: SIGNATURE_CARD_BACKS.filter((o) => o.source === "boutique") },
    {
      name: "avatar_emoji",
      category: "avatar_emoji",
      entries: BOUTIQUE_AVATAR_EMOJI_OPTIONS.map((o) => ({ unlock: o.unlock, id: o.emoji })),
    },
  ];

  for (const { name, category, entries } of categories) {
    it(name, () => {
      for (const entry of entries) {
        expect(entry.unlock?.kind).toBe("boutique");
        if (entry.unlock?.kind === "boutique") {
          expect(entry.unlock.category).toBe(category);
          expect(entry.unlock.itemId).toBe(entry.id);
        }
      }
    });
  }
});
