// The Boutique store's SKU naming convention, shared by every piece that
// needs to name a purchasable item the same way — the client's unlock
// check, the Boutique page, and (server-side) the create-checkout-session/
// stripe-webhook Edge Functions and their catalog (src/store/catalog.ts).
// Framework-free on purpose (per /tmp/wave/store.md's "Native readiness"
// note) so it stays importable from src/ if that's ever useful there too,
// even though today only client-side code needs it.
//
// Format: "<category>:<itemId>" for a single item, "bundle:<bundleId>" for
// a bundle — e.g. "card_back:aurora" or "bundle:supporter". A badge/
// avatar_emoji item's id is the emoji itself, matching
// AnyCosmeticOption/PremiumEmojiOption's existing convention; every other
// category uses its catalog's own `id` string.

export type CosmeticCategory =
  | "badge"
  | "avatar_frame"
  | "title"
  | "banner"
  | "avatar_emoji"
  | "card_face"
  | "card_back";

export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = [
  "badge",
  "avatar_frame",
  "title",
  "banner",
  "avatar_emoji",
  "card_face",
  "card_back",
];

/** The stable sku for a single catalog item — never for a bundle (see
 * bundleSkuFor). */
export function itemSkuFor(category: CosmeticCategory, id: string): string {
  return `${category}:${id}`;
}

export function bundleSkuFor(bundleId: string): string {
  return `bundle:${bundleId}`;
}

export function isBundleSku(sku: string): boolean {
  return sku.startsWith("bundle:");
}

export function isCosmeticCategory(value: string): value is CosmeticCategory {
  return (COSMETIC_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Splits a sku back into its parts. For an item sku this is
 * `{ category, id }`; for a bundle sku (or anything else that doesn't
 * parse as "<known category>:<id>") `category` is null and `id` is
 * whatever came after the first colon (or the whole string).
 */
export function parseSku(sku: string): { category: CosmeticCategory | null; id: string } {
  const colon = sku.indexOf(":");
  if (colon === -1) return { category: null, id: sku };
  const prefix = sku.slice(0, colon);
  const rest = sku.slice(colon + 1);
  return isCosmeticCategory(prefix) ? { category: prefix, id: rest } : { category: null, id: rest };
}
