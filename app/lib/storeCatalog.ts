// A thin, client-side rendering adapter over the authoritative catalog
// (src/store/catalog.ts, owned by a different agent in this wave). This
// file is NOT catalog content — it never invents a price or a name — it
// only shapes what's actually in the catalog for the Boutique page's own
// display needs:
//
//   - category/itemId: read straight off each CatalogItem's own
//     `category`/`id` fields when present (the real 105-item catalog sets
//     these), else parsed out of the sku string itself (storeSku.ts's own
//     "<category>:<id>" contract) — a fallback that keeps this working
//     even against a leaner stub that only sets `name`/`priceCents`.
//   - rarity: read off CatalogItem's own `rarity` field when present (the
//     real catalog's single source of truth for it — see catalog.ts's own
//     header on the source-of-truth split). Falls back to cross-
//     referencing each category's own existing option list
//     (avatarPresets.ts, profileCosmetics.ts, bannerPresets.ts,
//     cardFaceStore.ts, cardBackStore.ts) by item id — the same source
//     cosmeticRarity.ts's defaultRarityForUnlock already treats as
//     authoritative elsewhere in the app — only for a stub-era item that
//     predates the catalog carrying its own rarity, defaulting to
//     "common" as a last resort.
//   - a bundle's included items: read off catalog.ts's own `findBundle`
//     export when available (the real catalog exports the exact skus list
//     for every bundle, including the hand-picked "bundle:supporter"
//     pack) — falling back to "every item sku in CATALOG whose category
//     matches" for a plain "bundle:<category>" sku when that richer export
//     isn't there (true by construction per store.md's bundle rule: "all
//     15 of that category's items"), and to an empty list only for a
//     bundle this adapter has no way to resolve at all (e.g. a
//     stub-era "bundle:supporter" with no items export yet).

import { CARD_FACES } from "./cardFaceStore";
import { SIGNATURE_CARD_BACKS } from "./cardBackStore";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "./profileCosmetics";
import { BANNER_OPTIONS } from "./bannerPresets";
import { PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";
import { CosmeticRarity, defaultRarityForUnlock } from "./cosmeticRarity";
import { CosmeticCategory, isBundleSku, isCosmeticCategory, parseSku } from "./storeSku";
import * as Catalog from "@/store/catalog";

const { CATALOG } = Catalog;
type CatalogItemShape = Catalog.CatalogItem;

export interface StoreItem {
  sku: string;
  category: CosmeticCategory;
  itemId: string;
  name: string;
  priceCents: number;
  rarity: CosmeticRarity;
}

export interface StoreBundle {
  sku: string;
  name: string;
  priceCents: number;
  /** Skus of the items this bundle includes — see this file's header for
   * where this comes from. Empty only when the catalog gives this adapter
   * no way to resolve it (a bare-minimum stub's "bundle:supporter"). */
  includes: string[];
  kind: "category" | "supporter" | "everything" | "other";
  /** Present only for a "category" bundle. */
  category?: CosmeticCategory;
}

function rarityFromExistingCatalogs(category: CosmeticCategory, itemId: string): CosmeticRarity {
  switch (category) {
    case "badge": {
      const o = PREMIUM_EMOJI_OPTIONS.find((p) => p.emoji === itemId);
      return o?.rarity ?? (o ? defaultRarityForUnlock(o.unlock) : "common");
    }
    case "avatar_frame": {
      const o = AVATAR_FRAME_OPTIONS.find((f) => f.id === itemId);
      return o?.rarity ?? (o ? defaultRarityForUnlock(o.unlock) : "common");
    }
    case "title": {
      const o = TITLE_OPTIONS.find((f) => f.id === itemId);
      return o?.rarity ?? (o ? defaultRarityForUnlock(o.unlock) : "common");
    }
    case "banner": {
      const o = BANNER_OPTIONS.find((f) => f.id === itemId);
      return o?.rarity ?? (o ? defaultRarityForUnlock(o.unlock) : "common");
    }
    case "card_face": {
      const o = CARD_FACES.find((f) => f.id === itemId);
      return o?.rarity ?? (o ? defaultRarityForUnlock(o.unlock) : "common");
    }
    case "card_back": {
      const o = SIGNATURE_CARD_BACKS.find((f) => f.id === itemId);
      return o?.rarity ?? (o ? defaultRarityForUnlock(o.unlock) : "common");
    }
    case "avatar_emoji":
      // No pre-existing purchasable-avatar-emoji option list to fall back
      // to (today's free EMOJI_OPTIONS are a different thing) — only
      // reached when the catalog entry itself has no `rarity` either.
      return "common";
    case "theme":
      // THEME_ITEMS (catalog.ts) always sets its own `rarity` (see
      // mkItem) — this branch exists only to satisfy CosmeticCategory's
      // exhaustive switch, never actually reached in practice.
      return "common";
  }
}

function rarityFor(entry: CatalogItemShape, category: CosmeticCategory, itemId: string): CosmeticRarity {
  const own = entry.rarity as CosmeticRarity | undefined;
  return own ?? rarityFromExistingCatalogs(category, itemId);
}

/** Every single purchasable item in the catalog (never a bundle) — the
 * Boutique grid's own data source. */
export function listStoreItems(): StoreItem[] {
  const items: StoreItem[] = [];
  for (const [sku, entry] of Object.entries(CATALOG) as [string, CatalogItemShape][]) {
    if (isBundleSku(sku)) continue;
    const category = (entry.category as CosmeticCategory | undefined) ?? parseSku(sku).category ?? undefined;
    const itemId = entry.id ?? parseSku(sku).id;
    if (!category) continue; // unrecognized prefix — skip rather than guess
    items.push({
      sku,
      category,
      itemId,
      name: entry.name,
      priceCents: entry.priceCents,
      rarity: rarityFor(entry, category, itemId),
    });
  }
  return items;
}

/** `findBundle`'s skus list when catalog.ts exports it (the real catalog
 * does) — undefined for a leaner stub that doesn't. */
function catalogBundleSkus(sku: string): readonly string[] | undefined {
  const find = (Catalog as { findBundle?: (sku: string) => { skus?: readonly string[] } | undefined }).findBundle;
  return find?.(sku)?.skus;
}

/** Every bundle in the catalog, "bundle:everything" first (the top-tier
 * anchor), then "bundle:supporter" (the original hero pack — see
 * store.md's "positioned as the top anchor"), then category bundles. */
export function listBundles(): StoreBundle[] {
  const itemsByCategory = new Map<CosmeticCategory, string[]>();
  for (const item of listStoreItems()) {
    if (!itemsByCategory.has(item.category)) itemsByCategory.set(item.category, []);
    itemsByCategory.get(item.category)!.push(item.sku);
  }

  const bundles: StoreBundle[] = [];
  for (const [sku, entry] of Object.entries(CATALOG) as [string, CatalogItemShape][]) {
    if (!isBundleSku(sku)) continue;
    const bundleId = sku.slice("bundle:".length);
    const fromCatalog = catalogBundleSkus(sku);
    if (bundleId === "everything") {
      bundles.push({ sku, name: entry.name, priceCents: entry.priceCents, includes: [...(fromCatalog ?? [])], kind: "everything" });
      continue;
    }
    if (bundleId === "supporter") {
      bundles.push({ sku, name: entry.name, priceCents: entry.priceCents, includes: [...(fromCatalog ?? [])], kind: "supporter" });
      continue;
    }
    if (!isCosmeticCategory(bundleId)) {
      bundles.push({ sku, name: entry.name, priceCents: entry.priceCents, includes: [...(fromCatalog ?? [])], kind: "other" });
      continue;
    }
    bundles.push({
      sku,
      name: entry.name,
      priceCents: entry.priceCents,
      includes: [...(fromCatalog ?? itemsByCategory.get(bundleId) ?? [])],
      kind: "category",
      category: bundleId,
    });
  }
  const rank: Record<StoreBundle["kind"], number> = { everything: 0, supporter: 1, category: 2, other: 2 };
  return bundles.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export function findStoreItem(sku: string): StoreItem | undefined {
  return listStoreItems().find((i) => i.sku === sku);
}

export function findBundle(sku: string): StoreBundle | undefined {
  return listBundles().find((b) => b.sku === sku);
}

/** `$4.99`-style formatting for a cents value — the currency itself is
 * always USD (Stripe handles FX; see store.md), but routing the digits
 * through Intl.NumberFormat still gets locale-correct grouping/decimal
 * conventions (e.g. "4,99 $US" in French) instead of a hardcoded
 * "$" + toFixed(2). */
export function formatPriceCents(cents: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);
  } catch {
    return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
  }
}

/** Sum of a bundle's included items' individual prices — the "before"
 * price a discount badge compares against. Null (no badge shown) when the
 * bundle's includes list is empty (a bundle this adapter can't resolve —
 * see this file's header). */
export function bundleSavingsPercent(bundle: StoreBundle): number | null {
  if (bundle.includes.length === 0) return null;
  const items = listStoreItems();
  const sum = bundle.includes.reduce((total, sku) => total + (items.find((i) => i.sku === sku)?.priceCents ?? 0), 0);
  if (sum <= 0) return null;
  return Math.round((1 - bundle.priceCents / sum) * 100);
}
