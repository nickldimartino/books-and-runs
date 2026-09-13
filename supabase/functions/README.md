# Supabase Edge Functions

## `mp` — multiplayer

The authority for multiplayer games: it runs the real `src/` game engine,
keeps the full state + shuffled deck server-side (in the `mp_game_state`
table, which has **no RLS policies** so no client can read it), validates
every move, and returns each player only their own redacted view.

All the game logic is in [`../../src/mp/adapter.ts`](../../src/mp/adapter.ts)
(pure, unit-tested — `src/mp/adapter.test.ts`). `mp/index.ts` is just auth +
database + routing.

### Deploy

The Supabase deploy bundler does **not** resolve the app's extension-less
relative imports (`./deck`, `../types`, …). So before every deploy, copy the
engine with explicit `.ts` extensions into `mp/_engine/` (gitignored):

```bash
node scripts/bundle-mp-engine.mjs
npx supabase functions deploy mp
```

Re-run the bundle step whenever anything in `src/` changes. The
`supabase-js` dependency is pulled straight from JSR (`jsr:@supabase/supabase-js@2`)
so it needs no import map.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically. Requires `supabase/migrations/0010_multiplayer.sql`
to have been run first.

### Confirm it's live

```bash
npx supabase functions list        # should list `mp`
```

### Smoke test after deploy

With two signed-in test accounts that are already friends:

1. Account A creates a game inviting B (via the app once Stage 3 lands, or a
   direct `POST /functions/v1/mp/create` with a bearer token).
2. Account B `POST /functions/v1/mp/respond` `{ game_id, accept: true }`.
3. Either account `POST /functions/v1/mp/state` `{ game_id }` — confirm the
   response shows full cards only for that caller's own seat, counts for the
   rest, and no `drawPile` contents anywhere.

## `solo-verify` — server-verified solo/pass-and-play stats

Closes the one gap multiplayer never had: a solo/pass-and-play game runs
entirely in the browser (no server referee, so it works fully offline), and
until this function existed, the client wrote its own final stats straight
into `player_stats`/`achievement_counters`/`game_history` — nothing stopped
someone from calling the Supabase client directly and writing whatever
numbers they wanted. This function is the fix: the client sends the game's
starting seed and its full move log (see `app/GameContext.tsx`'s
`getSeed()`/`getMoveLog()`), and this function independently replays the
exact same game through the real engine
([`../../src/solo/replay.ts`](../../src/solo/replay.ts), pure and
unit-tested — `src/solo/replay.test.ts`) before writing anything. A replay
that doesn't hold up — an illegal move, a seed that deals a different game,
a fabricated extra draw — gets the whole submission rejected, no partial
writes. Final `player_stats`/achievement-counter deltas/`game_history` are
all *derived* from the verified replay, never taken from anything the
client claims.

### Deploy

```bash
node scripts/bundle-solo-verify-engine.mjs
npx supabase functions deploy solo-verify
```

Re-run the bundle step whenever anything in `src/` changes — same reasoning
as `mp`'s own bundle step, but with its own `_engine/` copy and a smaller
SKIP list (no `ai/` or `mp/`: solo-verify replays already-concrete logged
moves, never re-runs AI strategy code).

Requires the migration that locks down direct client writes to
`player_stats`/`achievement_counters` (see the migrations README) to have
been run — until then this function and the client's old direct-write path
both work, which is fine during rollout but means the exploit isn't closed
yet.

### Smoke test after deploy

With a signed-in test account, play (and finish) a solo game in the app,
then confirm in the Supabase dashboard that `player_stats.games_played` and
`game_history` both picked up the new game. Then confirm the hole is
actually closed:

```js
// From the browser console, signed in — should now be rejected once the
// RLS-lockdown migration has run:
await window.supabase.from("player_stats").update({ games_won: 999999 }).eq("user_id", (await window.supabase.auth.getUser()).data.user.id);
```

## `contact` — bug reports & feature requests

Takes a submission from the Support page (`app/support/page.tsx`) and emails
it via [Resend](https://resend.com). Exists so the destination address
never has to ship to the client — it lives only in the `SUPPORT_EMAIL`
secret below. Callable while signed out; see the function's own doc for why
that's fine here.

### Deploy

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx SUPPORT_EMAIL=you@example.com
npx supabase functions deploy contact
```

`RESEND_API_KEY` comes from a (free-tier is plenty) [Resend](https://resend.com)
account. Without a verified custom domain, Resend's shared `onboarding@resend.dev`
sender can only deliver to the email address the Resend account itself was
signed up with — which is exactly what you want here if `SUPPORT_EMAIL` is
that same address, so no domain verification is required to get this
working. Verify a real domain later if you want a nicer `from` address or
need `SUPPORT_EMAIL` to differ from the Resend account's own address.

### Smoke test after deploy

`$SUPABASE_URL`/`$SUPABASE_ANON_KEY` aren't real shell env vars — pull them
from `.env.local` (the app's own `NEXT_PUBLIC_...` copies) instead of typing
them by hand:

```bash
export $(grep -E '^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=' .env.local | xargs)
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/contact" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"bug","subject":"test","description":"smoke test"}'
```

Expect `{"ok":true}` and an email at `SUPPORT_EMAIL` within a minute.
