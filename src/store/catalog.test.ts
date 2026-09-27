import { describe, expect, it } from "vitest";
import {
  CATALOG,
  CATALOG_BUNDLES,
  CATALOG_ITEMS,
  CATEGORY_BUNDLES,
  catalogItem,
  ITEMS_BY_CATEGORY,
  PRICE_CENTS_BY_RARITY,
  roundToCharmCents,
  STORE_CATEGORIES,
  SUPPORTER_BUNDLE,
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

  it("PRICE_CENTS_BY_RARITY is every positive integer, strictly increasing with rarity", () => {
    const values = Object.values(PRICE_CENTS_BY_RARITY);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

// The store.md-mandated catalog expansion: 7 categories × 15 items = 105
// purchasable items, plus 7 category bundles + 1 hero bundle = 113 total
// skus in CATALOG.
describe("the real 105-item catalog", () => {
  it("has exactly 15 items in every one of the 7 categories", () => {
    for (const category of STORE_CATEGORIES) {
      expect(ITEMS_BY_CATEGORY[category]).toHaveLength(15);
    }
    expect(CATALOG_ITEMS).toHaveLength(105);
  });

  it("every item's priceCents equals PRICE_CENTS_BY_RARITY[item.rarity] — never hand-entered", () => {
    for (const item of CATALOG_ITEMS) {
      expect(item.rarity).toBeDefined();
      expect(item.priceCents).toBe(PRICE_CENTS_BY_RARITY[item.rarity!]);
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
  it("each of the 7 category bundles grants exactly that category's 15 skus", () => {
    for (const bundle of CATEGORY_BUNDLES) {
      const category = bundle.bundleId;
      expect(bundle.sku).toBe(`bundle:${category}`);
      expect(bundle.skus).toEqual(ITEMS_BY_CATEGORY[category as keyof typeof ITEMS_BY_CATEGORY].map((i) => i.sku));
    }
    expect(CATEGORY_BUNDLES).toHaveLength(7);
  });

  it("each bundle's priceCents is round-to-charm(0.72 × the sum of its 15 items' prices) — recomputed, not snapshotted", () => {
    for (const bundle of CATEGORY_BUNDLES) {
      const items = ITEMS_BY_CATEGORY[bundle.bundleId as keyof typeof ITEMS_BY_CATEGORY];
      const sum = items.reduce((total, i) => total + i.priceCents, 0);
      expect(bundle.priceCents).toBe(roundToCharmCents(sum * 0.72));
    }
  });

  it("every category bundle lands on the same price, since every category has the identical rarity distribution", () => {
    const prices = new Set(CATEGORY_BUNDLES.map((b) => b.priceCents));
    expect(prices.size).toBe(1);
    expect([...prices][0]).toBe(6749);
  });
});

describe("the Supporter Pack hero bundle", () => {
  it("is a flat $24.99 (2499 cents), not derived from its items' prices", () => {
    expect(SUPPORTER_BUNDLE.sku).toBe("bundle:supporter");
    expect(SUPPORTER_BUNDLE.priceCents).toBe(2499);
  });

  it("references exactly 8 distinct, real skus", () => {
    expect(SUPPORTER_BUNDLE.skus).toHaveLength(8);
    expect(new Set(SUPPORTER_BUNDLE.skus).size).toBe(8);
    const catalogSkus = new Set(CATALOG_ITEMS.map((i) => i.sku));
    for (const sku of SUPPORTER_BUNDLE.skus) {
      expect(catalogSkus.has(sku)).toBe(true);
    }
  });

  it("spans every one of the 7 categories", () => {
    const categoriesRepresented = new Set(
      SUPPORTER_BUNDLE.skus.map((sku) => CATALOG_ITEMS.find((i) => i.sku === sku)!.category)
    );
    expect(categoriesRepresented.size).toBe(7);
    for (const category of STORE_CATEGORIES) expect(categoriesRepresented.has(category)).toBe(true);
  });

  it("is weighted toward epic/mythic/apex", () => {
    const rarities = SUPPORTER_BUNDLE.skus.map((sku) => CATALOG_ITEMS.find((i) => i.sku === sku)!.rarity);
    for (const r of rarities) expect(["epic", "mythic", "apex"]).toContain(r);
  });
});
