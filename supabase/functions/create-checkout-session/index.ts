// Books & Runs — starts a real-money Stripe Checkout for the boutique
// store (cosmetics only — see /tmp/wave/store.md's product scope).
//
// Auth required (a real signed-in user, not anon) — same
// createClient(ANON_KEY, { Authorization: <their JWT> }) + auth.getUser()
// pattern solo-verify/mp already use. Request: `{ skus: string[] }` (one
// item, a bundle sku, or several single items in one cart). This function
// NEVER trusts a client-submitted price or name — every sku is resolved
// against the bundled catalog (src/store/catalog.ts, copied in by
// scripts/bundle-checkout-catalog.mjs, same idea as mp's/solo-verify's own
// engine bundle) via the pure, unit-tested src/store/checkout.ts. An
// unknown sku or one this account already owns (checked against
// `entitlements` before ever talking to Stripe) is rejected outright.
//
// No Stripe SDK: same "call the REST API directly with fetch + the secret
// key, form-encoded body" approach stripe-webhook/index.ts already uses
// for signature verification — see that file's own doc for why. The
// Checkout Session is created with inline `price_data` per line item
// rather than pre-created Stripe Products/Prices, so the ~105-item catalog
// never has to be hand-created in the Stripe Dashboard.
//
// Deploy:
//   node scripts/bundle-checkout-catalog.mjs
//   npx supabase functions deploy create-checkout-session
//   npx supabase secrets set STRIPE_SECRET_KEY=sk_live_or_test_...
// (SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically. Stripe
// Dashboard: confirm `checkout.session.completed` is subscribed on the
// SAME webhook endpoint stripe-webhook already uses — it already is, per
// the tip-jar setup; nothing new to add there.)
//
// Optional: STRIPE_AUTOMATIC_TAX=1 turns on Stripe Tax for these sessions
// — only meaningful once Stripe Tax is configured in their Dashboard, off
// (the safe default) otherwise. SITE_URL overrides the success/cancel
// redirect origin (defaults to the production app) — useful for testing
// against a local dev server with a Stripe test key.
//
// Gifting: `{ skus: [sku], recipientId }` buys ONE item for a friend
// instead of yourself. The payer must already be an accepted friend of
// `recipientId` and the friend must not already own the sku — both
// enforced here via migration 0099's boutique_can_gift() RPC, called with
// the payer's own JWT (so it can't be used to probe a non-friend's
// entitlements). The payer's own ownership of the sku is irrelevant for a
// gift, so the "already owned" check below is skipped entirely for a gift
// request. `client_reference_id` stays the payer (their receipt); the
// stripe-webhook grants the entitlement to `metadata.gift_recipient_id`
// instead when it's present — see buildCheckoutSessionParams's own doc.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
// ./_engine/store is a copy of src/store/ with explicit .ts extensions —
// the Supabase deploy bundler doesn't resolve the app's extension-less
// imports. Run `node scripts/bundle-checkout-catalog.mjs` before every
// deploy (and whenever the catalog changes).
import { CATALOG } from "./_engine/store/catalog.ts";
import { buildCheckoutSessionParams, toStripeFormBody } from "./_engine/store/checkout.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://books-and-runs.vercel.app";
const AUTOMATIC_TAX = Deno.env.get("STRIPE_AUTOMATIC_TAX") === "1";

// A generous cap, not a real cart-size product decision — just stops a
// malformed/abusive request from building an enormous line_items list.
const MAX_SKUS_PER_REQUEST = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!STRIPE_SECRET_KEY) {
    console.error("create-checkout-session: STRIPE_SECRET_KEY is not set");
    return json({ error: "store is not configured yet" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sign in first" }, 401);
  const userClient: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "sign in first" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid request body" }, 400);
  }

  const skus = body.skus;
  if (!Array.isArray(skus) || skus.length === 0 || skus.some((s) => typeof s !== "string")) {
    return json({ error: "skus must be a non-empty array of strings" }, 400);
  }
  if (skus.length > MAX_SKUS_PER_REQUEST) return json({ error: "too many items" }, 400);

  const recipientId = typeof body.recipientId === "string" ? body.recipientId : null;
  if (recipientId !== null) {
    if (!UUID_RE.test(recipientId) || recipientId === user.id) {
      return json({ error: "invalid recipient" }, 400);
    }
    if (skus.length !== 1) return json({ error: "gift only one item at a time" }, 400);
    // Friendship + not-already-owned, both checked in one RPC call so a
    // non-friend's entitlements are never exposed to this client at all —
    // see migration 0099's own doc for why this has to be security definer.
    const { data: canGift, error: giftCheckErr } = await userClient.rpc("boutique_can_gift", {
      p_friend: recipientId,
      p_sku: skus[0],
    });
    if (giftCheckErr) {
      const msg = giftCheckErr.message ?? "";
      if (/only gift to a friend/i.test(msg)) return json({ error: "you can only gift to a friend" }, 403);
      console.error("create-checkout-session: boutique_can_gift failed:", giftCheckErr);
      return json({ error: "something went wrong" }, 500);
    }
    if (!canGift) return json({ error: "your friend already owns this" }, 409);
  }

  // What this account already owns — checked with the caller's own RLS-
  // scoped client (entitlements: owner can select their own rows, see
  // migration 0085), so this reads exactly what my_entitlements() would.
  // Irrelevant for a gift (the payer isn't the one receiving the item, and
  // the recipient's ownership was already checked above), so skipped
  // entirely rather than filtering a cart the payer will never own by a
  // set that has nothing to do with them.
  let ownedSkus = new Set<string>();
  if (!recipientId) {
    const { data: ownedRows, error: ownedErr } = await userClient.from("entitlements").select("sku").eq("user_id", user.id);
    if (ownedErr) {
      console.error("create-checkout-session: failed to read entitlements:", ownedErr);
      return json({ error: "something went wrong" }, 500);
    }
    ownedSkus = new Set((ownedRows ?? []).map((r) => r.sku as string));
  }

  const built = buildCheckoutSessionParams({
    userId: user.id,
    skus,
    ownedSkus,
    catalog: CATALOG,
    siteUrl: SITE_URL,
    automaticTax: AUTOMATIC_TAX,
    giftRecipientId: recipientId ?? undefined,
  });
  if (!built.ok) return json({ error: built.error }, built.status);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toStripeFormBody(built.params).toString(),
  });

  const stripeBody = await stripeRes.json().catch(() => null);
  if (!stripeRes.ok || !stripeBody || typeof stripeBody.url !== "string") {
    // Never log the request body (it's fine — no card data ever passes
    // through this function — but Stripe's own error payload can echo
    // back parts of the request) beyond what's needed to debug a broken
    // integration; never log STRIPE_SECRET_KEY, which isn't in this value
    // at all.
    console.error("create-checkout-session: Stripe API error:", stripeRes.status, stripeBody);
    return json({ error: "could not start checkout" }, 502);
  }

  return json({ url: stripeBody.url as string });
});
