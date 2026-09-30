// Books & Runs — pure request-building for the `create-checkout-session`
// Edge Function. Deliberately split out of the function's own index.ts
// (which owns the actual auth/DB/fetch side effects) so the part that
// matters most for a real-money feature — exactly what gets sent to
// Stripe, and exactly what a bad request looks like — is a plain function
// vitest can cover with zero network/DB mocking. Framework-free like the
// rest of src/; bundled into the function the same way bundle-mp-engine.mjs
// bundles the game engine (see scripts/bundle-checkout-catalog.mjs).
//
// NEVER trust a client-submitted price: every price/name here comes from
// `catalog` (src/store/catalog.ts), keyed by sku, never from the request
// body.

import { CatalogItem, CATALOG } from "./catalog";

export interface ResolvedLineItem {
  sku: string;
  name: string;
  priceCents: number;
}

export type ResolveLineItemsResult =
  | { ok: true; items: ResolvedLineItem[] }
  | { ok: false; error: "empty_cart" | "unknown_sku" | "already_owned"; sku?: string };

/**
 * Validates a requested cart against the catalog (unknown skus) and the
 * caller's existing entitlements (already owned) before anything is ever
 * sent to Stripe. Duplicate skus in the same request are silently
 * deduplicated — a client bug, not something worth failing the whole
 * checkout over, and entitlements are unique per (user, sku) anyway.
 */
export function resolveLineItems(
  skus: readonly string[],
  ownedSkus: ReadonlySet<string> = new Set(),
  catalog: Record<string, CatalogItem> = CATALOG
): ResolveLineItemsResult {
  const unique = [...new Set(skus)];
  if (unique.length === 0) return { ok: false, error: "empty_cart" };

  const items: ResolvedLineItem[] = [];
  for (const sku of unique) {
    if (ownedSkus.has(sku)) return { ok: false, error: "already_owned", sku };
    const entry = catalog[sku];
    if (!entry || !Number.isInteger(entry.priceCents) || entry.priceCents <= 0) {
      return { ok: false, error: "unknown_sku", sku };
    }
    items.push({ sku, name: entry.name, priceCents: entry.priceCents });
  }
  return { ok: true, items };
}

/** Nested shape mirroring Stripe's Checkout Session creation params —
 * built as a plain object first (easy to assert on in tests), flattened to
 * a form body separately by `toStripeFormBody`. */
export interface CheckoutSessionParams {
  mode: "payment";
  client_reference_id: string;
  metadata: { user_id: string; skus: string; gift_recipient_id?: string };
  success_url: string;
  cancel_url: string;
  consent_collection: { terms_of_service: "required" };
  custom_text: { terms_of_service_acceptance: { message: string } };
  line_items: {
    quantity: 1;
    price_data: {
      currency: "usd";
      unit_amount: number;
      product_data: { name: string };
    };
  }[];
  automatic_tax?: { enabled: "true" | "false" };
}

export const TERMS_ACCEPTANCE_MESSAGE =
  "I agree to the Terms of Service — digital items are delivered immediately and the purchase is final.";

export interface BuildCheckoutSessionInput {
  userId: string;
  skus: readonly string[];
  ownedSkus?: ReadonlySet<string>;
  catalog?: Record<string, CatalogItem>;
  /** Origin only, no trailing slash, e.g. "https://books-and-runs.vercel.app". */
  siteUrl: string;
  automaticTax?: boolean;
  /**
   * Present only for a gift purchase — the friend who will own the item(s),
   * never the payer. The caller (create-checkout-session/index.ts) has
   * already verified `giftRecipientId` is an accepted friend and doesn't
   * already own the sku before this is ever called; this function only
   * enforces the one product rule that's really about cart *shape*: a gift
   * is always exactly one sku, never a multi-item cart, so `ownedSkus`
   * should be passed as an empty set for a gift (the payer's own ownership
   * is irrelevant — they're not the one receiving it).
   */
  giftRecipientId?: string;
}

export type BuildCheckoutSessionResult =
  | { ok: true; params: CheckoutSessionParams }
  | { ok: false; status: 400 | 409; error: string };

/** Builds the exact Checkout Session creation params for a validated cart.
 * Returns a 409 for an already-owned sku (a real conflict, not a bad
 * request) and 400 for anything else invalid. */
export function buildCheckoutSessionParams(input: BuildCheckoutSessionInput): BuildCheckoutSessionResult {
  if (input.giftRecipientId && new Set(input.skus).size !== 1) {
    return { ok: false, status: 400, error: "gift only one item at a time" };
  }

  const resolved = resolveLineItems(input.skus, input.ownedSkus ?? new Set(), input.catalog ?? CATALOG);
  if (!resolved.ok) {
    if (resolved.error === "empty_cart") return { ok: false, status: 400, error: "no skus in cart" };
    if (resolved.error === "already_owned") return { ok: false, status: 409, error: `already own ${resolved.sku}` };
    return { ok: false, status: 400, error: `unknown sku: ${resolved.sku}` };
  }

  const site = input.siteUrl.replace(/\/+$/, "");
  const params: CheckoutSessionParams = {
    mode: "payment",
    client_reference_id: input.userId,
    metadata: { user_id: input.userId, skus: resolved.items.map((i) => i.sku).join(",") },
    success_url: `${site}/boutique?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/boutique?purchase=cancelled`,
    consent_collection: { terms_of_service: "required" },
    custom_text: { terms_of_service_acceptance: { message: TERMS_ACCEPTANCE_MESSAGE } },
    line_items: resolved.items.map((item) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: item.priceCents,
        product_data: { name: item.name },
      },
    })),
  };
  if (input.giftRecipientId) params.metadata.gift_recipient_id = input.giftRecipientId;
  if (input.automaticTax) params.automatic_tax = { enabled: "true" };
  return { ok: true, params };
}

/**
 * Flattens a nested params object into Stripe's bracket-notation
 * form-encoded body (`line_items[0][price_data][currency]=usd`, …) — the
 * same shape Stripe's own client libraries produce, built by hand here
 * since this repo calls Stripe's REST API directly rather than pulling in
 * their SDK (see stripe-webhook/index.ts's own doc for why). Key order is
 * stable (object insertion order / array index), so the output is
 * deterministic and diff-friendly in tests.
 */
export function toStripeFormBody(value: unknown, prefix = ""): URLSearchParams {
  const params = new URLSearchParams();
  appendFormEntries(params, value, prefix);
  return params;
}

function appendFormEntries(params: URLSearchParams, value: unknown, prefix: string): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => appendFormEntries(params, item, `${prefix}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      appendFormEntries(params, val, prefix ? `${prefix}[${key}]` : key);
    }
    return;
  }
  params.append(prefix, String(value));
}
