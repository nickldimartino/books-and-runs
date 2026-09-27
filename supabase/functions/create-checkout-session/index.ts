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

  // What this account already owns — checked with the caller's own RLS-
  // scoped client (entitlements: owner can select their own rows, see
  // migration 0085), so this reads exactly what my_entitlements() would.
  const { data: ownedRows, error: ownedErr } = await userClient.from("entitlements").select("sku").eq("user_id", user.id);
  if (ownedErr) {
    console.error("create-checkout-session: failed to read entitlements:", ownedErr);
    return json({ error: "something went wrong" }, 500);
  }
  const ownedSkus = new Set((ownedRows ?? []).map((r) => r.sku as string));

  const built = buildCheckoutSessionParams({
    userId: user.id,
    skus,
    ownedSkus,
    catalog: CATALOG,
    siteUrl: SITE_URL,
    automaticTax: AUTOMATIC_TAX,
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
