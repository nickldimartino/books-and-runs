import { describe, expect, it } from "vitest";
import {
  CATALOG,
  CATALOG_BUNDLES,
  CATALOG_ITEMS,
  CATEGORY_BUNDLES,
  catalogItem,
  computeBundlePriceCents,
  EVERYTHING_BUNDLE,
  EVERYTHING_BUNDLE_PRICE_CENTS,
  findBundle,
  ITEMS_BY_CATEGORY,
  roundToCharmCents,
  SINGLE_ITEM_PRICE_CENTS,
  STORE_CATEGORIES,
  SUPPORTER_BUNDLE,
  THEME_ITEMS,
} from "./catalog";

describe("CATALOG", () => {
  it("is non-empty", () => {
    expect(Object.keys(CATALOG).length).toBeGreaterThan(0);
  });

  // The one guard store.md asks for explicitly: create-checkout-session and
  // stripe-webhook only ever resolve a price through catalogItem(sku) —
  // never a client-submitted number — so every entry here must actually
  // resolve to a positive integer cents amount and a real name, or a typo'd
  // catalog entry (missing price, a float, a placeholder 0) would silently
  // let someone check out for the wrong amount instead of failing loudly.
  it.each(Object.keys(CATALOG))("sku %s resolves to a positive integer price and a non-empty name", (sku) => {
    const item = catalogItem(sku);
    expect(item).toBeDefined();
    expect(Number.isInteger(item!.priceCents)).toBe(true);
    expect(item!.priceCents).toBeGreaterThan(0);
    expect(typeof item!.name).toBe("string");
    expect(item!.name.length).toBeGreaterThan(0);
  });

  it("catalogItem returns undefined for a sku that isn't in the catalog", () => {
    expect(catalogItem("badge:does-not-exist")).toBeUndefined();
  });

  it("SINGLE_ITEM_PRICE_CENTS is a positive integer (flat $0.99 — Sept 2026 repricing)", () => {
    expect(Number.isInteger(SINGLE_ITEM_PRICE_CENTS)).toBe(true);
    expect(SINGLE_ITEM_PRICE_CENTS).toBe(99);
  });
});

// The store.md-mandated catalog expansion: 7 categories × 15 items = 105
// purchasable items, plus the Sept 2026 theme-category addition (30 more
// theme items) = 135 total items, plus 8 category bundles + 1 hero bundle +
// 1 Everything Bundle = 145 total skus in CATALOG.
describe("the real 135-item catalog", () => {
  it("has exactly 15 items in every one of the 7 non-theme categories, and 30 in theme", () => {
    for (const category of STORE_CATEGORIES) {
      if (category === "theme") {
        expect(ITEMS_BY_CATEGORY[category]).toHaveLength(30);
      } else {
        expect(ITEMS_BY_CATEGORY[category]).toHaveLength(15);
      }
    }
    expect(CATALOG_ITEMS).toHaveLength(135);
  });

  it("every item's priceCents equals SINGLE_ITEM_PRICE_CENTS, regardless of rarity — never hand-entered", () => {
    for (const item of CATALOG_ITEMS) {
      expect(item.rarity).toBeDefined();
      expect(item.priceCents).toBe(SINGLE_ITEM_PRICE_CENTS);
    }
  });

  it("every item sku is well-formed (\"<category>:<id>\") and globally unique", () => {
    const skus = CATALOG_ITEMS.map((i) => i.sku!);
    expect(new Set(skus).size).toBe(skus.length);
    for (const item of CATALOG_ITEMS) {
      expect(item.sku).toBe(`${item.category}:${item.id}`);
      expect(STORE_CATEGORIES).toContain(item.category);
      expect(item.id!.length).toBeGreaterThan(0);
    }
  });

  it("every bundle sku is well-formed (\"bundle:<bundleId>\") and every sku across items + bundles is globally unique", () => {
    for (const bundle of CATALOG_BUNDLES) {
      expect(bundle.sku).toBe(`bundle:${bundle.bundleId}`);
    }
    const allSkus = [...CATALOG_ITEMS.map((i) => i.sku!), ...CATALOG_BUNDLES.map((b) => b.sku)];
    expect(new Set(allSkus).size).toBe(allSkus.length);
  });

  it("every catalog item and bundle resolves through CATALOG with a matching name/price", () => {
    for (const item of CATALOG_ITEMS) {
      expect(catalogItem(item.sku!)).toEqual(expect.objectContaining({ name: item.name, priceCents: item.priceCents }));
    }
    for (const bundle of CATALOG_BUNDLES) {
      expect(catalogItem(bundle.sku)).toEqual({ name: bundle.name, priceCents: bundle.priceCents });
    }
  });
});

describe("roundToCharmCents", () => {
  it("rounds up to the nearest x.49 or x.99 ending", () => {
    expect(roundToCharmCents(6721.2)).toBe(6749);
    expect(roundToCharmCents(100)).toBe(149);
    expect(roundToCharmCents(149)).toBe(149);
    expect(roundToCharmCents(150)).toBe(199);
    expect(roundToCharmCents(199)).toBe(199);
    expect(roundToCharmCents(200)).toBe(249);
  });
});

describe("category bundles", () => {
  it("each of the 8 category bundles grants exactly that category's own items", () => {
    for (const bundle of CATEGORY_BUNDLES) {
      const category = bundle.bundleId;
      expect(bundle.sku).toBe(`bundle:${category}`);
      expect(bundle.skus).toEqual(ITEMS_BY_CATEGORY[category as keyof typeof ITEMS_BY_CATEGORY].map((i) => i.sku));
    }
    expect(CATEGORY_BUNDLES).toHaveLength(8);
  });

  it("each of the 7 non-theme bundles' priceCents is computeBundlePriceCents(15) — recomputed, not snapshotted", () => {
    for (const bundle of CATEGORY_BUNDLES) {
      if (bundle.bundleId === "theme") continue;
      expect(bundle.priceCents).toBe(computeBundlePriceCents(15));
    }
  });

  it("every non-theme category bundle lands on the same $11.99 price, since every one of those categories has 15 flat-priced items", () => {
    const prices = new Set(CATEGORY_BUNDLES.filter((b) => b.bundleId !== "theme").map((b) => b.priceCents));
    expect(prices.size).toBe(1);
    expect([...prices][0]).toBe(1199);
  });

  it("the Theme Bundle covers all 30 theme items at computeBundlePriceCents(30) — a genuinely different price", () => {
    const themeBundle = findBundle("bundle:theme")!;
    expect(themeBundle.skus).toHaveLength(30);
    expect(themeBundle.skus).toEqual(THEME_ITEMS.map((i) => i.sku));
    expect(themeBundle.priceCents).toBe(computeBundlePriceCents(30));
    expect(themeBundle.priceCents).not.toBe(computeBundlePriceCents(15));
  });
});

describe("computeBundlePriceCents", () => {
  it("matches the Sept 2026 repricing's worked examples", () => {
    expect(computeBundlePriceCents(15)).toBe(1199); // $11.99 — every category bundle
    expect(computeBundlePriceCents(8)).toBe(599); // $5.99 — the Supporter Pack
  });
});

describe("the Supporter Pack hero bundle", () => {
  it("is $5.99 (599 cents) — computeBundlePriceCents(8), derived from its 8 flat-priced items", () => {
    expect(SUPPORTER_BUNDLE.sku).toBe("bundle:supporter");
    expect(SUPPORTER_BUNDLE.priceCents).toBe(computeBundlePriceCents(8));
    expect(SUPPORTER_BUNDLE.priceCents).toBe(599);
  });

  it("references exactly 8 distinct, real skus", () => {
    expect(SUPPORTER_BUNDLE.skus).toHaveLength(8);
    expect(new Set(SUPPORTER_BUNDLE.skus).size).toBe(8);
    const catalogSkus = new Set(CATALOG_ITEMS.map((i) => i.sku));
    for (const sku of SUPPORTER_BUNDLE.skus) {
      expect(catalogSkus.has(sku)).toBe(true);
    }
  });

  it("spans every one of the original 7 categories (predates the theme category — never touches it)", () => {
    const categoriesRepresented = new Set(
      SUPPORTER_BUNDLE.skus.map((sku) => CATALOG_ITEMS.find((i) => i.sku === sku)!.category)
    );
    expect(categoriesRepresented.size).toBe(7);
    expect(categoriesRepresented.has("theme")).toBe(false);
    for (const category of STORE_CATEGORIES.filter((c) => c !== "theme")) {
      expect(categoriesRepresented.has(category)).toBe(true);
    }
  });

  it("is weighted toward epic/mythic/apex", () => {
    const rarities = SUPPORTER_BUNDLE.skus.map((sku) => CATALOG_ITEMS.find((i) => i.sku === sku)!.rarity);
    for (const r of rarities) expect(["epic", "mythic", "apex"]).toContain(r);
  });
});

// The Sept 2026 theme-category addition: 30 of the 38 table themes
// (app/lib/themeStore.ts) become purchasable, priced flat like every other
// item, with a bundle covering all 30. The 8 that stay free forever never
// get a catalog entry here at all — see themeBoutique.test.ts for the
// cross-check against themeStore.ts's own `unlock` field.
describe("THEME_ITEMS (the Sept 2026 theme category)", () => {
  it("has exactly 30 items, every one flat-priced and well-formed", () => {
    expect(THEME_ITEMS).toHaveLength(30);
    for (const item of THEME_ITEMS) {
      expect(item.category).toBe("theme");
      expect(item.sku).toBe(`theme:${item.id}`);
      expect(item.priceCents).toBe(SINGLE_ITEM_PRICE_CENTS);
      expect(item.rarity).toBeDefined();
    }
  });

  it("every id is unique", () => {
    const ids = THEME_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never includes one of the 8 always-free theme ids", () => {
    const alwaysFree = ["midnight", "daylight", "casino", "pastel", "noir", "sakura", "ember", "lagoon"];
    const themeIds = new Set(THEME_ITEMS.map((i) => i.id));
    for (const id of alwaysFree) expect(themeIds.has(id)).toBe(false);
  });
});

describe("the Everything Bundle (top-tier anchor)", () => {
  it("its .skus length equals the total individual item count across every category, including theme", () => {
    expect(EVERYTHING_BUNDLE.sku).toBe("bundle:everything");
    expect(EVERYTHING_BUNDLE.skus).toHaveLength(135);
    expect(EVERYTHING_BUNDLE.skus).toHaveLength(CATALOG_ITEMS.length);
  });

  it("contains every single item sku across all 8 categories, with no duplicates", () => {
    const catalogSkus = new Set(CATALOG_ITEMS.map((i) => i.sku));
    expect(new Set(EVERYTHING_BUNDLE.skus)).toEqual(catalogSkus);
    expect(new Set(EVERYTHING_BUNDLE.skus).size).toBe(EVERYTHING_BUNDLE.skus.length);
  });

  it("never includes another bundle's own wrapper sku (only real items)", () => {
    for (const sku of EVERYTHING_BUNDLE.skus) expect(sku.startsWith("bundle:")).toBe(false);
  });

  it("price is a fixed $99.99 anchor, not derived via computeBundlePriceCents (a deliberate Sept 2026 override)", () => {
    expect(EVERYTHING_BUNDLE.priceCents).toBe(EVERYTHING_BUNDLE_PRICE_CENTS);
    expect(EVERYTHING_BUNDLE.priceCents).toBe(9999);
    // The formula every other bundle uses would give $106.99 for 135 items
    // — noted here so a future reader isn't confused when this bundle's
    // price doesn't match that pipeline the way every sibling test in this
    // file expects its own bundle to.
    expect(computeBundlePriceCents(135)).toBe(10699);
    expect(EVERYTHING_BUNDLE.priceCents).not.toBe(computeBundlePriceCents(135));
  });

  it("is included in CATALOG_BUNDLES and resolves through catalogItem/findBundle", () => {
    expect(CATALOG_BUNDLES).toContainEqual(EVERYTHING_BUNDLE);
    expect(findBundle("bundle:everything")).toEqual(EVERYTHING_BUNDLE);
    expect(catalogItem("bundle:everything")).toEqual({ name: EVERYTHING_BUNDLE.name, priceCents: EVERYTHING_BUNDLE.priceCents });
  });
});
