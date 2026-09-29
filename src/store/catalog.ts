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
  | "card_back"
  | "theme";

export const STORE_CATEGORIES: readonly CosmeticCategory[] = [
  "badge",
  "avatar_frame",
  "title",
  "banner",
  "avatar_emoji",
  "card_face",
  "card_back",
  "theme",
];

export type CosmeticRarity = "common" | "uncommon" | "rare" | "epic" | "mythic" | "apex";

/** Flat USD cents price for every single purchasable item, regardless of
 * rarity — a product decision (Sept 2026 repricing) that replaced the old
 * per-rarity ladder (`PRICE_CENTS_BY_RARITY`). Rarity still drives visual
 * treatment only (foil/ring complexity — see `cosmeticRarity.ts`), never
 * price, from here on. The single source of truth every item's price below
 * is computed from (never hand-entered per item — see `mkItem`) and that
 * catalog.test.ts asserts every item still matches. */
export const SINGLE_ITEM_PRICE_CENTS = 99;

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
  return { category, id, rarity, sku: `${category}:${id}`, name, priceCents: SINGLE_ITEM_PRICE_CENTS };
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
// Bare names (no trailing "Title") — matching TITLE_OPTIONS' own `label` and
// how a title reads everywhere else it's shown once equipped. The Boutique
// grid already has a "TITLES" section heading and rarity styling, so
// appending the word again here was redundant and, for the longer names,
// made the preview pill (a fixed-width card) wrap to two lines.
export const TITLE_ITEMS: readonly CatalogItem[] = [
  mkItem("title", "night_owl", "Night Owl", "common"),
  mkItem("title", "backroom_regular", "Backroom Regular", "common"),
  mkItem("title", "the_bluffer", "The Bluffer", "uncommon"),
  mkItem("title", "silk_road", "Silk Road", "uncommon"),
  mkItem("title", "velvet_hand", "Velvet Hand", "uncommon"),
  mkItem("title", "midnight_dealer", "Midnight Dealer", "rare"),
  mkItem("title", "the_fixer", "The Fixer", "rare"),
  mkItem("title", "the_sharp", "The Sharp", "rare"),
  mkItem("title", "last_call", "Last Call", "rare"),
  mkItem("title", "the_collector", "The Collector", "epic"),
  mkItem("title", "gilded_tongue", "Gilded Tongue", "epic"),
  mkItem("title", "quiet_storm", "Quiet Storm", "epic"),
  mkItem("title", "diamond_cut", "Diamond Cut", "mythic"),
  mkItem("title", "smoke_and_mirrors", "Smoke and Mirrors", "mythic"),
  mkItem("title", "table_legend", "Table Legend", "apex"),
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

// ---------------------------------------------------------------------------
// theme — app/lib/themeStore.ts's THEMES. 30 of the 38 table themes are
// purchasable here (the other 8 — midnight [the DEFAULT_THEME], daylight,
// casino, pastel, noir, sakura, ember, lagoon — stay free forever for every
// account, current and future; see themeStore.ts's own `unlock` field on
// each ThemeOption, which must agree with this list exactly, checked by
// themeBoutique.test.ts). Unlike every other category, this is modeled as
// pure client-side-only enforcement (no DB trigger, no CHECK constraint,
// no migration) — same as card_face/card_back, and for the same
// proportionality reason cardCosmeticUnlocks.ts's own doc makes: a table
// theme is nobody else's business but your own, purely personal-taste
// client rendering with zero competitive stakes.
//
// Rarity here (common/uncommon for the more ordinary classic themes,
// rare/epic for flashier ones, mythic/apex reserved for a couple of real
// showcase holiday themes — New Year's Eve, Confetti) only affects visual
// treatment (foil/ring complexity), never price — every theme is still
// flat SINGLE_ITEM_PRICE_CENTS, same as every other category.
// ---------------------------------------------------------------------------
export const THEME_ITEMS: readonly CatalogItem[] = [
  // Classic (12 of the 20 classic themes — midnight/daylight/casino/pastel/
  // noir/sakura/ember/lagoon are the 8 free ones, not here).
  mkItem("theme", "arcade", "Retro Arcade Theme", "rare"),
  mkItem("theme", "citrus", "Citrus Grove Theme", "common"),
  mkItem("theme", "frost", "Frost Theme", "common"),
  mkItem("theme", "meadow", "Meadow Theme", "common"),
  mkItem("theme", "sahara", "Sahara Dusk Theme", "uncommon"),
  mkItem("theme", "coralsand", "Coral Sand Theme", "uncommon"),
  mkItem("theme", "aurora", "Aurora Theme", "epic"),
  mkItem("theme", "lilac", "Lilac Mist Theme", "uncommon"),
  mkItem("theme", "jade", "Jade Imperial Theme", "rare"),
  mkItem("theme", "champagne", "Champagne Theme", "uncommon"),
  mkItem("theme", "verdigris", "Verdigris Theme", "rare"),
  mkItem("theme", "alabaster", "Alabaster Theme", "common"),
  // Holiday (all 18 holiday themes).
  mkItem("theme", "valentines", "Valentine's Day Theme", "uncommon"),
  mkItem("theme", "sweetheart", "Sweetheart Theme", "common"),
  mkItem("theme", "stpatricks", "St. Patrick's Day Theme", "uncommon"),
  mkItem("theme", "cloverfield", "Clover Field Theme", "common"),
  mkItem("theme", "springdusk", "Spring Dusk Theme", "rare"),
  mkItem("theme", "easter", "Easter Theme", "common"),
  mkItem("theme", "july4th", "4th of July Theme", "rare"),
  mkItem("theme", "starsandstripes", "Stars & Stripes Theme", "uncommon"),
  mkItem("theme", "halloween", "Halloween Theme", "epic"),
  mkItem("theme", "candycorn", "Candy Corn Theme", "uncommon"),
  mkItem("theme", "thanksgiving", "Thanksgiving Theme", "common"),
  mkItem("theme", "pumpkinspice", "Pumpkin Spice Theme", "common"),
  mkItem("theme", "hanukkah", "Hanukkah Theme", "rare"),
  mkItem("theme", "festivaloflights", "Festival of Lights Theme", "uncommon"),
  mkItem("theme", "christmas", "Christmas Theme", "epic"),
  mkItem("theme", "candycane", "Candy Cane Theme", "uncommon"),
  mkItem("theme", "newyears", "New Year's Eve Theme", "mythic"),
  mkItem("theme", "confetti", "Confetti Theme", "apex"),
];

/** Every purchasable item across all 8 categories — 135 total (15 × 7 +
 * 30 theme). */
export const CATALOG_ITEMS: readonly CatalogItem[] = [
  ...BADGE_ITEMS,
  ...AVATAR_FRAME_ITEMS,
  ...TITLE_ITEMS,
  ...BANNER_ITEMS,
  ...AVATAR_EMOJI_ITEMS,
  ...CARD_FACE_ITEMS,
  ...CARD_BACK_ITEMS,
  ...THEME_ITEMS,
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
  theme: THEME_ITEMS,
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
 * 6750 → 6799). Still used, at author time, as the first step of
 * `computeBundlePriceCents` below (see its own doc) — the discount is taken
 * off this charm-rounded sum, not the raw sum. Exported so catalog.test.ts
 * can independently recompute and assert the stored prices, not so a bundle
 * price is ever derived live.
 */
export function roundToCharmCents(rawCents: number): number {
  const rounded = Math.round(rawCents);
  const dollars = Math.floor(rounded / 100);
  const remainder = rounded - dollars * 100;
  if (remainder <= 49) return dollars * 100 + 49;
  return dollars * 100 + 99;
}

/** The bundle discount off a flat per-item sum — 20% (Sept 2026 repricing,
 * see `computeBundlePriceCents`). */
const BUNDLE_DISCOUNT = 0.2;

/** Rounds a raw cents amount DOWN to the nearest value whose last two
 * digits are 99 (e.g. 639.2 → 599, 1199.2 → 1199) — the last step of
 * `computeBundlePriceCents`. Unlike `roundToCharmCents` (which always
 * rounds *up*, and can land on a 49 ending), a bundle's discounted price
 * always rounds *down* onto a 99 ending specifically, so the sticker price
 * never creeps above the nominal discount. */
function roundDownToNinetyNineCents(rawCents: number): number {
  return Math.floor((rawCents + 1) / 100) * 100 - 1;
}

/**
 * A bundle's price, derived from nothing but the number of flat-priced
 * items it contains — never hand-typed (see this file's header). Pipeline:
 *   1. Sum `itemCount` items at `SINGLE_ITEM_PRICE_CENTS` each.
 *   2. Charm-round that sum UP (`roundToCharmCents`) to a psychological
 *      pre-discount sticker price, same convention as a single item's own
 *      pricing used to follow under the old per-rarity ladder.
 *   3. Apply the flat 20% bundle discount (`BUNDLE_DISCOUNT`).
 *   4. Round the discounted result DOWN to the nearest 99-ending price
 *      (`roundDownToNinetyNineCents`).
 *
 * Verified against the two worked examples the Sept 2026 repricing decision
 * specifies: computeBundlePriceCents(15) === 1199 ($11.99, every 15-item
 * category bundle) and computeBundlePriceCents(8) === 599 ($5.99, the
 * 8-item Supporter Pack).
 */
export function computeBundlePriceCents(itemCount: number): number {
  const sum = itemCount * SINGLE_ITEM_PRICE_CENTS;
  const charmed = roundToCharmCents(sum);
  const discounted = charmed * (1 - BUNDLE_DISCOUNT);
  return roundDownToNinetyNineCents(discounted);
}

function categoryBundle(category: CosmeticCategory, displayName: string, items: readonly CatalogItem[]): CatalogBundle {
  return {
    bundleId: category,
    sku: `bundle:${category}`,
    name: `${displayName} Bundle`,
    // Every category has the same 15-item count, so every category bundle
    // lands on the identical price (1199 = computeBundlePriceCents(15)) —
    // a real consequence of the uniform flat pricing, not a copy/paste
    // mistake. Still computed from `items` (never hand-entered) so a future
    // change to any one category's roster keeps this correct automatically.
    priceCents: computeBundlePriceCents(items.length),
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
  // 30 items, not 15 like every other category bundle — so this one lands
  // on computeBundlePriceCents(30), a genuinely different (higher) price
  // than the uniform $11.99 the other 7 share. Still derived the same way,
  // never hand-typed.
  categoryBundle("theme", "Theme", THEME_ITEMS),
];

/** The hero bundle's 8 member skus, hand-picked below — pulled out on its
 * own so its price can be derived from its own item count rather than
 * hand-typed (see `SUPPORTER_PACK_PRICE_CENTS`). */
const SUPPORTER_BUNDLE_SKUS = [
  "badge:🔮",
  "avatar_frame:voidhalo",
  "title:smoke_and_mirrors",
  "banner:solarflare",
  "avatar_emoji:🦅",
  "card_face:royal",
  "card_back:goldleaf",
  "banner:goldenhour",
] as const;

/** The hero bundle's price — since the Sept 2026 repricing, derived through
 * the same `computeBundlePriceCents` every category bundle uses (599 =
 * computeBundlePriceCents(8), one of the two worked examples that decision
 * specifies), no longer a hand-typed flat $24.99. Kept as its own export
 * for backward compatibility with earlier scaffolding. */
export const SUPPORTER_PACK_PRICE_CENTS = computeBundlePriceCents(SUPPORTER_BUNDLE_SKUS.length);

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
  skus: SUPPORTER_BUNDLE_SKUS,
};

/**
 * The top-tier anchor: every individually-purchasable item in the entire
 * catalog (135 skus across all 8 categories — badge/avatar_frame/title/
 * banner/avatar_emoji/card_face/card_back at 15 each, plus 30 theme items),
 * flattened from `CATALOG_ITEMS` itself rather than hand-typed so it can
 * never drift from the real catalog. Priced through the exact same
 * `computeBundlePriceCents` every other bundle uses — one consistent
 * pricing rule for every bundle, this one included, rather than a bespoke
 * "buy everything" discount percentage.
 *
 * Deliberately does NOT include the other bundle wrapper skus
 * (`bundle:supporter`, `bundle:card_back`, `bundle:theme`, …) in its own
 * `.skus` list — only the 135 real underlying items matter for unlocking
 * anything (see cosmeticUnlocks.ts's "boutique" case), so granting the
 * other bundles' wrapper skus too would just be noise. A Supporter Pack
 * buyer's items are already all individually present in this list, so
 * buying Everything correctly implies owning every Supporter Pack item —
 * and, separately, a smaller bundle's own sku is only ever granted when
 * THAT bundle's own sku is the one actually purchased (see
 * entitlements.ts's expandPurchasedSkus).
 */
export const EVERYTHING_BUNDLE: CatalogBundle = {
  bundleId: "everything",
  sku: "bundle:everything",
  name: "Everything Bundle",
  priceCents: computeBundlePriceCents(CATALOG_ITEMS.length),
  skus: CATALOG_ITEMS.map((i) => i.sku!),
};

export const CATALOG_BUNDLES: readonly CatalogBundle[] = [...CATEGORY_BUNDLES, SUPPORTER_BUNDLE, EVERYTHING_BUNDLE];

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
