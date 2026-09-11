-- Books & Runs — Web Push subscriptions ("your turn" notifications).
-- Run this once in the Supabase SQL editor, after 0001–0019.
--
-- One row per browser subscription (an account can have several — a phone
-- and a laptop both opted in). The endpoint/keys are exactly what
-- PushManager.subscribe() returns and what the `mp` Edge Function needs to
-- send a push (via the `web-push` library and this project's VAPID keys —
-- see supabase/functions/README or the deploy notes for how those get set
-- as function secrets; they're never stored in this table or anywhere in
-- the database).
--
-- Owner-RLS only, same model as solo_saves/favorite_game_configs — the
-- client subscribes/unsubscribes directly, no RPC needed. The Edge Function
-- reads this with the service-role key (bypasses RLS), same as every other
-- table it touches.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: owner select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions: owner insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
-- Lets the client upsert-by-endpoint idempotently (calling subscribe()
-- again on an already-subscribed browser returns the same endpoint) rather
-- than needing to check for an existing row first.
create policy "push_subscriptions: owner update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions: owner delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

do $$ begin
  insert into public.schema_migrations (version) values ('0020_push_subscriptions')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
