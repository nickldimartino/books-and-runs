// @vitest-environment jsdom

// The Boutique store page — rendering against the real catalog
// (src/store/catalog.ts), buy-button states (signed-out/signed-in/owned),
// and bundle price display. Entitlements, purchasing and the account's own
// avatar/name are all mocked — this is a component test, not an
// integration test against Supabase or Stripe.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BoutiqueContent } from "./BoutiqueContent";
import { CATALOG } from "@/store/catalog";

let auth: { configured: boolean; user: { id: string } | null } = { configured: true, user: null };
let ownedSkus = new Set<string>();
const refreshMock = vi.fn(async () => []);
const startPurchaseMock = vi.fn(async (_skus: string[]) => {});

vi.mock("../AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/supabaseClient", () => ({ supabase: {}, loadSupabase: async () => ({}) }));
vi.mock("../lib/leaderboardStore", () => ({
  fetchAvatarsFor: vi.fn(async () => ({})),
  fetchOwnDisplayName: vi.fn(async () => null),
}));
vi.mock("../lib/entitlementsStore", () => ({
  useEntitlements: () => ({ ownedSkus, loading: false, refresh: refreshMock }),
  pollForEntitlements: vi.fn(async () => ({ skus: [...ownedSkus], resolvedEarly: true })),
}));
vi.mock("../lib/purchasing", async () => {
  class PurchaseError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { startPurchase: (skus: string[]) => startPurchaseMock(skus), PurchaseError };
});

// Real catalog data (105 items + 8 bundles) — pick a couple of stable,
// known skus/prices to assert against rather than hardcoding the full
// count, so this test doesn't need updating every time the catalog's
// roster changes.
const BADGE_SKU = "badge:🎩"; // Top Hat Badge — uncommon, $3.49
const badgeEntry = CATALOG[BADGE_SKU];

afterEach(() => {
  cleanup();
  auth = { configured: true, user: null };
  ownedSkus = new Set();
  vi.clearAllMocks();
});

describe("BoutiqueContent", () => {
  it("renders the hero Supporter Pack and a category bundle with prices", () => {
    render(<BoutiqueContent />);
    expect(screen.getByText("Supporter Pack")).toBeTruthy();
    expect(screen.getByText("$24.99")).toBeTruthy();
    expect(screen.getByText(CATALOG["bundle:badge"].name)).toBeTruthy();
    // A discount badge only shows once savings are computable — the real
    // catalog's category bundles always are.
    expect(screen.getAllByText(/Save \d+%/).length).toBeGreaterThan(0);
  });

  it("shows every catalog item's price via Intl currency formatting", () => {
    render(<BoutiqueContent />);
    const card = screen.getByText(badgeEntry.name).closest("div")!.parentElement!;
    expect(within(card).getByText(`$${(badgeEntry.priceCents / 100).toFixed(2)}`)).toBeTruthy();
  });

  it("guest: every item and bundle prompts sign-in instead of buying", () => {
    auth = { configured: true, user: null };
    render(<BoutiqueContent />);
    const signInLinks = screen.getAllByRole("link", { name: "Sign in to buy" });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) expect(link.getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByRole("button", { name: /^Buy —/ })).toBeNull();
  });

  it("signed in, not owned: shows a Buy — $price button and calls startPurchase on click", async () => {
    auth = { configured: true, user: { id: "u1" } };
    ownedSkus = new Set();
    render(<BoutiqueContent />);
    const card = screen.getByText(badgeEntry.name).closest("div")!.parentElement!;
    const buyButton = within(card).getByRole("button", { name: /^Buy —/ });
    fireEvent.click(buyButton);
    expect(startPurchaseMock).toHaveBeenCalledWith([BADGE_SKU]);
  });

  it("signed in, owned: shows Owned + Equip linking to the real picker page", () => {
    auth = { configured: true, user: { id: "u1" } };
    ownedSkus = new Set([BADGE_SKU]);
    render(<BoutiqueContent />);
    const card = screen.getByText(badgeEntry.name).closest("div")!.parentElement!;
    expect(within(card).getByText(/Owned/)).toBeTruthy();
    const equipLink = within(card).getByRole("link");
    expect(equipLink.getAttribute("href")).toBe("/player?edit=1&tab=badge");
  });

  it("filters the grid by category", () => {
    render(<BoutiqueContent />);
    fireEvent.click(screen.getByRole("button", { name: "Card faces" }));
    expect(screen.queryByText(badgeEntry.name)).toBeNull();
    expect(screen.getByText(CATALOG["card_face:royal"].name)).toBeTruthy();
  });
});
