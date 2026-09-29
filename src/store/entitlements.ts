// Books & Runs — expands a list of just-purchased skus into the full set
// of skus that should actually be GRANTED as entitlements.
//
// The bug this closes: a bundle sku (e.g. "bundle:card_back") is one
// opaque line item all the way through Checkout Session creation
// (resolveLineItems/buildCheckoutSessionParams in checkout.ts deliberately
// keep it as one sku, so Stripe's receipt shows one clean line item —
// "Card Back Bundle — $11.99" — not 15). But CATALOG_BUNDLES (catalog.ts)
// already carries each bundle's real member-item skus in its own `skus`
// list, and every unlock check in the app (cosmeticUnlocks.ts's "boutique"
// case, the avatar_emoji DB trigger, useCardUnlockContext) checks a
// SPECIFIC item sku via `ownedSkus.has(itemSkuFor(category, id))` — never
// the bundle sku. Without this expansion, granting exactly
// `metadata.skus` at webhook time (what stripe-webhook/index.ts used to
// do) left a bundle buyer with one `entitlements` row for the bundle
// wrapper sku and none of its member items: charged, but unable to equip
// anything they paid for.
//
// This is called at GRANT time (stripe-webhook, right before the
// `entitlements` upsert), never at Checkout-Session-creation time — the
// Stripe-facing line item stays exactly one bundle sku either way.
//
// Pure and framework-free like the rest of src/store/ — bundled into
// stripe-webhook the same way catalog.ts/checkout.ts are already bundled
// into create-checkout-session (see scripts/bundle-checkout-catalog.mjs).

import { CatalogBundle, CATALOG_BUNDLES } from "./catalog";

/**
 * For each input sku:
 *   - if it matches a bundle's own `.sku`, the output includes that
 *     bundle's own sku (so "Owned" still shows on the bundle card itself,
 *     and re-buying it is correctly blocked by resolveLineItems' existing
 *     already-owned check) PLUS every sku in that bundle's `.skus` member
 *     list.
 *   - a non-bundle sku (a plain item, or anything that doesn't match a
 *     known bundle — e.g. a malformed/future/unknown sku) passes through
 *     unchanged rather than throwing; an unresolvable sku is not this
 *     function's problem to reject (resolveLineItems already validated
 *     the cart before Stripe was ever involved).
 * The result is deduped (a sku a caller requested more than once, or one
 * that's both directly requested and pulled in as a bundle member, appears
 * only once) but NOT sorted — callers that care about order can sort
 * themselves.
 */
export function expandPurchasedSkus(
  skus: readonly string[],
  bundles: readonly CatalogBundle[] = CATALOG_BUNDLES
): string[] {
  const bundlesBySku = new Map<string, CatalogBundle>(bundles.map((b) => [b.sku, b]));
  const out = new Set<string>();
  for (const sku of skus) {
    const bundle = bundlesBySku.get(sku);
    if (!bundle) {
      out.add(sku);
      continue;
    }
    out.add(bundle.sku);
    for (const memberSku of bundle.skus) out.add(memberSku);
  }
  return [...out];
}
