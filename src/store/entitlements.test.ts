import { describe, expect, it } from "vitest";
import { CatalogBundle } from "./catalog";
import { expandPurchasedSkus } from "./entitlements";

const BUNDLES: readonly CatalogBundle[] = [
  {
    bundleId: "card_back",
    sku: "bundle:card_back",
    name: "Card Back Bundle",
    priceCents: 1199,
    skus: ["card_back:static", "card_back:brushed", "card_back:goldleaf"],
  },
  {
    bundleId: "supporter",
    sku: "bundle:supporter",
    name: "Supporter Pack",
    priceCents: 599,
    skus: ["badge:🔮", "card_back:goldleaf"],
  },
];

describe("expandPurchasedSkus", () => {
  it("expands a bundle sku to itself plus every member sku", () => {
    expect(expandPurchasedSkus(["bundle:card_back"], BUNDLES).sort()).toEqual(
      ["bundle:card_back", "card_back:static", "card_back:brushed", "card_back:goldleaf"].sort()
    );
  });

  it("passes a plain item sku through unchanged", () => {
    expect(expandPurchasedSkus(["badge:🎩"], BUNDLES)).toEqual(["badge:🎩"]);
  });

  it("passes an unknown/malformed sku through unchanged rather than throwing", () => {
    expect(expandPurchasedSkus(["not-a-real-sku", "bundle:does-not-exist"], BUNDLES)).toEqual([
      "not-a-real-sku",
      "bundle:does-not-exist",
    ]);
  });

  it("handles mixed input (bundle + plain items) in one call", () => {
    const result = expandPurchasedSkus(["bundle:card_back", "title:night_owl"], BUNDLES);
    expect(new Set(result)).toEqual(
      new Set(["bundle:card_back", "card_back:static", "card_back:brushed", "card_back:goldleaf", "title:night_owl"])
    );
  });

  it("dedupes when two requested bundles share a member sku", () => {
    const result = expandPurchasedSkus(["bundle:card_back", "bundle:supporter"], BUNDLES);
    // card_back:goldleaf is a member of both bundles — appears once.
    expect(result.filter((s) => s === "card_back:goldleaf")).toHaveLength(1);
    expect(new Set(result)).toEqual(
      new Set([
        "bundle:card_back",
        "card_back:static",
        "card_back:brushed",
        "card_back:goldleaf",
        "bundle:supporter",
        "badge:🔮",
      ])
    );
  });

  it("dedupes a directly-requested sku that's also pulled in as a bundle member", () => {
    const result = expandPurchasedSkus(["bundle:card_back", "card_back:static"], BUNDLES);
    expect(result.filter((s) => s === "card_back:static")).toHaveLength(1);
  });

  it("defaults to the real CATALOG_BUNDLES when no bundles arg is passed", () => {
    const result = expandPurchasedSkus(["bundle:supporter"]);
    expect(result).toContain("bundle:supporter");
    expect(result.length).toBeGreaterThan(1);
  });

  it("empty input yields empty output", () => {
    expect(expandPurchasedSkus([], BUNDLES)).toEqual([]);
  });
});
