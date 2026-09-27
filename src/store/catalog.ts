// Books & Runs — the boutique store's authoritative catalog: every
// purchasable sku's display name and price, in one dependency-free,
// framework-free file (same "pure src/ module" convention as the rest of
// this directory). This is the ONLY place a price lives — the
// `create-checkout-session` Edge Function bundles this exact file in
// (scripts/bundle-checkout-catalog.mjs, same idea as bundle-mp-engine.mjs)
// and never trusts a client-submitted price.
//
// This is the REAL catalog (105 boutique items — 7 categories × 15 — plus 7
// per-category bundles and the "bundle:supporter" hero pack), replacing the
// 2-item placeholder this file started as. See /tmp/wave/store.md for the
// rarity/pricing ladder and the bundle rules this file implements.
//
// Source of truth split: each category's own presentation-layer file
// (app/lib/avatarPresets.ts's PREMIUM_EMOJI_OPTIONS + new
// BOUTIQUE_AVATAR_EMOJI_OPTIONS, app/lib/profileCosmetics.ts's
// AVATAR_FRAME_OPTIONS + TITLE_OPTIONS, app/lib/bannerPresets.ts's
// BANNER_OPTIONS, app/lib/cardFaceStore.ts's CARD_FACES,
// app/lib/cardBackStore.ts's SIGNATURE_CARD_BACKS) owns each item's own
// art/rendering and its `rarity`; THIS file is the money-layer source of
// truth for its sku and price, kept in sync with those by hand (see
// boutiqueCatalog.test.tsx and catalog.test.ts, which cross-check counts,
// rarity distribution, and price for every sku here).
//
// sku format: see app/lib/storeSku.ts ("<category>:<itemId>", or
// "bundle:<bundleId>"). Price is in USD cents — Stripe's own unit, and
// what create-checkout-session passes straight through to `price_data.
// unit_amount`.

export type CosmeticCategory =
  | "badge"
  | "avatar_frame"
  | "title"
  | "banner"
  | "avatar_emoji"
  | "card_face"
  | "card_back";

export const STORE_CATEGORIES: readonly CosmeticCategory[] = [
  "badge",
  "avatar_frame",
  "title",
  "banner",
  "avatar_emoji",
  "card_face",
  "card_back",
];

export type CosmeticRarity = "common" | "uncommon" | "rare" | "epic" | "mythic" | "apex";

/** USD cents per rarity tier, charm-rounded — see store.md's pricing
 * ladder. The single source of truth every item's price below is computed
 * from (never hand-entered per item — see `mkItem`) and that
 * catalog.test.ts asserts every item still matches. */
export const PRICE_CENTS_BY_RARITY: Record<CosmeticRarity, number> = {
  common: 249,
  uncommon: 349,
  rare: 499,
  epic: 699,
  mythic: 1099,
  apex: 1499,
};

export interface CatalogItem {
  /** English display name — becomes Stripe's `product_data.name`. Stripe's
   * own checkout UI chrome is English regardless of the buyer's locale, so
   * this one string never needs to go through t(). */
  name: string;
  priceCents: number;
  /** Present on every real catalog entry below — optional only so a
   * hand-rolled test fixture elsewhere (checkout.test.ts's own inline
   * `CatalogItem` literals, predating this file's real data) that supplies
   * just `{ name, priceCents }` keeps compiling unchanged. */
  category?: CosmeticCategory;
  id?: string;
  rarity?: CosmeticRarity;
  sku?: string;
}

function mkItem(category: CosmeticCategory, id: string, name: string, rarity: CosmeticRarity): CatalogItem {
  return { category, id, rarity, sku: `${category}:${id}`, name, priceCents: PRICE_CENTS_BY_RARITY[rarity] };
}

// ---------------------------------------------------------------------------
// badge — app/lib/avatarPresets.ts's PREMIUM_EMOJI_OPTIONS boutique subset.
// id is the emoji itself, matching AnyCosmeticOption's existing convention.
// ---------------------------------------------------------------------------
export const BADGE_ITEMS: readonly CatalogItem[] = [
  mkItem("badge", "🎻", "Violin Badge", "common"),
  mkItem("badge", "🗝️", "Key Badge", "common"),
  mkItem("badge", "🎩", "Top Hat Badge", "uncommon"),
  mkItem("badge", "🕶️", "Sunglasses Badge", "uncommon"),
  mkItem("badge", "🥃", "Nightcap Badge", "uncommon"),
  mkItem("badge", "🧨", "Dynamite Badge", "rare"),
  mkItem("badge", "🧿", "Evil Eye Badge", "rare"),
  mkItem("badge", "🏹", "Bow Badge", "rare"),
  mkItem("badge", "🦉", "Night Owl Badge", "rare"),
  mkItem("badge", "🛸", "UFO Badge", "epic"),
  mkItem("badge", "🎰", "Jackpot Badge", "epic"),
  mkItem("badge", "🀄", "Red Dragon Badge", "epic"),
  mkItem("badge", "🎆", "Fireworks Badge", "mythic"),
  mkItem("badge", "🎴", "Hanafuda Badge", "mythic"),
  mkItem("badge", "🔮", "Crystal Ball Badge", "apex"),
];

// ---------------------------------------------------------------------------
// avatar_frame — app/lib/profileCosmetics.ts's AVATAR_FRAME_OPTIONS boutique
// subset.
// ---------------------------------------------------------------------------
export const AVATAR_FRAME_ITEMS: readonly CatalogItem[] = [
  mkItem("avatar_frame", "ashwood", "Ashwood Frame", "common"),
  mkItem("avatar_frame", "copperline", "Copperline Frame", "common"),
  mkItem("avatar_frame", "jade", "Jade Frame", "uncommon"),
  mkItem("avatar_frame", "duskgrove", "Dusk Grove Frame", "uncommon"),
  mkItem("avatar_frame", "seaglass", "Sea Glass Frame", "uncommon"),
  mkItem("avatar_frame", "opal", "Opal Frame", "rare"),
  mkItem("avatar_frame", "cinderglow", "Cinder Glow Frame", "rare"),
  mkItem("avatar_frame", "garnetvein", "Garnet Vein Frame", "rare"),
  mkItem("avatar_frame", "stormpewter", "Storm Pewter Frame", "rare"),
  mkItem("avatar_frame", "obsidianrim", "Obsidian Rim Frame", "epic"),
  mkItem("avatar_frame", "winterpearl", "Winter Pearl Frame", "epic"),
  mkItem("avatar_frame", "verdigris", "Verdigris Frame", "epic"),
  mkItem("avatar_frame", "aurumveil", "Aurum Veil Frame", "mythic"),
  mkItem("avatar_frame", "amethystfrost", "Amethyst Frost Frame", "mythic"),
  mkItem("avatar_frame", "voidhalo", "Void Halo Frame", "apex"),
];

// ---------------------------------------------------------------------------
// title — app/lib/profileCosmetics.ts's TITLE_OPTIONS boutique subset.
// ---------------------------------------------------------------------------
export const TITLE_ITEMS: readonly CatalogItem[] = [
  mkItem("title", "night_owl", "Night Owl Title", "common"),
  mkItem("title", "backroom_regular", "Backroom Regular Title", "common"),
  mkItem("title", "the_bluffer", "The Bluffer Title", "uncommon"),
  mkItem("title", "silk_road", "Silk Road Title", "uncommon"),
  mkItem("title", "velvet_hand", "Velvet Hand Title", "uncommon"),
  mkItem("title", "midnight_dealer", "Midnight Dealer Title", "rare"),
  mkItem("title", "the_fixer", "The Fixer Title", "rare"),
  mkItem("title", "the_sharp", "The Sharp Title", "rare"),
  mkItem("title", "last_call", "Last Call Title", "rare"),
  mkItem("title", "the_collector", "The Collector Title", "epic"),
  mkItem("title", "gilded_tongue", "Gilded Tongue Title", "epic"),
  mkItem("title", "quiet_storm", "Quiet Storm Title", "epic"),
  mkItem("title", "diamond_cut", "Diamond Cut Title", "mythic"),
  mkItem("title", "smoke_and_mirrors", "Smoke and Mirrors Title", "mythic"),
  mkItem("title", "table_legend", "Table Legend Title", "apex"),
];

// ---------------------------------------------------------------------------
// banner — app/lib/bannerPresets.ts's BANNER_OPTIONS boutique subset.
// ---------------------------------------------------------------------------
export const BANNER_ITEMS: readonly CatalogItem[] = [
  mkItem("banner", "smokedquartz", "Smoked Quartz Banner", "common"),
  mkItem("banner", "moonlight", "Moonlight Banner", "common"),
  mkItem("banner", "amberglass", "Amberglass Banner", "uncommon"),
  mkItem("banner", "rosewood", "Rosewood Banner", "uncommon"),
  mkItem("banner", "charcoalbloom", "Charcoal Bloom Banner", "uncommon"),
  mkItem("banner", "cassis", "Cassis Banner", "rare"),
  mkItem("banner", "velvet", "Velvet Banner", "rare"),
  mkItem("banner", "obsidiantide", "Obsidian Tide Banner", "rare"),
  mkItem("banner", "wildberry", "Wildberry Banner", "rare"),
  mkItem("banner", "sapphirevein", "Sapphire Vein Banner", "epic"),
  mkItem("banner", "peacock", "Peacock Banner", "epic"),
  mkItem("banner", "goldenhour", "Golden Hour Banner", "epic"),
  mkItem("banner", "champagne", "Champagne Banner", "mythic"),
  mkItem("banner", "glacialrift", "Glacial Rift Banner", "mythic"),
  mkItem("banner", "solarflare", "Solar Flare Banner", "apex"),
];

// ---------------------------------------------------------------------------
// avatar_emoji — app/lib/avatarPresets.ts's new
// BOUTIQUE_AVATAR_EMOJI_OPTIONS. id is the emoji itself.
// ---------------------------------------------------------------------------
export const AVATAR_EMOJI_ITEMS: readonly CatalogItem[] = [
  mkItem("avatar_emoji", "🐢", "Turtle Avatar", "common"),
  mkItem("avatar_emoji", "🐌", "Snail Avatar", "common"),
  mkItem("avatar_emoji", "🦥", "Sloth Avatar", "uncommon"),
  mkItem("avatar_emoji", "🦔", "Hedgehog Avatar", "uncommon"),
  mkItem("avatar_emoji", "🐿️", "Chipmunk Avatar", "uncommon"),
  mkItem("avatar_emoji", "🦦", "Otter Avatar", "rare"),
  mkItem("avatar_emoji", "🦫", "Beaver Avatar", "rare"),
  mkItem("avatar_emoji", "🦭", "Seal Avatar", "rare"),
  mkItem("avatar_emoji", "🦜", "Parrot Avatar", "rare"),
  mkItem("avatar_emoji", "🦩", "Flamingo Avatar", "epic"),
  mkItem("avatar_emoji", "🐊", "Crocodile Avatar", "epic"),
  mkItem("avatar_emoji", "🐳", "Whale Avatar", "epic"),
  mkItem("avatar_emoji", "🦈", "Shark Avatar", "mythic"),
  mkItem("avatar_emoji", "🦑", "Squid Avatar", "mythic"),
  mkItem("avatar_emoji", "🦅", "Eagle Avatar", "apex"),
];

// ---------------------------------------------------------------------------
// card_face — app/lib/cardFaceStore.ts's CARD_FACES boutique subset.
// ---------------------------------------------------------------------------
export const CARD_FACE_ITEMS: readonly CatalogItem[] = [
  mkItem("card_face", "outline", "Outline Card Face", "common"),
  mkItem("card_face", "mono", "Mono Card Face", "common"),
  mkItem("card_face", "ledger", "Ledger Card Face", "uncommon"),
  mkItem("card_face", "sketch", "Sketch Card Face", "uncommon"),
  mkItem("card_face", "shadow", "Shadow Card Face", "uncommon"),
  mkItem("card_face", "neon", "Neon Card Face", "rare"),
  mkItem("card_face", "ribbon", "Ribbon Card Face", "rare"),
  mkItem("card_face", "engraved", "Engraved Card Face", "rare"),
  mkItem("card_face", "chalk", "Chalkboard Card Face", "rare"),
  mkItem("card_face", "halo", "Halo Card Face", "epic"),
  mkItem("card_face", "deco", "Deco Card Face", "epic"),
  mkItem("card_face", "blueprint", "Blueprint Card Face", "epic"),
  mkItem("card_face", "marquee", "Marquee Card Face", "mythic"),
  mkItem("card_face", "inked", "Inked Card Face", "mythic"),
  mkItem("card_face", "royal", "Royal Seal Card Face", "apex"),
];

// ---------------------------------------------------------------------------
// card_back — app/lib/cardBackStore.ts's SIGNATURE_CARD_BACKS boutique
// subset.
// ---------------------------------------------------------------------------
export const CARD_BACK_ITEMS: readonly CatalogItem[] = [
  mkItem("card_back", "static", "Static Card Back", "common"),
  mkItem("card_back", "brushed", "Brushed Steel Card Back", "common"),
  mkItem("card_back", "basketweave", "Basketweave Card Back", "uncommon"),
  mkItem("card_back", "houndstooth", "Houndstooth Card Back", "uncommon"),
  mkItem("card_back", "tartan", "Tartan Card Back", "uncommon"),
  mkItem("card_back", "chevron", "Chevron Card Back", "rare"),
  mkItem("card_back", "quilted", "Quilted Diamond Card Back", "rare"),
  mkItem("card_back", "damask", "Damask Card Back", "rare"),
  mkItem("card_back", "confetti", "Confetti Card Back", "rare"),
  mkItem("card_back", "marble", "Marbled Vein Card Back", "epic"),
  mkItem("card_back", "starfield", "Starfield Card Back", "epic"),
  mkItem("card_back", "filigree", "Filigree Card Back", "epic"),
  mkItem("card_back", "obsidianweave", "Obsidian Weave Card Back", "mythic"),
  mkItem("card_back", "prismveil", "Prism Veil Card Back", "mythic"),
  mkItem("card_back", "goldleaf", "Gold Leaf Card Back", "apex"),
];

/** Every purchasable item across all 7 categories — 105 total (15 × 7). */
export const CATALOG_ITEMS: readonly CatalogItem[] = [
  ...BADGE_ITEMS,
  ...AVATAR_FRAME_ITEMS,
  ...TITLE_ITEMS,
  ...BANNER_ITEMS,
  ...AVATAR_EMOJI_ITEMS,
  ...CARD_FACE_ITEMS,
  ...CARD_BACK_ITEMS,
];

/** `CATALOG_ITEMS` grouped by category — what the Store UI lists per tab. */
export const ITEMS_BY_CATEGORY: Readonly<Record<CosmeticCategory, readonly CatalogItem[]>> = {
  badge: BADGE_ITEMS,
  avatar_frame: AVATAR_FRAME_ITEMS,
  title: TITLE_ITEMS,
  banner: BANNER_ITEMS,
  avatar_emoji: AVATAR_EMOJI_ITEMS,
  card_face: CARD_FACE_ITEMS,
  card_back: CARD_BACK_ITEMS,
};

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

export interface CatalogBundle {
  bundleId: string;
  sku: string;
  name: string;
  priceCents: number;
  /** The skus this bundle grants — resolved to real CatalogItem skus,
   * never invented separately (see catalog.test.ts's recompute checks). */
  skus: readonly string[];
}

/**
 * Rounds a raw cents amount up to the nearest "charm" ending — the smallest
 * value >= `rawCents` whose last two digits are 49 or 99 (e.g. 6721 → 6749,
 * 6750 → 6799). Used once, at author time, to derive each category bundle's
 * static price below — never called at runtime by the catalog itself (see
 * store.md: "compute once, store as a static cents value... never computed
 * live"). Exported only so catalog.test.ts can independently recompute and
 * assert the stored prices, not so a bundle price is ever derived live.
 */
export function roundToCharmCents(rawCents: number): number {
  const rounded = Math.round(rawCents);
  const dollars = Math.floor(rounded / 100);
  const remainder = rounded - dollars * 100;
  if (remainder <= 49) return dollars * 100 + 49;
  return dollars * 100 + 99;
}

function categoryBundlePriceCents(items: readonly CatalogItem[]): number {
  const sum = items.reduce((total, item) => total + item.priceCents, 0);
  return roundToCharmCents(sum * 0.72);
}

function categoryBundle(category: CosmeticCategory, displayName: string, items: readonly CatalogItem[]): CatalogBundle {
  return {
    bundleId: category,
    sku: `bundle:${category}`,
    name: `${displayName} Bundle`,
    // Every category has the identical 2/3/4/3/2/1 rarity distribution, so
    // every category bundle lands on the identical price (6749 = round-to-
    // charm(0.72 × 9335)) — a real consequence of the uniform distribution,
    // not a copy/paste mistake. Still computed from `items` (never
    // hand-entered) so a future change to any one category's roster keeps
    // this correct automatically.
    priceCents: categoryBundlePriceCents(items),
    skus: items.map((i) => i.sku!),
  };
}

export const CATEGORY_BUNDLES: readonly CatalogBundle[] = [
  categoryBundle("badge", "Badge", BADGE_ITEMS),
  categoryBundle("avatar_frame", "Avatar Frame", AVATAR_FRAME_ITEMS),
  categoryBundle("title", "Title", TITLE_ITEMS),
  categoryBundle("banner", "Banner", BANNER_ITEMS),
  categoryBundle("avatar_emoji", "Avatar Emoji", AVATAR_EMOJI_ITEMS),
  categoryBundle("card_face", "Card Face", CARD_FACE_ITEMS),
  categoryBundle("card_back", "Card Back", CARD_BACK_ITEMS),
];

/** Flat cents value the hero bundle is fixed at — store.md's own $24.99,
 * not derived from its member items' prices (those 8 items alone would sum
 * to far more; that gap is the whole point of a hero bundle). Kept as its
 * own export for backward compatibility with earlier scaffolding. */
export const SUPPORTER_PACK_PRICE_CENTS = 2499;

/**
 * The hero bundle — 8 hand-picked cross-category items, weighted toward
 * epic/mythic/apex, spanning every one of the 7 categories with one repeat
 * (banner, for an extra showcase item — the "plus one more epic+ item of
 * the agent's choice" store.md calls for). Picks:
 *   - badge:🔮 (Crystal Ball, apex) — the badge category's own showcase.
 *   - avatar_frame:voidhalo (Void Halo, apex) — the new hero frame.
 *   - title:smoke_and_mirrors (mythic) — leaves the brand-new apex title
 *     (Table Legend) as something still exclusive to a full title purchase.
 *   - banner:solarflare (Solar Flare, apex) — the banner category's apex.
 *   - avatar_emoji:🦅 (Eagle, apex) — the avatar emoji category's apex.
 *   - card_face:royal (Royal Seal, apex) — the card face category's apex.
 *   - card_back:goldleaf (Gold Leaf, apex) — the card back category's apex.
 *   - banner:goldenhour (Golden Hour, epic) — the 8th "agent's choice" item;
 *     an extra banner rather than a new 8th category (only 7 exist), and an
 *     epic pick specifically so the bundle reads as a genuine epic/mythic/
 *     apex mix rather than "everything is apex."
 */
export const SUPPORTER_BUNDLE: CatalogBundle = {
  bundleId: "supporter",
  sku: "bundle:supporter",
  name: "Supporter Pack",
  priceCents: SUPPORTER_PACK_PRICE_CENTS,
  skus: [
    "badge:🔮",
    "avatar_frame:voidhalo",
    "title:smoke_and_mirrors",
    "banner:solarflare",
    "avatar_emoji:🦅",
    "card_face:royal",
    "card_back:goldleaf",
    "banner:goldenhour",
  ],
};

export const CATALOG_BUNDLES: readonly CatalogBundle[] = [...CATEGORY_BUNDLES, SUPPORTER_BUNDLE];

// ---------------------------------------------------------------------------
// Flat sku → {name, priceCents} map — the exact shape create-checkout-session
// and stripe-webhook have depended on since this file was first stubbed
// (see src/store/checkout.ts). Every item AND every bundle sku resolves
// here; a bundle entry's `skus` list (which items it grants) lives on
// CATALOG_BUNDLES instead, since CatalogItem itself has no room for a list
// of member skus.
// ---------------------------------------------------------------------------
export const CATALOG: Record<string, CatalogItem> = Object.fromEntries([
  ...CATALOG_ITEMS.map((item) => [item.sku!, item] as const),
  ...CATALOG_BUNDLES.map((bundle) => [bundle.sku, { name: bundle.name, priceCents: bundle.priceCents }] as const),
]);

export function catalogItem(sku: string): CatalogItem | undefined {
  return CATALOG[sku];
}

export function findBundle(sku: string): CatalogBundle | undefined {
  return CATALOG_BUNDLES.find((b) => b.sku === sku);
}
