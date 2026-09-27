-- Books & Runs — the boutique store's ground truth: what an account owns
-- (`entitlements`) and its receipt/order log (`purchases`). Run this once
-- in the Supabase SQL editor, after 0001–0084.
--
-- Same "zero client-facing write access, only the service-role Edge
-- Function writes it" pattern as `supporter_payments` (0043) and
-- `daily_deal_completions` (0036): a real purchase is confirmed by Stripe,
-- server-side, in the `stripe-webhook` Edge Function — never something a
-- browser can claim on its own by inserting a row directly. See
-- /tmp/wave/store.md for the full product contract this table family
-- exists for.
--
--   entitlements — one row per (account, sku) this account actually owns.
--     `sku` follows app/lib/storeSku.ts's "<category>:<itemId>" convention
--     (or "bundle:<bundleId>") — see that file's own doc. `source`
--     distinguishes a real Stripe purchase from the one-time launch
--     grandfather grant (0088, run last, after the launch catalog is
--     final) and anticipates 'apple'/'google' for a future native IAP
--     path (see CODEBASE_MAP.md's "Boutique store" section) — the unlock
--     check (0087) and the client only ever ask "does a row exist for
--     this sku", never "did this come from Stripe specifically", so a
--     future native verify function can insert the exact same shape of
--     row with no other code changing at all.
--   purchases — the receipt/order log: one row per completed Checkout
--     Session (not per sku — `sku_ids` holds the whole cart), for the
--     Account "Download my data" export and support/refund lookups. Kept
--     separate from `entitlements` because a purchase can grant several
--     skus at once (a bundle, or a multi-item cart) and refund/support
--     tooling wants the original order, not just the resulting grants.

create table if not exists public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  sku text not null,
  source text not null check (source in ('stripe', 'launch_grandfather', 'apple', 'google')),
  -- Null for a launch-grandfather grant (there is no checkout session);
  -- set for a real purchase, purely informational (purchases.
  -- stripe_session_id is the real receipt) — handy for a support lookup
  -- straight from an entitlement row without a join.
  stripe_session_id text,
  granted_at timestamptz not null default now(),
  primary key (user_id, sku)
);

alter table public.entitlements enable row level security;

drop policy if exists "entitlements: owner read" on public.entitlements;
create policy "entitlements: owner read" on public.entitlements
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy for authenticated/anon — only
-- stripe-webhook's and the launch-grandfather migration's service-role
-- client ever write this table. A signed-in user cannot grant themselves
-- an entitlement by calling the client directly.

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The Checkout Session id — the natural idempotency key, same reasoning
  -- as supporter_payments.stripe_session_id (Stripe retries a webhook
  -- delivery that didn't get a fast 200 back).
  stripe_session_id text not null unique,
  amount_cents integer not null,
  currency text not null,
  sku_ids text[] not null,
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

drop policy if exists "purchases: owner read" on public.purchases;
create policy "purchases: owner read" on public.purchases
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy — same "service-role only" shape as
-- entitlements above.

insert into public.schema_migrations (version) values ('0085_boutique_entitlements_purchases')
on conflict (version) do nothing;
