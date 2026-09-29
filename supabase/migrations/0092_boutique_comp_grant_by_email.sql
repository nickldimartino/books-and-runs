-- Books & Runs — follow-up to 0091: comp lookups by email instead of
-- display_name. 0091's `grant_boutique_comp(p_display_names text[])` failed
-- for one of the 4 target accounts because her real display_name has an
-- emoji in it that a plain-text name in that migration didn't match —
-- reported after actually running 0091. Email is a better key here: it
-- doesn't carry decorative characters and isn't something a player
-- casually changes the way a display name is.
--
-- `grant_boutique_comp_by_email(p_emails text[])` — same behavior as
-- 0091's function (grants every individually-purchasable item sku that
-- exists right now, source 'comp', idempotent, never a bundle's own
-- wrapper sku), but looks accounts up by `auth.users.email`
-- (case-insensitive) instead of `leaderboard_entries.display_name`.
-- 0091's original function is left in place — harmless, still useful for
-- a future one-off where only a display name is known.
--
-- Deliberately NOT included in this file: any actual call with real email
-- addresses. This repo is public — customer emails don't belong in git
-- history. Run the grant call by hand in the Supabase SQL editor instead,
-- e.g.:
--   select * from public.grant_boutique_comp_by_email(array['a@example.com', 'b@example.com']);

create or replace function public.grant_boutique_comp_by_email(p_emails text[])
returns table (email text, account_found boolean, skus_granted int)
language plpgsql
as $$
declare
  -- Kept in sync with 0091 — see that file's comment for why these three
  -- categories have to be hand-listed instead of read from cosmetic_unlocks.
  card_face_ids text[] := array[
    'outline','mono','ledger','sketch','shadow','neon','ribbon',
    'engraved','chalk','halo','deco','blueprint','marquee','inked','royal'
  ];
  card_back_ids text[] := array[
    'static','brushed','basketweave','houndstooth','tartan','chevron',
    'quilted','damask','confetti','marble','starfield','filigree',
    'obsidianweave','prismveil','goldleaf'
  ];
  theme_ids text[] := array[
    'arcade','citrus','frost','meadow','sahara','coralsand','aurora','lilac',
    'jade','champagne','verdigris','alabaster','valentines','sweetheart',
    'stpatricks','cloverfield','springdusk','easter','july4th',
    'starsandstripes','halloween','candycorn','thanksgiving','pumpkinspice',
    'hanukkah','festivaloflights','christmas','candycane','newyears','confetti'
  ];
  all_skus text[];
  target_email text;
  uid uuid;
  granted int;
begin
  all_skus := array(
    select cosmetic_type || ':' || cosmetic_key
    from public.cosmetic_unlocks
    where requirement_kind = 'boutique'
  );
  all_skus := all_skus || array(select 'card_face:' || x from unnest(card_face_ids) as x);
  all_skus := all_skus || array(select 'card_back:' || x from unnest(card_back_ids) as x);
  all_skus := all_skus || array(select 'theme:' || x from unnest(theme_ids) as x);

  foreach target_email in array p_emails loop
    select u.id into uid
    from auth.users u
    join public.leaderboard_entries le on le.user_id = u.id
    where lower(u.email) = lower(target_email)
    limit 1;

    if uid is null then
      email := target_email;
      account_found := false;
      skus_granted := 0;
      return next;
      continue;
    end if;

    insert into public.entitlements (user_id, sku, source)
    select uid, sku, 'comp'
    from unnest(all_skus) as sku
    on conflict (user_id, sku) do nothing;
    get diagnostics granted = row_count;

    email := target_email;
    account_found := true;
    skus_granted := granted;
    return next;
  end loop;
end;
$$;

insert into public.schema_migrations (version) values ('0092_boutique_comp_grant_by_email')
on conflict (version) do nothing;
