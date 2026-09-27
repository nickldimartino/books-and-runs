// Books & Runs — Stripe webhook, shared by the "Support the developer" tip
// jar AND the boutique store.
//
// Stripe calls this directly (never the app's own client) the moment a
// checkout completes — either a tip-jar Payment Link (app/tip/page.tsx) or
// a store Checkout Session (the create-checkout-session Edge Function).
// The only thing this does is verify the request really came from Stripe,
// then branch on whether session.metadata carries a `skus` field (only a
// store checkout ever sets it) to decide which ground truth to write:
// store purchases go to `purchases`/`entitlements` (migrations 0085+),
// everything else (every tip, past and future) keeps writing
// supporter_payments (migration 0043) exactly as before — the ☕ Supporter
// badge unlocks off that table, never off anything a browser could claim
// on its own. No Stripe SDK: the signature scheme is a documented
// HMAC-SHA256 over "timestamp.body", small enough to verify directly with
// Deno's own Web Crypto rather than pulling in a dependency for one
// function (same "dependency-free where it's this simple" choice
// errorReporter.ts/analytics.ts already made).
//
// app/tip/page.tsx appends `?client_reference_id=<uid>` to the Payment
// Link URL for a signed-in visitor before sending them to Stripe; a store
// Checkout Session sets the same `client_reference_id` server-side
// instead (see create-checkout-session/index.ts) — either way, that's the
// one thing tying a completed checkout back to an account.
//
// Deploy:
//   npx supabase functions deploy stripe-webhook --no-verify-jwt
//   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
// Then in the Stripe Dashboard: Developers → Webhooks → Add endpoint,
// pointing at this function's URL, subscribed to checkout.session.completed
// only. Copy the "Signing secret" Stripe shows you into the secret above —
// it's per-endpoint, not the same as any API key.
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// --no-verify-jwt matters: Stripe's request carries no Supabase JWT at
// all (it's not a signed-in user calling this), so the platform's default
// auth gate would reject every delivery before this code ever ran. The
// Stripe signature check below is what actually authenticates the caller.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Stripe tolerates (and expects the receiver to tolerate) some clock skew,
// but a signature timestamp far in the past is exactly what a replayed
// request looks like — 5 minutes is Stripe's own documented recommendation.
const TOLERANCE_SECONDS = 300;

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verifies the `Stripe-Signature` header against the raw request body —
 * see https://docs.stripe.com/webhooks#verify-manually. Returns the parsed
 * event on success, or null on any failure (bad header, wrong secret,
 * stale timestamp, no match) — every failure is handled identically by
 * the caller (a 400, nothing written), so there's nothing more specific to
 * report back to a caller that, if this fails, isn't trustworthy anyway. */
async function verifyStripeSignature(rawBody: string, header: string | null): Promise<Record<string, unknown> | null> {
  if (!header || !WEBHOOK_SECRET) return null;

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    })
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return null;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > TOLERANCE_SECONDS) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));

  // Fixed-time-ish comparison — the values are both hex digests of a fixed
  // length, so this isn't hiding a length signal the way it would for
  // variable-length secrets.
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const event = await verifyStripeSignature(rawBody, req.headers.get("Stripe-Signature"));
  if (!event) return new Response("invalid signature", { status: 400 });

  // Only the one event type this endpoint is subscribed to in the Stripe
  // Dashboard is expected, but check anyway rather than assume the
  // dashboard config is what this code believes it is.
  if (event.type !== "checkout.session.completed") return new Response("ok", { status: 200 });

  const session = (event.data as { object?: Record<string, unknown> } | undefined)?.object;
  const sessionId = typeof session?.id === "string" ? session.id : null;
  const userId = typeof session?.client_reference_id === "string" ? session.client_reference_id : null;
  const amountTotal = typeof session?.amount_total === "number" ? session.amount_total : null;
  const currency = typeof session?.currency === "string" ? session.currency : null;

  // A completed checkout with no client_reference_id (someone paid via a
  // bare Payment Link, not through app/tip/page.tsx's own signed-in flow)
  // has no account to credit — still a real tip, just not one this app can
  // attribute, so acknowledge it rather than erroring Stripe into retrying
  // a delivery that will never resolve differently.
  if (!sessionId || !userId || !UUID_RE.test(userId) || amountTotal === null || !currency) {
    return new Response("ok", { status: 200 });
  }

  // Boutique store purchase vs. tip jar: create-checkout-session (unlike
  // the tip jar's bare Stripe Payment Links) always sets
  // metadata.skus — a comma-separated sku list — so that field alone tells
  // the two apart on the one shared webhook endpoint. Anything without it
  // (every tip-jar Payment Link checkout, past and future) falls through
  // to the unchanged tip-jar write below.
  const skusMeta = (session?.metadata as Record<string, unknown> | undefined)?.skus;
  if (typeof skusMeta === "string" && skusMeta.length > 0) {
    const skus = skusMeta.split(",").map((s) => s.trim()).filter(Boolean);
    if (skus.length === 0) return new Response("ok", { status: 200 });

    // Idempotent the same way supporter_payments is: a retried delivery of
    // the same session must not double-write. The receipt row uses the
    // session id as its own natural idempotency key; the entitlement rows
    // use their (user_id, sku) primary key.
    const { error: purchaseErr } = await admin.from("purchases").upsert(
      { user_id: userId, stripe_session_id: sessionId, amount_cents: amountTotal, currency, sku_ids: skus },
      { onConflict: "stripe_session_id", ignoreDuplicates: true }
    );
    if (purchaseErr) {
      console.error("Failed to record purchase:", purchaseErr);
      return new Response("db error", { status: 500 });
    }

    const { error: entitlementsErr } = await admin.from("entitlements").upsert(
      skus.map((sku) => ({ user_id: userId, sku, source: "stripe", stripe_session_id: sessionId })),
      { onConflict: "user_id,sku", ignoreDuplicates: true }
    );
    if (entitlementsErr) {
      console.error("Failed to grant entitlements:", entitlementsErr);
      // 500 so Stripe retries — the purchases row above already landed
      // (upsert + ignoreDuplicates means the retry won't double it), so a
      // retry here safely just finishes granting whichever skus didn't
      // make it the first time.
      return new Response("db error", { status: 500 });
    }

    return new Response("ok", { status: 200 });
  }

  const { error } = await admin.from("supporter_payments").upsert(
    { user_id: userId, stripe_session_id: sessionId, amount_cents: amountTotal, currency },
    { onConflict: "stripe_session_id", ignoreDuplicates: true }
  );
  if (error) {
    console.error("Failed to record supporter payment:", error);
    // 500 so Stripe retries the delivery — this is the one failure mode
    // actually worth a retry (a transient DB error), unlike an
    // unattributed session above.
    return new Response("db error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
