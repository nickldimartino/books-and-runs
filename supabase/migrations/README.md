# Database migrations

These `.sql` files are applied **by hand** in the Supabase SQL editor, in
order. There is no CLI workflow. `public.schema_migrations` (created by
`0016_observability.sql`) records what a project has actually run — every
migration from 0016 on ends by inserting its own version row, so:

```sql
select version, applied_at from schema_migrations order by version;
```

tells you a project's real state.

## Applying a migration

1. Open the file, paste the whole thing into the Supabase SQL editor, run it.
2. Migrations are written to be safe to re-run (`create table if not exists`,
   `create or replace function`, `on conflict do nothing`), so a partial
   failure can be fixed and the file re-run.
3. Confirm with the query above.

## The list

| # | What it adds |
|---|---|
| 0001 | accounts, `player_stats`, `game_history` |
| 0002 | `achievement_counters` |
| 0003–0005 | `worst_score`, `games_tied`, `winner_score` columns |
| 0006 | `leaderboard_entries` (public, self-reported) |
| 0007–0008 | Daily Deal streak / last-played, cross-device |
| 0009 | Friends — `profiles` + friend codes, `friendships`, `mp_events`, RPCs |
| 0010 | Multiplayer — `mp_games`, sealed `mp_game_state`, `mp_participants`, RPCs |
| 0011 | MP stats — `mp_my_stats()`, `mp_*` columns on `leaderboard_entries` |
| 0012 | one-tap friend links (`mp_add_friend_by_code`) |
| 0013 | security hardening — `WITH CHECK` policies, name constraint, RPC rate limit |
| 0014 | MP housekeeping — `mp_trim_events`, daily `pg_cron` sweep |
| 0015 | `solo_saves` — sync the in-progress solo/pass-and-play game |
| 0016 | observability — `schema_migrations`, `client_errors`, `app_events` |
| 0017 | `mp_nudge()` — "your turn" reminder, rate-limited |
| 0018 | `daily_deal_scores` — per-deal friend leaderboard (`daily_deal_submit`, `daily_deal_friend_scores`) |

## New migrations

Name `NNNN_short_description.sql`, and end the file with:

```sql
insert into public.schema_migrations (version) values ('NNNN_short_description')
on conflict (version) do nothing;
```
