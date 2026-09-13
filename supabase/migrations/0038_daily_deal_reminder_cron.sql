-- Books & Runs — schedule the Daily Deal streak-at-risk push.
-- Run this once in the Supabase SQL editor, after 0001–0037, and after:
--   1. `daily-deal-reminder` has been deployed (see
--      supabase/functions/README.md) with a CRON_SECRET function secret set
--      (`npx supabase secrets set CRON_SECRET=<a random value you pick>` —
--      generate one with `openssl rand -hex 32` or similar; never commit it).
--   2. That same CRON_SECRET has been stored in this project's Vault — run
--      once, by hand, in the SQL editor (NOT part of this migration file,
--      so the secret itself is never committed to the repo):
--        select vault.create_secret('<the same random value>', 'daily_deal_reminder_cron_secret');
--   3. The `pg_cron` and `pg_net` extensions are enabled (Database →
--      Extensions).
--
-- Below, replace <YOUR-PROJECT-REF> with this project's ref (the subdomain
-- in its Supabase URL, e.g. abcdefghijklmnop) before running.

do $$
begin
  perform cron.schedule(
    'daily-deal-reminder',
    -- Once a day, 20:00 UTC — see the function's own doc for why this can't
    -- line up with every account's actual local evening.
    '0 20 * * *',
    $cron$
    select net.http_post(
      url := 'https://<YOUR-PROJECT-REF>.functions.supabase.co/daily-deal-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'daily_deal_reminder_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
exception
  when undefined_function or undefined_table or invalid_schema_name then
    raise notice 'pg_cron/pg_net not enabled, or the Vault secret is missing — see this file''s own header, then re-run this block.';
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0038_daily_deal_reminder_cron')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
