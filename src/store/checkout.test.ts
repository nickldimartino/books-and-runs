import { describe, expect, it } from "vitest";
import { CatalogItem } from "./catalog";
import {
  buildCheckoutSessionParams,
  resolveLineItems,
  TERMS_ACCEPTANCE_MESSAGE,
  toStripeFormBody,
} from "./checkout";

const CATALOG: Record<string, CatalogItem> = {
  "badge:🎩": { name: "Top Hat badge", priceCents: 249 },
  "card_back:aurora": { name: "Aurora card back", priceCents: 499 },
  "bundle:supporter": { name: "Supporter Pack", priceCents: 2499 },
};

describe("resolveLineItems", () => {
  it("resolves known skus to their catalog price and name", () => {
    const result = resolveLineItems(["badge:🎩", "card_back:aurora"], new Set(), CATALOG);
    expect(result).toEqual({
      ok: true,
      items: [
        { sku: "badge:🎩", name: "Top Hat badge", priceCents: 249 },
        { sku: "card_back:aurora", name: "Aurora card back", priceCents: 499 },
      ],
    });
  });

  it("rejects an empty cart", () => {
    expect(resolveLineItems([], new Set(), CATALOG)).toEqual({ ok: false, error: "empty_cart" });
  });

  it("rejects a sku not in the catalog — never invents a price", () => {
    expect(resolveLineItems(["badge:not-real"], new Set(), CATALOG)).toEqual({
      ok: false,
      error: "unknown_sku",
      sku: "badge:not-real",
    });
  });

  it("rejects a sku the caller already owns", () => {
    expect(resolveLineItems(["badge:🎩"], new Set(["badge:🎩"]), CATALOG)).toEqual({
      ok: false,
      error: "already_owned",
      sku: "badge:🎩",
    });
  });

  it("dedupes a repeated sku in the same cart", () => {
    const result = resolveLineItems(["badge:🎩", "badge:🎩"], new Set(), CATALOG);
    expect(result.ok).toBe(true);
    expect(result.ok && result.items).toHaveLength(1);
  });

  it("never trusts a price/name on the input — only the catalog's own values ever appear", () => {
    // resolveLineItems takes only skus (strings), so there is no code path
    // by which a caller could smuggle a price through at all — this test
    // documents that contract rather than exercising a code path.
    const result = resolveLineItems(["card_back:aurora"], new Set(), CATALOG);
    expect(result.ok && result.items[0].priceCents).toBe(CATALOG["card_back:aurora"].priceCents);
  });
});

describe("buildCheckoutSessionParams", () => {
  const base = { userId: "user-123", siteUrl: "https://books-and-runs.vercel.app", catalog: CATALOG };

  it("builds the exact session params for a single-item cart", () => {
    const result = buildCheckoutSessionParams({ ...base, skus: ["badge:🎩"] });
    expect(result).toEqual({
      ok: true,
      params: {
        mode: "payment",
        client_reference_id: "user-123",
        metadata: { user_id: "user-123", skus: "badge:🎩" },
        success_url: "https://books-and-runs.vercel.app/boutique?purchase=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://books-and-runs.vercel.app/boutique?purchase=cancelled",
        consent_collection: { terms_of_service: "required" },
        custom_text: { terms_of_service_acceptance: { message: TERMS_ACCEPTANCE_MESSAGE } },
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "usd", unit_amount: 249, product_data: { name: "Top Hat badge" } },
          },
        ],
      },
    });
  });

  it("supports a multi-item cart, one line_item per sku", () => {
    const result = buildCheckoutSessionParams({ ...base, skus: ["badge:🎩", "card_back:aurora"] });
    expect(result.ok).toBe(true);
    expect(result.ok && result.params.line_items).toHaveLength(2);
    expect(result.ok && result.params.metadata.skus).toBe("badge:🎩,card_back:aurora");
  });

  it("strips a trailing slash from siteUrl before building the redirect URLs", () => {
    const result = buildCheckoutSessionParams({ ...base, siteUrl: "https://books-and-runs.vercel.app/", skus: ["badge:🎩"] });
    expect(result.ok && result.params.success_url.startsWith("https://books-and-runs.vercel.app/boutique")).toBe(true);
  });

  it("returns 409 for an already-owned sku, 400 for an unknown one", () => {
    expect(buildCheckoutSessionParams({ ...base, skus: ["badge:🎩"], ownedSkus: new Set(["badge:🎩"]) })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(buildCheckoutSessionParams({ ...base, skus: ["nope:nope"] })).toMatchObject({ ok: false, status: 400 });
    expect(buildCheckoutSessionParams({ ...base, skus: [] })).toMatchObject({ ok: false, status: 400 });
  });

  it("omits automatic_tax unless explicitly requested", () => {
    const withoutTax = buildCheckoutSessionParams({ ...base, skus: ["badge:🎩"] });
    expect(withoutTax.ok && withoutTax.params.automatic_tax).toBeUndefined();
    const withTax = buildCheckoutSessionParams({ ...base, skus: ["badge:🎩"], automaticTax: true });
    expect(withTax.ok && withTax.params.automatic_tax).toEqual({ enabled: "true" });
  });
});

describe("toStripeFormBody", () => {
  it("flattens nested objects and arrays into Stripe's bracket-notation form fields", () => {
    const body = toStripeFormBody({
      mode: "payment",
      metadata: { user_id: "u1" },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 249 } }],
    });
    expect(body.get("mode")).toBe("payment");
    expect(body.get("metadata[user_id]")).toBe("u1");
    expect(body.get("line_items[0][quantity]")).toBe("1");
    expect(body.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("249");
  });

  it("round-trips a full session params object end to end", () => {
    const result = buildCheckoutSessionParams({
      userId: "user-123",
      siteUrl: "https://books-and-runs.vercel.app",
      skus: ["badge:🎩"],
      catalog: CATALOG,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = toStripeFormBody(result.params);
    expect(body.get("client_reference_id")).toBe("user-123");
    expect(body.get("consent_collection[terms_of_service]")).toBe("required");
    expect(body.get("custom_text[terms_of_service_acceptance][message]")).toBe(TERMS_ACCEPTANCE_MESSAGE);
    expect(body.get("success_url")).toContain("{CHECKOUT_SESSION_ID}");
  });

  it("omits null/undefined values entirely rather than sending empty fields", () => {
    const body = toStripeFormBody({ a: 1, b: undefined, c: null });
    expect([...body.keys()].sort()).toEqual(["a"]);
  });
});
