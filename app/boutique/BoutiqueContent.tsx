"use client";

// The Boutique — the real-money cosmetic store. Reachable from the Profile
// hub and from every picker's "Get this in the Boutique" link
// (player/page.tsx's Boutique tab, CardFacePicker.tsx,
// SignatureCardBackPicker.tsx). See /tmp/wave/store.md for the full
// product spec this implements.
//
// Every preview on this page reuses the app's own existing rendering —
// PlayerAvatar/AvatarFrame for avatar_frame and avatar_emoji, ProfileBanner
// for banner, EmojiOrBadge for badge, CardFace for card_face, the
// `[data-cardback]` CSS attribute for card_back — the same components each
// item already renders through once equipped, so a Boutique preview never
// drifts from the real thing.
//
// Purchasing is deliberately single-tap, not a cart: this app has no
// existing cart pattern anywhere, and with cosmetics this cheap (see
// store.md's pricing ladder) a "select several, then check out" flow would
// add a whole new UI concept for very little benefit over "tap Buy, land on
// Stripe." A bundle is still just one sku, so the hero pack and category
// bundles use the exact same one-tap `startPurchase([sku])` call as a
// single item.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../AuthContext";
import { supabase } from "../lib/supabaseClient";
import { AvatarFrame } from "../components/AvatarFrame";
import { BackLink } from "../components/BackLink";
import { EmptyState } from "../components/EmptyState";
import { EmojiOrBadge } from "../components/PremiumBadgeIcon";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { ProfileBanner } from "../components/ProfileBanner";
import { findBannerOption } from "../lib/bannerPresets";
import { CardFace } from "../components/CardFace";
import type { CardFaceId } from "../lib/cardFaceStore";
import { CheckBadge, ThemeSwatchBlock } from "../settings/SwatchPicker";
import type { ThemeId } from "../lib/themeStore";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { translateError } from "../lib/i18n/serverErrors";
import { fetchAvatarsFor, fetchOwnDisplayName, AvatarInfo } from "../lib/leaderboardStore";
import { Friend, getFriends } from "../lib/friendsStore";
import { GiftPickerDialog } from "../components/GiftPickerDialog";
import { RARITY_TEXT_ACCENT, RARITY_VISUAL, rarityHasFoil } from "../lib/cosmeticRarity";
import {
  bundleSavingsPercent,
  findStoreItem,
  formatPriceCents,
  listBundles,
  listStoreItems,
  StoreBundle,
  StoreItem,
} from "../lib/storeCatalog";
import { COSMETIC_CATEGORIES, CosmeticCategory } from "../lib/storeSku";
import { pollForEntitlements, useEntitlements } from "../lib/entitlementsStore";
import { PurchaseError, startPurchase } from "../lib/purchasing";
import { useWishlist } from "../lib/wishlistStore";
import type { Card } from "@/types";

const PREVIEW_CARD: Card = { id: "boutique-preview", suit: "hearts", rank: "7", isWild: false };

/** The filter bar's selectable values — every per-cosmetic-category option,
 * plus "all" (every single item), "bundles" (the hero pack + every
 * per-category bundle, in place of the individual-item grid), and
 * "wishlist" (items this account starred, signed-in only — see
 * wishlistStore.ts). "bundles" is the default so a first-time visitor sees
 * the best-value bundles immediately (see this component's own header) — a
 * `?item=<sku>` deep link overrides that default to the item's own
 * category instead. */
type BoutiqueFilter = CosmeticCategory | "all" | "bundles" | "wishlist";

const CATEGORY_KEY: Record<CosmeticCategory, TranslationKey> = {
  badge: "boutique.category.badge",
  avatar_frame: "boutique.category.avatar_frame",
  title: "boutique.category.title",
  banner: "boutique.category.banner",
  avatar_emoji: "boutique.category.avatar_emoji",
  card_face: "boutique.category.card_face",
  card_back: "boutique.category.card_back",
  theme: "boutique.category.theme",
};

/** Where "Equip" sends you once an item is owned — the real picker page
 * for that category, matching CardFacePicker/SignatureCardBackPicker's own
 * routes and player/page.tsx's Edit-profile tabs. */
function equipHrefFor(item: StoreItem): string {
  switch (item.category) {
    case "badge":
      return "/player?edit=1&tab=badge";
    case "avatar_frame":
      return "/player?edit=1&tab=frame";
    case "title":
      return "/player?edit=1&tab=title";
    case "banner":
      return "/player?edit=1&tab=banner";
    case "avatar_emoji":
      return "/player?edit=1&tab=picture";
    case "card_face":
      return "/settings/card-face";
    case "card_back":
      return "/settings/card-back";
    case "theme":
      return "/settings/theme";
  }
}

interface SelfProfile {
  avatar: AvatarInfo;
  displayName: string | null;
}

/** The account's own current avatar + name, fetched once for the "Try on"
 * toggle (avatar_frame/avatar_emoji/banner only — see the toggle's own
 * doc). Never written anywhere; purely a preview input. */
function useSelfProfile(userId: string | null | undefined): SelfProfile | null {
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const client = supabase;
    Promise.all([fetchAvatarsFor(client, [userId]), fetchOwnDisplayName(client, userId)])
      .then(([avatars, displayName]) => {
        if (cancelled) return;
        setProfile({ avatar: avatars[userId] ?? { kind: "emoji", emoji: null, color: null, photoPath: null }, displayName });
      })
      .catch(() => {
        /* Try-on just falls back to a generic preview — not worth surfacing an error for. */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return profile;
}

/** Wraps a preview in the shared rarity ring/foil treatment
 * (cosmeticRarity.ts's RARITY_VISUAL) — the same shimmer every equipped
 * epic+ frame/banner/card already gets, so a browsing player can tell at a
 * glance which items are the big-ticket ones. */
function RarityFrame({ rarity, className, children }: { rarity: StoreItem["rarity"]; className?: string; children: ReactNode }) {
  const foil = rarityHasFoil(rarity);
  return (
    <div className={`${foil ? `foil-sweep ${RARITY_VISUAL[rarity].ringClass}` : ""} relative overflow-hidden rounded-lg ${className ?? ""}`}>
      {children}
    </div>
  );
}

function ItemPreview({
  item,
  tryOn,
  self,
  compact,
}: {
  item: StoreItem;
  tryOn: boolean;
  self: SelfProfile | null;
  /** True inside a bundle card's small "included items" strip — text-
   * bearing previews (title, banner) don't fit a 40px icon slot the way
   * badge/frame/card previews do, so they swap for a minimal icon-shaped
   * stand-in instead of overflowing it. */
  compact?: boolean;
}) {
  const avatarSize = compact ? 36 : 56;
  switch (item.category) {
    case "badge":
      return (
        <span className={`grid place-items-center rounded-lg bg-[var(--panel-soft)] text-[var(--heading)] ${compact ? "h-full w-full" : "h-14 w-14"}`}>
          <EmojiOrBadge emoji={item.itemId} className={compact ? "h-5 w-5" : "h-8 w-8"} />
        </span>
      );
    case "avatar_frame":
      return (
        <AvatarFrame frame={item.itemId} size={avatarSize}>
          <PlayerAvatar avatar={tryOn ? self?.avatar : null} size={avatarSize} />
        </AvatarFrame>
      );
    case "avatar_emoji":
      return (
        <PlayerAvatar
          avatar={{ kind: "emoji", emoji: item.itemId, color: (tryOn && self?.avatar.color) || null, photoPath: null }}
          size={avatarSize}
        />
      );
    case "title": {
      const accent = RARITY_TEXT_ACCENT[item.rarity];
      // Compact: no room for the full name at icon size, but a generic "Aa"
      // told every title apart from every other title equally badly — the
      // one thing a bundle-strip preview most needs to do. A 2-letter
      // initialism (first letter of the first two words, e.g. "Night Owl"
      // → "NO") is still real information at a glance, not filler.
      const initials = item.name
        .split(" ")
        .filter((w) => w.length > 0)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
      return compact ? (
        <span
          className="grid h-full w-full place-items-center rounded-lg border text-xs font-bold"
          style={accent ? { borderColor: accent, color: accent } : undefined}
          aria-hidden="true"
          title={item.name}
        >
          {initials}
        </span>
      ) : (
        // rounded-xl, not rounded-full: a fully-rounded pill computes its
        // radius from the box's own height, so once a long name wraps to a
        // second line the taller box turned the rounded ends into huge
        // parenthesis-like arcs instead of a normal pill border.
        <span
          className="inline-block rounded-xl border px-3 py-1.5 text-xs font-medium leading-snug"
          style={accent ? { borderColor: accent, color: accent } : undefined}
        >
          {item.name}
        </span>
      );
    }
    case "banner":
      // Compact: the full ProfileBanner treatment (padding, an avatar +
      // name row) needs real width — a plain color swatch stands in
      // instead, still built from the same banner option findBannerOption
      // resolves for the real, equipped ProfileBanner elsewhere.
      return compact ? (
        <span
          className="block h-full w-full rounded-lg"
          style={{ background: findBannerOption(item.itemId)?.css }}
          aria-hidden="true"
        />
      ) : (
        <ProfileBanner banner={item.itemId}>
          <div className="flex items-center gap-2">
            <PlayerAvatar avatar={tryOn ? self?.avatar : null} size={28} />
            {tryOn && self?.displayName && <span className="truncate text-xs font-semibold text-white/90">{self.displayName}</span>}
          </div>
        </ProfileBanner>
      );
    case "card_face":
      return (
        <span className={`flex items-center justify-center rounded-lg bg-[var(--panel-soft)] ${compact ? "h-full w-full" : "h-14 w-14"}`}>
          <span className={`card-face overflow-hidden rounded-md shadow-sm ${compact ? "h-7 w-6" : "h-11 w-9"}`}>
            <CardFace card={PREVIEW_CARD} style={item.itemId as CardFaceId} />
          </span>
        </span>
      );
    case "card_back":
      return (
        <span
          data-cardback={item.itemId}
          className={`card-back flex items-center justify-center rounded-lg ${compact ? "h-full w-full" : "h-14 w-14"}`}
          style={{ background: "var(--panel-soft)" }}
        />
      );
    case "theme":
      // The exact same swatch-block the standalone theme picker
      // (/settings/theme) renders per tile — see SwatchPicker.tsx's own
      // doc on why this is shared rather than a one-off rendering here.
      return <ThemeSwatchBlock id={item.itemId as ThemeId} compact={compact} />;
  }
}

interface ItemCardProps {
  item: StoreItem;
  owned: boolean;
  signedIn: boolean;
  purchasing: boolean;
  onBuy: () => void;
  tryOnEnabled: boolean;
  tryOn: boolean;
  onToggleTryOn: () => void;
  self: SelfProfile | null;
  highlighted: boolean;
  wishlisted: boolean;
  /** Undefined for a signed-out visitor — there's no account to save a
   * wishlist against, so the star is hidden entirely rather than shown
   * disabled (see the "sign in to buy" branch below, which already asks
   * for sign-in for the one thing a guest here actually needs to do). */
  onToggleWishlist?: () => void;
  /** Undefined for a signed-out visitor or an already-owned item — gifting
   * something you already own to a friend is still allowed (see
   * onToggleWishlist's own note on why "undefined = hide" beats "disabled"
   * here too), so this only needs its own owned check where owned changes
   * what the button DOES rather than whether it should exist. */
  onGift?: () => void;
}

function ItemCard({
  item,
  owned,
  signedIn,
  purchasing,
  onBuy,
  tryOnEnabled,
  tryOn,
  onToggleTryOn,
  self,
  highlighted,
  wishlisted,
  onToggleWishlist,
  onGift,
}: ItemCardProps) {
  const { t, locale } = useT();
  return (
    <div
      id={`boutique-item-${item.sku}`}
      className={`relative flex flex-col gap-2 rounded-xl border p-3 transition ${
        highlighted ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
      {onGift && (
        <button
          onClick={onGift}
          aria-label={t("boutique.item.giftAria", { item: item.name })}
          className="absolute left-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-[var(--panel)]/80 text-sm text-[var(--faint)] transition hover:text-[var(--accent)]"
        >
          🎁
        </button>
      )}
      {onToggleWishlist && !owned && (
        <button
          onClick={onToggleWishlist}
          aria-label={wishlisted ? t("boutique.item.wishlistRemove") : t("boutique.item.wishlistAdd")}
          aria-pressed={wishlisted}
          className={`absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full text-sm transition ${
            wishlisted ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel)]/80 text-[var(--faint)] hover:text-[var(--accent)]"
          }`}
        >
          {wishlisted ? "★" : "☆"}
        </button>
      )}
      <RarityFrame rarity={item.rarity} className="self-start">
        <ItemPreview item={item} tryOn={tryOn} self={self} />
      </RarityFrame>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--heading)]">{item.name}</p>
        <p className="text-xs text-[var(--muted)]">{formatPriceCents(item.priceCents, locale)}</p>
      </div>
      {tryOnEnabled && (
        <button
          onClick={onToggleTryOn}
          className={`self-start rounded-md px-2 py-1 text-[11px] font-medium ${
            tryOn ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--elevated)]"
          }`}
        >
          {tryOn ? t("boutique.item.tryOnEnd") : t("boutique.item.tryOn")}
        </button>
      )}
      {tryOn && <p className="text-[10px] text-[var(--muted)]">{t("boutique.item.tryOnBadge")}</p>}
      {owned ? (
        <Link
          href={equipHrefFor(item)}
          className="mt-auto flex items-center justify-center gap-1 rounded-lg bg-[var(--panel-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--elevated)]"
        >
          <CheckBadge className="h-3 w-3" /> {t("boutique.item.owned")} · {t("boutique.item.equip")}
        </Link>
      ) : !signedIn ? (
        <Link
          href="/sign-in"
          className="mt-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-center text-xs font-semibold text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("boutique.item.signInToBuy")}
        </Link>
      ) : (
        <button
          onClick={onBuy}
          disabled={purchasing}
          className="mt-auto rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {purchasing ? t("common.loading") : t("boutique.item.buy", { price: formatPriceCents(item.priceCents, locale) })}
        </button>
      )}
    </div>
  );
}

function BundleCard({
  bundle,
  items,
  owned,
  signedIn,
  purchasing,
  onBuy,
  hero,
  topTier,
}: {
  bundle: StoreBundle;
  items: StoreItem[];
  owned: boolean;
  signedIn: boolean;
  purchasing: boolean;
  onBuy: () => void;
  hero?: boolean;
  /** The Everything Bundle — the top-tier anchor above the hero pack, not
   * just another bundle card. Distinguished from `hero` (Supporter Pack)
   * with an even bigger price/name, a gold-toned gradient instead of the
   * plain accent one, and its own "complete collection" badge text rather
   * than "Best value" (both are true, but this one's the bigger claim).
   * Skips the included-items icon strip entirely — at 135 items it would
   * be an unreadable wall of icons, where a plain item count line already
   * says everything that matters ("all 135 items"). */
  topTier?: boolean;
}) {
  const { t, tPlural, locale } = useT();
  const savings = bundleSavingsPercent(bundle);
  const included = bundle.includes.map((sku) => items.find((i) => i.sku === sku)).filter((i): i is StoreItem => !!i);
  const big = hero || topTier;

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${
        topTier
          ? "border-[var(--accent)] bg-gradient-to-br from-[var(--accent)]/25 via-[var(--accent)]/10 to-transparent shadow-lg"
          : hero
            ? "border-[var(--accent)] bg-gradient-to-br from-[var(--accent)]/15 to-transparent"
            : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`font-bold text-[var(--heading)] ${topTier ? "text-xl" : big ? "text-lg" : "text-sm"}`}>{bundle.name}</p>
          <p className={`font-semibold text-[var(--accent)] ${big ? "text-base" : "text-sm"}`}>
            {formatPriceCents(bundle.priceCents, locale)}
          </p>
        </div>
        {topTier ? (
          <span className="shrink-0 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--on-accent)]">
            {t("boutique.everything.badge")}
          </span>
        ) : hero ? (
          <span className="shrink-0 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--on-accent)]">
            {t("boutique.hero.badge")}
          </span>
        ) : (
          savings !== null &&
          savings > 0 && (
            <span className="shrink-0 rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
              {t("boutique.bundle.discount", { percent: savings })}
            </span>
          )
        )}
      </div>

      {topTier ? (
        included.length > 0 && (
          <p className="text-xs text-[var(--muted)]">{tPlural("boutique.bundle.itemCount", included.length)}</p>
        )
      ) : (
        included.length > 0 && (
          <div>
            {hero && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{t("boutique.hero.includes")}</p>}
            <div className="flex flex-wrap gap-2">
              {included.map((item) => (
                <RarityFrame key={item.sku} rarity={item.rarity} className="h-10 w-10 shrink-0">
                  <ItemPreview item={item} tryOn={false} self={null} compact />
                </RarityFrame>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {tPlural("boutique.bundle.itemCount", included.length)}
            </p>
          </div>
        )
      )}

      {owned ? (
        <span className="mt-auto flex items-center justify-center gap-1 rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
          <CheckBadge className="h-3 w-3" /> {t("boutique.item.owned")}
        </span>
      ) : !signedIn ? (
        <Link
          href="/sign-in"
          className="mt-auto rounded-lg border border-[var(--border)] px-3 py-2 text-center text-xs font-semibold text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("boutique.item.signInToBuy")}
        </Link>
      ) : (
        <button
          onClick={onBuy}
          disabled={purchasing}
          className="mt-auto rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {purchasing ? t("common.loading") : t("boutique.item.buy", { price: formatPriceCents(bundle.priceCents, locale) })}
        </button>
      )}
    </div>
  );
}

type ReturnState =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "success"; newSkus: string[] }
  | { kind: "stillProcessing" }
  | { kind: "giftSuccess"; recipientName: string | null };

/** sessionStorage shape remembered across the Stripe redirect — see the
 * "Return from Stripe Checkout" effect below for why a bare sku array
 * isn't enough once a purchase might be a gift. */
interface PendingPurchase {
  skus: string[];
  giftRecipientId?: string;
  giftRecipientName?: string | null;
}

export function BoutiqueContent() {
  const { t, tPlural } = useT();
  const { configured, user } = useAuth();
  const signedIn = configured && !!user;
  const { ownedSkus, refresh: refreshEntitlements } = useEntitlements(supabase, user?.id);
  const { wishlistSkus, toggle: toggleWishlist } = useWishlist(supabase, user?.id);
  const self = useSelfProfile(signedIn ? user!.id : null);

  const items = useMemo(() => listStoreItems(), []);
  const bundles = useMemo(() => listBundles(), []);
  const everythingBundle = bundles.find((b) => b.kind === "everything");
  const heroBundle = bundles.find((b) => b.kind === "supporter");
  const categoryBundles = bundles.filter((b) => b.kind === "category");

  const [category, setCategory] = useState<BoutiqueFilter>("bundles");
  const [tryOnSku, setTryOnSku] = useState<string | null>(null);
  const [purchasingSku, setPurchasingSku] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [highlightSku, setHighlightSku] = useState<string | null>(null);
  const [returnState, setReturnState] = useState<ReturnState>({ kind: "idle" });
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  const buy = useCallback(
    async (sku: string, gift?: { recipientId: string; recipientName: string | null }) => {
      setPurchaseError(null);
      setPurchasingSku(sku);
      try {
        // Remembered so the return trip (?purchase=success) can celebrate
        // the right item(s) even though the webhook that actually grants
        // them runs asynchronously, after Stripe's own redirect lands us
        // back here with no other way to know what was just bought.
        const pending: PendingPurchase = gift
          ? { skus: [sku], giftRecipientId: gift.recipientId, giftRecipientName: gift.recipientName }
          : { skus: [sku] };
        sessionStorage.setItem("boutique:pendingPurchase", JSON.stringify(pending));
      } catch {
        /* sessionStorage unavailable (private mode etc.) — the return trip
         * falls back to "newly appeared since page load" instead (a gift
         * falls back to a plain "sent!" with no recipient name). */
      }
      try {
        await startPurchase([sku], gift ? { giftRecipientId: gift.recipientId } : undefined);
        // startPurchase redirects the page on success — this line only
        // runs if it threw instead.
      } catch (err) {
        setPurchasingSku(null);
        setPurchaseError(
          err instanceof PurchaseError ? translateError(err.message, t) : t("boutique.error.purchaseFailed")
        );
      }
    },
    [t]
  );

  // ── Gifting ──────────────────────────────────────────────────────────────
  const [giftItemSku, setGiftItemSku] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [giftSendingTo, setGiftSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || !supabase) return;
    setFriendsLoading(true);
    getFriends(supabase)
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setFriendsLoading(false));
  }, [signedIn]);

  const giftItem = giftItemSku ? findStoreItem(giftItemSku) : null;

  const sendGift = useCallback(
    async (friend: Friend) => {
      if (!giftItemSku) return;
      setGiftSendingTo(friend.userId);
      await buy(giftItemSku, { recipientId: friend.userId, recipientName: friend.displayName });
      // buy() redirects to Stripe on success — this only runs after an
      // error. Close the dialog either way so the error banner (rendered
      // on the page itself, below the filter bar) isn't left hidden behind
      // the still-open modal overlay.
      setGiftSendingTo(null);
      setGiftItemSku(null);
    },
    [buy, giftItemSku]
  );

  // ── Deep link (?item=<sku>) — jump to and highlight that item ──────────
  useEffect(() => {
    const sku = new URLSearchParams(window.location.search).get("item");
    if (!sku) return;
    const item = findStoreItem(sku);
    if (item) setCategory(item.category);
    setHighlightSku(sku);
    // Best-effort scroll after the grid has had a render pass. Instant
    // (not "smooth") — an animated scroll has nothing checking it actually
    // finished, where a plain jump either lands or doesn't.
    const id = setTimeout(() => {
      document.getElementById(`boutique-item-${sku}`)?.scrollIntoView({ block: "center" });
    }, 150);
    return () => clearTimeout(id);
  }, []);

  // ── Return from Stripe Checkout ─────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get("purchase");
    if (!purchase) return;

    // Quiet either way — never leaves ?purchase=... sitting in the URL for
    // a refresh/share to re-trigger.
    const url = new URL(window.location.href);
    url.searchParams.delete("purchase");
    url.searchParams.delete("session_id");
    window.history.replaceState(null, "", url.toString());

    if (purchase !== "success") return; // "cancelled" — quiet, back to browsing.
    if (!signedIn || !user) return; // Wait for auth to resolve before polling.

    let pending: PendingPurchase = { skus: [] };
    try {
      pending = JSON.parse(sessionStorage.getItem("boutique:pendingPurchase") ?? '{"skus":[]}');
      sessionStorage.removeItem("boutique:pendingPurchase");
    } catch {
      /* ignore */
    }

    // A gift never changes the PAYER's own entitlements (the friend owns
    // it, not them) — there is nothing to poll for on this account, so
    // celebrate immediately rather than waiting on a signal that will
    // never arrive.
    if (pending.giftRecipientId) {
      setReturnState({ kind: "giftSuccess", recipientName: pending.giftRecipientName ?? null });
      return;
    }

    const initialOwned = new Set(ownedSkus);
    setReturnState({ kind: "processing" });
    pollForEntitlements(supabase, user.id, {
      shouldStop: (skus) =>
        pending.skus.length > 0 ? pending.skus.every((s) => skus.includes(s)) : skus.length > initialOwned.size,
    }).then(({ skus, resolvedEarly }) => {
      if (!resolvedEarly) {
        setReturnState({ kind: "stillProcessing" });
        return;
      }
      const newSkus = pending.skus.length > 0 ? pending.skus : skus.filter((s) => !initialOwned.has(s));
      setReturnState({ kind: "success", newSkus });
      refreshEntitlements({ force: true });
    });
    // Only ever meant to run once, right after landing back from Stripe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, user?.id]);

  const showBundles = category === "bundles";
  const showWishlist = category === "wishlist";
  const filteredItems =
    category === "all" || showBundles
      ? items
      : showWishlist
        ? items.filter((i) => wishlistSkus.has(i.sku))
        : items.filter((i) => i.category === category);
  // Wishlist spans categories like "all" does, so it gets the same
  // per-category headers instead of one flat, unlabeled grid.
  const groupedItems = COSMETIC_CATEGORIES.filter(
    (c) => category === "all" || showBundles || showWishlist || c === category
  ).map((c) => ({
    category: c,
    items: filteredItems.filter((i) => i.category === c),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <BackLink href="/profile" smart />

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("player.tab.boutique")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("boutique.subtitle")}</p>
      </div>

      {/* Filter/sort control bar — moved to the very top so a visitor never
          has to scroll past every bundle to reach it. "Bundles" is one of
          the selectable values here (default-selected — see `category`'s
          initializer), not a separate section below. */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("bundles")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            showBundles ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--elevated)]"
          }`}
        >
          {t("boutique.category.bundles")}
        </button>
        <button
          onClick={() => setCategory("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            category === "all" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--elevated)]"
          }`}
        >
          {t("boutique.category.all")}
        </button>
        {signedIn && (
          <button
            onClick={() => setCategory("wishlist")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              showWishlist ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--elevated)]"
            }`}
          >
            ⭐ {t("boutique.category.wishlist")}
          </button>
        )}
        {COSMETIC_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              category === c ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--elevated)]"
            }`}
          >
            {t(CATEGORY_KEY[c])}
          </button>
        ))}
      </div>

      <PageTip id="boutique" title={t("boutique.tip.title")}>
        {t("boutique.tip.body")}
      </PageTip>

      {configured && !signedIn && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3">
          <p className="text-xs text-[var(--muted)]">{t("boutique.guestBanner.body")}</p>
          <Link
            href="/sign-in"
            className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]"
          >
            {t("signIn.title")}
          </Link>
        </div>
      )}

      {returnState.kind === "processing" && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <LoadingSpinner label={t("boutique.purchase.processing.title")} />
          <p className="text-xs text-[var(--muted)]">{t("boutique.purchase.processing.body")}</p>
        </div>
      )}
      {returnState.kind === "stillProcessing" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <p className="text-xs text-[var(--muted)]">{t("boutique.purchase.stillProcessing")}</p>
          <button
            onClick={() => {
              setReturnState({ kind: "processing" });
              pollForEntitlements(supabase, user?.id, { shouldStop: () => true }).then(({ skus }) => {
                setReturnState({ kind: "success", newSkus: skus });
                refreshEntitlements({ force: true });
              });
            }}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]"
          >
            {t("boutique.purchase.checkAgain")}
          </button>
        </div>
      )}
      {returnState.kind === "success" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent)]/10 p-4">
          <p className="text-sm font-semibold text-[var(--heading)]">
            🎉 {tPlural("boutique.purchase.success", returnState.newSkus.length || 1)}
          </p>
          {(() => {
            // Only offer a single-tap "Equip now" when exactly one plain
            // item (not a multi-category bundle) was purchased — a bundle
            // spans several equip pages at once, so there's no one place
            // to send you.
            const single = returnState.newSkus.length === 1 ? findStoreItem(returnState.newSkus[0]) : undefined;
            return (
              single && (
                <Link
                  href={equipHrefFor(single)}
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]"
                >
                  {t("boutique.purchase.equipNow")}
                </Link>
              )
            );
          })()}
        </div>
      )}
      {returnState.kind === "giftSuccess" && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent)]/10 p-4">
          <p className="text-sm font-semibold text-[var(--heading)]">
            🎁{" "}
            {returnState.recipientName
              ? t("boutique.gift.sentTo", { name: returnState.recipientName })
              : t("boutique.gift.sent")}
          </p>
        </div>
      )}
      {purchaseError && <p className="text-xs text-[var(--danger)]">{purchaseError}</p>}

      {showBundles ? (
        <>
          {everythingBundle && (
            <BundleCard
              bundle={everythingBundle}
              items={items}
              owned={ownedSkus.has(everythingBundle.sku)}
              signedIn={signedIn}
              purchasing={purchasingSku === everythingBundle.sku}
              onBuy={() => buy(everythingBundle.sku)}
              topTier
            />
          )}

          {heroBundle && (
            <BundleCard
              bundle={heroBundle}
              items={items}
              owned={ownedSkus.has(heroBundle.sku)}
              signedIn={signedIn}
              purchasing={purchasingSku === heroBundle.sku}
              onBuy={() => buy(heroBundle.sku)}
              hero
            />
          )}

          {categoryBundles.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {categoryBundles.map((bundle) => (
                <BundleCard
                  key={bundle.sku}
                  bundle={bundle}
                  items={items}
                  owned={ownedSkus.has(bundle.sku)}
                  signedIn={signedIn}
                  purchasing={purchasingSku === bundle.sku}
                  onBuy={() => buy(bundle.sku)}
                />
              ))}
            </div>
          )}
        </>
      ) : filteredItems.length === 0 ? (
        <EmptyState icon={showWishlist ? "⭐" : "🛍️"}>{showWishlist ? t("boutique.wishlist.empty") : t("boutique.empty")}</EmptyState>
      ) : (
        groupedItems.map(
          (group) =>
            group.items.length > 0 && (
              <section key={group.category} className="flex flex-col gap-2">
                {(category === "all" || showWishlist) && (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{t(CATEGORY_KEY[group.category])}</h2>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {group.items.map((item) => (
                    <div key={item.sku} ref={highlightSku === item.sku ? highlightedRef : undefined}>
                      <ItemCard
                        item={item}
                        owned={ownedSkus.has(item.sku)}
                        signedIn={signedIn}
                        purchasing={purchasingSku === item.sku}
                        wishlisted={wishlistSkus.has(item.sku)}
                        onToggleWishlist={signedIn ? () => toggleWishlist(item.sku) : undefined}
                        onGift={signedIn ? () => setGiftItemSku(item.sku) : undefined}
                        onBuy={() => buy(item.sku)}
                        tryOnEnabled={item.category === "avatar_frame" || item.category === "avatar_emoji" || item.category === "banner"}
                        tryOn={tryOnSku === item.sku}
                        onToggleTryOn={() => setTryOnSku((cur) => (cur === item.sku ? null : item.sku))}
                        self={self}
                        highlighted={highlightSku === item.sku}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )
        )
      )}

      <p className="text-center text-[11px] text-[var(--muted)]">
        {t("boutique.finePrint.prefix")}{" "}
        <Link href="/terms#purchases" className="underline hover:text-[var(--muted)]">
          {t("common.terms")}
        </Link>
        {t("boutique.finePrint.suffix")}
      </p>

      <GiftPickerDialog
        open={giftItemSku !== null}
        itemName={giftItem?.name ?? ""}
        friends={friends}
        loading={friendsLoading}
        sending={giftSendingTo}
        onClose={() => setGiftItemSku(null)}
        onPick={sendGift}
      />
    </main>
  );
}
