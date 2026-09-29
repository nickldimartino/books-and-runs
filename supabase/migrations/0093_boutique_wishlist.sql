-- Books & Runs — a Boutique wishlist: bookmark an item you're not ready to
-- buy yet. Purely a personal list, same "owner reads/writes their own rows,
-- nobody else can see it" shape as most per-account tables here — unlike
-- user_blocks (0060), there's no second party whose visibility needs
-- protecting, so plain RLS policies are enough; no RPC needed.

create table if not exists public.boutique_wishlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  sku text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, sku)
);

alter table public.boutique_wishlist enable row level security;

drop policy if exists "boutique_wishlist: owner read" on public.boutique_wishlist;
create policy "boutique_wishlist: owner read" on public.boutique_wishlist
  for select using (auth.uid() = user_id);

drop policy if exists "boutique_wishlist: owner insert" on public.boutique_wishlist;
create policy "boutique_wishlist: owner insert" on public.boutique_wishlist
  for insert with check (auth.uid() = user_id);

drop policy if exists "boutique_wishlist: owner delete" on public.boutique_wishlist;
create policy "boutique_wishlist: owner delete" on public.boutique_wishlist
  for delete using (auth.uid() = user_id);

insert into public.schema_migrations (version) values ('0093_boutique_wishlist')
on conflict (version) do nothing;
