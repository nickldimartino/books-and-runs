-- Books & Runs — `my_entitlements()`, the one stable contract the client
-- codes against to know what boutique skus this account owns. Run once in
-- the Supabase SQL editor, after 0085_boutique_entitlements_purchases.sql.
--
-- `entitlements` already has an owner-read RLS policy (0085), so a client
-- could `select sku from entitlements` directly and get the same rows —
-- this RPC exists anyway as the minimal, stable surface other code should
-- actually call (same reasoning as every other `my_*`/`mp_my_*` RPC in
-- this schema): it can't accidentally leak a column added to entitlements
-- later, and callers don't need to know the table shape at all, just "give
-- me my owned skus".
create or replace function public.my_entitlements()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select sku from public.entitlements where user_id = auth.uid();
$$;

revoke execute on function public.my_entitlements() from anon, public;
grant execute on function public.my_entitlements() to authenticated;

insert into public.schema_migrations (version) values ('0086_my_entitlements_rpc')
on conflict (version) do nothing;
