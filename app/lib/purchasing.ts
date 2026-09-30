// The ENTIRE client-side surface of "buy this" — deliberately just one
// function. Everything else (the Boutique page, picker deep-links) only
// ever calls startPurchase(); nothing else in the app knows HOW a purchase
// actually happens. Today that's Stripe Checkout via the create-checkout-
// session Edge Function and a full-page redirect. A future native
// (iOS/Android) wrapper swaps this file's internals for a native IAP call
// (StoreKit / Play Billing) that resolves once the purchase completes
// instead of redirecting — every caller stays unchanged (see
// /tmp/wave/store.md's "Native readiness" section).

import { callEdgeFunction } from "./callEdgeFunction";
import { loadSupabase, supabase as liveSupabase } from "./supabaseClient";

const FN_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout-session`
    : "";

export class PurchaseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PurchaseError";
    this.status = status;
  }
}

interface CreateCheckoutSessionResponse {
  url: string;
}

/**
 * Starts a real-money purchase for one or more skus (a single item, a
 * bundle, or several single items in one cart — see store.md's "simple
 * multi-item cart" allowance). Calls the create-checkout-session Edge
 * Function with the signed-in user's own bearer token, then redirects the
 * whole page to the Stripe Checkout URL it returns — there is nothing to
 * await after that beyond the redirect itself, since the purchase finishes
 * on Stripe's own page and control never returns here (the browser lands
 * back on `/boutique?purchase=success|cancelled` instead, a fresh page
 * load — see BoutiqueContent.tsx).
 *
 * `giftRecipientId` buys the single sku for a friend instead of yourself —
 * see migration 0099 and create-checkout-session/index.ts's own doc for
 * the friendship/already-owned checks this triggers server-side. Passing
 * it with more than one sku is rejected by the Edge Function, not here —
 * this function stays exactly what its own name says, "start a purchase",
 * not a place cart-shape rules get duplicated.
 *
 * Throws PurchaseError (never resolves) when: the caller is signed out, an
 * unknown/already-owned sku was requested, a gift target isn't an accepted
 * friend or already owns the item, or the Edge Function otherwise rejects
 * the request — the message is whatever the function's own JSON error body
 * says (via callEdgeFunction), so a caller can show it directly.
 */
export async function startPurchase(skus: string[], opts?: { giftRecipientId?: string }): Promise<void> {
  if (skus.length === 0) throw new PurchaseError("Nothing to buy.", 400);

  const supabase = liveSupabase ?? (await loadSupabase());
  if (!supabase) throw new PurchaseError("Sign in to buy items.", 401);

  const { url } = await callEdgeFunction<CreateCheckoutSessionResponse>(
    supabase,
    FN_URL,
    opts?.giftRecipientId ? { skus, recipientId: opts.giftRecipientId } : { skus },
    PurchaseError,
    { fallbackMessage: "Couldn't start checkout — try again in a moment." }
  );
  if (!url) throw new PurchaseError("Couldn't start checkout — try again in a moment.", 500);

  // A full-page redirect, not router.push — Checkout is Stripe's own
  // hosted page, entirely outside this Next.js app.
  window.location.href = url;
}
