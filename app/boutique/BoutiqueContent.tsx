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
import { PlayerAvatar } from "../components/PlayerAvatar";
import { ProfileBanner } from "../components/ProfileBanner";
import { findBannerOption } from "../lib/bannerPresets";
import { CardFace } from "../components/CardFace";
import type { CardFaceId } from "../lib/cardFaceStore";
import { CheckBadge } from "../settings/SwatchPicker";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { fetchAvatarsFor, fetchOwnDisplayName, AvatarInfo } from "../lib/leaderboardStore";
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
import type { Card } from "@/types";

const PREVIEW_CARD: Card = { id: "boutique-preview", suit: "hearts", rank: "7", isWild: false };

const CATEGORY_KEY: Record<CosmeticCategory, TranslationKey> = {
  badge: "boutique.category.badge",
  avatar_frame: "boutique.category.avatar_frame",
  title: "boutique.category.title",
  banner: "boutique.category.banner",
  avatar_emoji: "boutique.category.avatar_emoji",
  card_face: "boutique.category.card_face",
  card_back: "boutique.category.card_back",
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
      // Compact: no room for real text at icon size — a small lettered
      // swatch in the same accent color stands in for it instead.
      return compact ? (
        <span
          className="grid h-full w-full place-items-center rounded-lg border text-xs font-bold"
          style={accent ? { borderColor: accent, color: accent } : undefined}
          aria-hidden="true"
        >
          Aa
        </span>
      ) : (
        <span
          className="rounded-full border px-3 py-1.5 text-xs font-medium"
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
}

function ItemCard({ item, owned, signedIn, purchasing, onBuy, tryOnEnabled, tryOn, onToggleTryOn, self, highlighted }: ItemCardProps) {
  const { t, locale } = useT();
  return (
    <div
      id={`boutique-item-${item.sku}`}
      className={`flex flex-col gap-2 rounded-xl border p-3 transition ${
        highlighted ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
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
}: {
  bundle: StoreBundle;
  items: StoreItem[];
  owned: boolean;
  signedIn: boolean;
  purchasing: boolean;
  onBuy: () => void;
  hero?: boolean;
}) {
  const { t, tPlural, locale } = useT();
  const savings = bundleSavingsPercent(bundle);
  const included = bundle.includes.map((sku) => items.find((i) => i.sku === sku)).filter((i): i is StoreItem => !!i);

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${
        hero
          ? "border-[var(--accent)] bg-gradient-to-br from-[var(--accent)]/15 to-transparent"
          : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`font-bold text-[var(--heading)] ${hero ? "text-lg" : "text-sm"}`}>{bundle.name}</p>
          <p className={`font-semibold text-[var(--accent)] ${hero ? "text-base" : "text-sm"}`}>
            {formatPriceCents(bundle.priceCents, locale)}
          </p>
        </div>
        {hero ? (
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

      {included.length > 0 && (
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
  | { kind: "stillProcessing" };

export function BoutiqueContent() {
  const { t, tPlural } = useT();
  const { configured, user } = useAuth();
  const signedIn = configured && !!user;
  const { ownedSkus, refresh: refreshEntitlements } = useEntitlements(supabase, user?.id);
  const self = useSelfProfile(signedIn ? user!.id : null);

  const items = useMemo(() => listStoreItems(), []);
  const bundles = useMemo(() => listBundles(), []);
  const heroBundle = bundles.find((b) => b.kind === "supporter");
  const categoryBundles = bundles.filter((b) => b.kind === "category");

  const [category, setCategory] = useState<CosmeticCategory | "all">("all");
  const [tryOnSku, setTryOnSku] = useState<string | null>(null);
  const [purchasingSku, setPurchasingSku] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [highlightSku, setHighlightSku] = useState<string | null>(null);
  const [returnState, setReturnState] = useState<ReturnState>({ kind: "idle" });
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  const buy = useCallback(
    async (sku: string) => {
      setPurchaseError(null);
      setPurchasingSku(sku);
      try {
        // Remembered so the return trip (?purchase=success) can celebrate
        // the right item(s) even though the webhook that actually grants
        // them runs asynchronously, after Stripe's own redirect lands us
        // back here with no other way to know what was just bought.
        sessionStorage.setItem("boutique:pendingPurchase", JSON.stringify([sku]));
      } catch {
        /* sessionStorage unavailable (private mode etc.) — the return trip
         * falls back to "newly appeared since page load" instead. */
      }
      try {
        await startPurchase([sku]);
        // startPurchase redirects the page on success — this line only
        // runs if it threw instead.
      } catch (err) {
        setPurchasingSku(null);
        setPurchaseError(err instanceof PurchaseError ? err.message : t("boutique.error.purchaseFailed"));
      }
    },
    [t]
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

    let pending: string[] = [];
    try {
      pending = JSON.parse(sessionStorage.getItem("boutique:pendingPurchase") ?? "[]");
      sessionStorage.removeItem("boutique:pendingPurchase");
    } catch {
      /* ignore */
    }

    const initialOwned = new Set(ownedSkus);
    setReturnState({ kind: "processing" });
    pollForEntitlements(supabase, user.id, {
      shouldStop: (skus) =>
        pending.length > 0 ? pending.every((s) => skus.includes(s)) : skus.length > initialOwned.size,
    }).then(({ skus, resolvedEarly }) => {
      if (!resolvedEarly) {
        setReturnState({ kind: "stillProcessing" });
        return;
      }
      const newSkus = pending.length > 0 ? pending : skus.filter((s) => !initialOwned.has(s));
      setReturnState({ kind: "success", newSkus });
      refreshEntitlements({ force: true });
    });
    // Only ever meant to run once, right after landing back from Stripe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, user?.id]);

  const filteredItems = category === "all" ? items : items.filter((i) => i.category === category);
  const groupedItems = COSMETIC_CATEGORIES.filter((c) => category === "all" || c === category).map((c) => ({
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
      {purchaseError && <p className="text-xs text-[var(--danger)]">{purchaseError}</p>}

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

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            category === "all" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--elevated)]"
          }`}
        >
          {t("boutique.category.all")}
        </button>
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

      {filteredItems.length === 0 ? (
        <EmptyState icon="🛍️">{t("boutique.empty")}</EmptyState>
      ) : (
        groupedItems.map(
          (group) =>
            group.items.length > 0 && (
              <section key={group.category} className="flex flex-col gap-2">
                {category === "all" && (
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
    </main>
  );
}
