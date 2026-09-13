# Books & Runs — Codebase Map

A navigation guide for the whole repo: what each area does, how the pieces
fit, and where to look when you want to change something. Pair this with the
file-level comment blocks — most files open with a paragraph on their own
role; this document is the view from above.

> **Heads-up for the Next.js parts:** this repo runs a modified Next.js. See
> `AGENTS.md` — read `node_modules/next/dist/docs/` before touching routing,
> config, or rendering conventions. The app is a **static export**
> (`next.config.ts` → `output: "export"`): there is no server, no API routes,
> no request-time rendering. Anything dynamic is either client-side or lives
> in Supabase.

---

## 1. The big picture

Books & Runs is a Contract Rummy card game with three ways to play:

| Mode | Where the game runs | Needs an account? |
|---|---|---|
| **Solo / pass-and-play** | 100% in the browser | No |
| **Daily Deal** | In the browser, seeded shuffle by date | No (syncs streak if signed in) |
| **Weekly Challenge** | In the browser, seeded shuffle by ISO week — full 7-round game vs. 3 Hard AIs | No (syncs streak if signed in) |
| **Async multiplayer** | Authoritative state in Supabase, moves via an Edge Function | Yes |

Three layers, from pure to plugged-in:

```
  src/            Pure TypeScript game engine. No React, no Supabase, no DOM.
    │             Fully unit-tested (199 tests). This is the rules.
    │
  app/            Next.js static-export app (React 19). Renders the engine,
    │             holds all UI, talks to Supabase for accounts/stats/MP.
    │
  supabase/       Postgres schema (hand-run .sql migrations) + one Deno
                  Edge Function that runs src/ server-side for multiplayer.
```

The golden rule: **`src/` never imports from `app/` or `supabase/`.** The
engine is consumed by the app (directly) and by the Edge Function (via a
build-time copy — see §6).

---

## 2. `src/` — the game engine

Everything here is a pure function of its inputs. `GameState` (defined in
`types.ts`) is a plain JSON-serializable object that every engine function
reads and mutates in place.

| File | Role |
|---|---|
| `types.ts` | The shared vocabulary: `Card`, `Meld`, `Player`, `ContractRequirement`, `GameState`, `CONTRACTS` (the 7 standard rounds), `SHORT_GAME_CONTRACTS`. |
| `deck.ts` | Build a deck, shuffle it, deal it. `decksForPlayerCount`, `seededRng` (for Daily Deal). Every fn takes an optional `rng`. |
| `scorer.ts` | End-of-round hand penalty values (`cardPenalty`, `handPenalty`). Low score wins. |
| `meld.ts` | **The hard part.** Is a group a legal book/run? Can a hand complete a contract? Wild-card placement rules. `validateManualGroup`, `solveContract`, `solveWholeHandContract`, `layOffOptions`, `RUN_ORDER`. |
| `gameEngine.ts` | The turn state machine. `createGame`, `drawFromPile`/`drawFromDiscard`, `meldChosenGroups`/`attemptMeldContract`, `layOffCard`, `discardAndAdvance`, `startNextRound`. Also `eligibleBuyers`/`buyDiscard` (the "buy the discard" rule — engine-complete but disabled in the app, see `BUY_DISCARD_ENABLED` in `GameContext`). |
| `ai/index.ts` | `playAITurn(state)` — runs one full AI turn through the same engine calls a human's UI makes. `aiWantsToBuyDiscard`. |
| `ai/strategy.ts` | The `AIStrategy` interface + shared helpers (`MISTAKE_CHANCE`, `dangerScore`, `deadCards`, lay-off planners). No strategy of its own. |
| `ai/{beginner,easy,medium,hard,expert}.ts` | One strategy object per difficulty. Beginner = fully random; each harder tier adds judgment and lowers its "human lapse" rate. Headers in each file explain the specific behaviour. |
| `tutorial.ts` | Builds the scripted (non-random) deal the interactive tutorial runs on. Step copy + gating live in `app/lib/tutorialSteps.ts`. |
| `leveling.ts` | Account level / XP as a pure function of progress data. `computeTotalXp`, `ACHIEVEMENT_TIER_XP`. |
| `achievements.ts` | 44 families × 5 tiers = 220 achievements. Pure: `allAchievements(progress)` → unlocked/locked. `AchievementProgressState` is the input shape. |
| `mp/adapter.ts` | The pure core of multiplayer: `dealGame`, `applyDraw`, `applyCommit`, `applyResign`, `advanceThroughAi`, `redactFor`. Transactional via `structuredClone`. |
| `mp/types.ts` | MP adapter types: `MpSeat`, `MpConfig`, `MpEngine`, `RedactedView`, `RoundResult`. |
| `moveLog.ts` | `MoveLogEntry` — one atomic draw/meld/lay-off/discard, human or AI, appended to alongside `GameState` for solo/pass-and-play games (see `app/GameContext.tsx`'s `moveLogRef`). |
| `replayStats.ts` | Pure achievement-counter-delta functions (`drawDeltas`, `meldDeltas`, `layOffDeltas`, `roundWonDeltas`, `discardDeltas`, `tableCompositionDeltas`, `finalGameDeltas`) — the one place "what counts" is defined, shared by live play and the server-side replay below. |
| `solo/replay.ts` | `replaySoloGame(seed, seats, contracts, moveLog)` — independently replays a finished solo/pass-and-play game through the real engine and derives its counter deltas; the pure core the `solo-verify` Edge Function wraps. |
| `demo.ts` | `npm run demo` — plays a full 5-AI game headless. Its job is the stuck-round guard. |
| `testHelpers.ts` | Test-only builders (`makeCard`, `makeHand`, `makePlayer`). Not shipped. |
| `*.test.ts` | Vitest suites, colocated. `npm test`. |

**Key conventions**
- `YOU_PLAYER_ID = "human-0"` (defined in `src/types.ts`, re-exported from
  `app/lib/recordGameResult.ts` for existing importers) is the seat that
  counts as "the signed-in account" in pass-and-play. Achievement counters
  and stats only ever move for that seat.
- A turn = draw → (optionally) meld the whole contract at once → lay off →
  discard. You cannot lay off until you've melded your own contract.
- Round `N` is a position into `state.selectedContracts`, not a fixed 1–7 —
  short and custom games reorder/drop rounds.
- Every solo/pass-and-play game is seeded (`GameContext.tsx`'s
  `gameSeedRef`, `deck.ts`'s `roundSeed`) and its move log recorded
  (`moveLogRef`) — together, everything the `solo-verify` Edge Function
  needs to independently replay and verify a finished game before
  `player_stats`/`achievement_counters`/`game_history` change at all. See
  §4's "Finishing a solo game" data flow and `supabase/functions/README.md`.

---

## 3. `app/` — the Next.js app

### 3a. Providers & sync (mounted once, in `app/layout.tsx`)

```
AuthProvider
  └ AccountSettingsSync     pulls synced Settings/Theme/Card back/Card face → localStorage on sign-in
  └ PlayerLevelProvider     current level/XP, refetched after each game
      └ PendingSaveSync     retries game saves that failed offline
      └ GameProvider        THE local game — state, actions, AI loop, saves
```

| File | Role |
|---|---|
| `app/AuthContext.tsx` | Supabase auth wrapper. Sign in/up/out, password reset. All of it optional — `isSupabaseConfigured` gates it, and the game works with no project connected. |
| `app/GameContext.tsx` | **The heart of local play.** Holds the live `GameState`, exposes every action the game screen calls, runs the AI loop (`runAiLoop`), auto-saves to localStorage, and publishes `flightEvent` animation hints. ~1000 lines; start here for any solo-game behaviour. |
| `app/PlayerLevelContext.tsx` | Level/XP for the header badge; `refresh()` after a game so it updates without a reload. |
| `app/PendingSaveSync.tsx` | Background sync helper (see the "Data flows" section below). |
| `app/AccountSettingsSync.tsx` | Pull side of `app/lib/accountSettingsSync.ts` — see the `settingsStore.ts` row below for the push side and why this exists. |

### 3b. Routes (`app/**/page.tsx`)

| Route | Purpose |
|---|---|
| `/` (`page.tsx`) | Home. New Game button + `<HomeGames>` "Your games" list (local save + active MP games + pending invites). Daily Deal + Weekly Challenge entries. Level badge. |
| `/new-game` | Fork screen: Solo & pass-and-play / With friends / tutorial link. |
| `/new-game/local` | The solo game setup form (players, difficulty, round mode). |
| `/new-game/multiplayer` | MP game setup — pick friends + AI seats, choose rounds, send invites. |
| `/game` | **The solo game screen.** ~1400 lines. Renders `GameContext`'s state: hand drawer, table melds, piles, `OpponentStrip`, meld builder, tutorial overlay, card-flight layer. |
| `/multiplayer/play?g=<id>` | **The MP game screen.** Driven by `useMpGame`; two-round-trip turns (draw, then commit). |
| `/multiplayer`, `/multiplayer/new`, `/stats` | Client redirect stubs for old links (hub was folded into `/` and `/new-game`; `/stats` was merged into `/player`). |
| `/player?id=<uuid>` | **Profile page**, public top + private bottom. Top (avatar, display name, bio, level, public stat tiles from `leaderboard_entries`) renders the same for anyone; reachable by clicking a name on the Leaderboard/Friends page. Your own additionally shows "Edit profile" (avatar/name/bio, with live display-name-uniqueness checking) and, below that, a private section only you see — the old `/stats` page's detailed stats breakdown, achievement showcase, and game/MP history. |
| `/achievements` | All 220 achievements by family, unlocked state, progress. |
| `/leaderboard` | One row per account (self-reported snapshot). Sortable. Add-friend button per row; names link to `/player`. |
| `/friends` | Friend list, incoming/outgoing requests, friend code + share link (`?add=BR-XXXXX`); names link to `/player`. |
| `/history` | Local (device) game history. |
| `/scorecard` | Standalone pen-and-paper scorekeeper (no engine — just a score grid). |
| `/settings`, `/settings/theme`, `/settings/card-back`, `/settings/card-face` | House rules, theme picker (38 themes), card-back picker, card-face picker (6 styles). Every preference here syncs to the account when signed in — see `accountSettingsSync.ts`. |
| `/account` | Email/password, 2FA, data export, danger zone. Links out to `/player` for display name/bio/avatar, which live there now. |
| `/how-to-play` | Rules reference. `BackLink` returns to wherever you came from (`?from=game`). |
| `/sign-in`, `/reset-password`, `/privacy`, `/terms` | Auth + legal. |
| `/support` | Bug report / feature request form (type dropdown, subject, description, optional reply-to email, up to 5 attachments). Submits to the `contact` Edge Function, which emails it — the destination address is a Supabase secret, never shipped to the client. Works signed out. Linked from the Home footer and Settings' Help section. |
| `layout.tsx`, `manifest.ts` | Root layout, PWA manifest. Loads `public/init.js` — a plain synchronous `<script src>` (not `next/script`, deliberately — see the file's own comment) that applies the saved theme/colorblind/card-back/intro-splash state before first paint, so there's no flash of the wrong theme. |
| `ServiceWorkerRegistrar.tsx` | Mounted in the root layout; registers `public/sw.js`, **production only**. A dev-mode registration used to shadow local code changes with a stale cache — a confusing "why isn't my edit showing up" trap that can persist across dev-server restarts, since the cache lives in the browser, not the server. Offline shell caching — plain runtime caching, no build-time precache manifest. Push (a separate opt-in) is `pushSubscriptions.ts` + the Settings page. Also re-checks for a new deploy on every `visibilitychange` and fires `br:sw-update-available` once a newer service worker actually takes over — the standalone-app equivalent of a browser tab's reload button, since a home-screen install has no such button of its own. |
| `UpdateAvailableBanner.tsx` | Mounted in the root layout; listens for `br:sw-update-available` and shows a dismissible "new version ready" banner with a Refresh button. Never auto-reloads — see `ServiceWorkerRegistrar.tsx`'s own doc for the detection side. |
| `public/sw.js`, `public/offline.html` | The service worker itself (fetch caching + `push`/`notificationclick` handlers) and its precached offline fallback page — plain static files, not part of the Next build. |

### 3c. Components (`app/components/`)

| Component | Used by | Role |
|---|---|---|
| `PlayingCard.tsx` / `CardFace.tsx` | everywhere | The rendered card. `CardFace` is the SVG face; `PlayingCard` wraps it with state (selected, wild badge, back). |
| `DraggableHand.tsx` | game screen | The player's hand — drag to reorder, tap to select for melding. |
| `HandPreviewBar.tsx` | game screen | The collapsed "your hand" bar that opens the drawer. |
| `Piles.tsx` | game + MP screens | Draw pile + discard pile with stable per-card jitter. |
| `OpponentStrip.tsx` | game + MP screens | Sticky top strip: one chip per opponent; tap for a header-style activity popover (last pickup / last discard / bio). |
| `CardFlightLayer.tsx` | game screen | `forwardRef` + `fly()` — animates card clones from A→B. Pure presentation; no-ops under reduced-motion. |
| `TutorialOverlay.tsx` | game screen | The coach-mark bubbles positioned over `data-tutorial="…"` targets. |
| `GameOverScreen.tsx` | game screen | Final standings, share image, **records the game** (stats/achievements/XP/leaderboard), shows achievement unlocks. |
| `RoundSummary.tsx` | game + MP screens | Between-round panel; also flushes per-round achievement progress and shows mid-game unlocks. |
| `AchievementUnlock.tsx` / `AchievementIcons.tsx` | round summary + game over + MP | Shared "you unlocked this" card; one line-art icon per achievement category. |
| `Confetti.tsx` | game over | Win celebration. |
| `PassGate.tsx` / `BuyOfferGate.tsx` | game screen | "Pass the device to X" interstitial; the (disabled) buy-the-discard offer. |
| `CardFanHero.tsx` | home | The decorative fanned-cards hero. |
| `LoadingSpinner.tsx` | data pages | A card-flip loading state. |
| `PageTip.tsx` | Home, New Game (×3), MP play, Settings, Achievements | A first-visit-only dismissible banner (see `tipsStore.ts`); permanently replaced several pages' old always-visible explanatory paragraphs. |
| `IntroSplash.tsx` | home | The one-time "dealing" animation on first visit to `/` this session (`sessionStorage`, not `tipsStore` — replays every new session, purely decorative). |

### 3d. Stores & helpers (`app/lib/`)

**Local persistence (localStorage, `booksAndRuns:*` keys)**

| File | Key / purpose |
|---|---|
| `localSave.ts` | `savedGame` — the one in-progress solo game (`SavedGame`). |
| `settingsStore.ts` | `settings` — house rules (`HouseSettings`): preferred difficulty, sound, haptics. |
| `themeStore.ts` | `theme` — 38 themes, applied via `[data-theme]` before paint. |
| `cardBackStore.ts` | `cardBack` — card-back identity ("match" = mirror the table theme). |
| `cardFaceStore.ts` | `cardFace` — 6 card-face drawing styles (default `classic`); read live via `useCardFace()` inside `CardFace.tsx` itself, not prop-drilled. |
| `colorblindStore.ts` | `colorblindMode` — `[data-colorblind]` override for 3 card colours. |
| `accountSettingsSync.ts` | Mirrors the five stores above to the account (migration 0022's `settings` table) when signed in — push helpers (`pushTheme`/`pushCardBack`/`pushCardFace`/`pushColorblindMode`/`pushHouseSettingsPatch`, the last debouncing the two volume sliders) called from each picker's own change handler; `applyAccountSettings` (pull side, called from `AccountSettingsSync.tsx`) only overwrites a field the account has actually set, and fires a `br:settings-synced` event so an already-mounted page picks it up live. Exists because a fresh "Add to Home Screen" install gets its own empty local storage on iOS. |
| `tipsStore.ts` | `seenTips` — which first-visit page tips (`PageTip.tsx`) have been dismissed; "Show again" in Settings clears it. |
| `dailyDealStore.ts` | `dailyDeal` — Daily Deal results + streak; seeded deal by calendar date. |
| `dailyDealLeaderboard.ts` | Per-deal friend leaderboard (migration 0018): `submitDailyDealScore`, `fetchDailyDealFriendScores`. |
| `weeklyChallengeStore.ts` | `weeklyChallenge` — Daily Deal's bigger, harder sibling: full 7-round game vs. 3 Hard AIs, seeded deal by ISO week (`isoWeekKey`). Own results + streak, own save slot (`localSave.ts`'s `WEEKLY_CHALLENGE_SAVE_KEY`). No per-challenge friend leaderboard yet. |
| `favoriteGameConfig.ts` | "My usual" saved solo/pass-and-play setup (localStorage): load/save/describe + `contractsFor` / `playerConfigsFor` deal helpers. |
| `scorecardStore.ts` | `scorecard` — the standalone scorekeeper's grid. |
| `pushSubscriptions.ts` | Web Push opt-in (Settings page): register `public/sw.js`, subscribe/unsubscribe via `PushManager`, keep `push_subscriptions` (migration 0020) in step. The actual send is server-side — see `mp/index.ts`'s `sendPushForEvent`. |
| `pendingSaveQueue.ts` | `pendingSaves` — finished games whose Supabase write failed; retried by `PendingSaveSync`. |

**Recording a finished game (the write path)**

`player_stats`/`achievement_counters`/`game_history` no longer accept direct
client writes at all (migration 0035) — every write to them is
server-verified, derived from a replay/the real engine, never taken on a
client's word. See §8 for the full design.

| File | Role |
|---|---|
| `recordGameResult.ts` | Just `YOU_PLAYER_ID` (re-exported from `src/types.ts`) and the shared `RoundHistoryEntry` shape now — the write itself moved server-side (see `verifySoloGame.ts` below and `mp/index.ts`'s `recordMpGameOutcome`). |
| `verifySoloGame.ts` | Client side of the solo-verify flow: `buildSoloVerifyPayload` (seed + move log + seats + contracts from `GameState`/`GameContext`) and `verifySoloGame` (calls the Edge Function, throws `SoloVerifyError` on rejection). |
| `pendingSaveQueue.ts` | Queues a `verifySoloGame` payload that couldn't reach Supabase (offline/network failure only — a genuine rejection is never queued, since replaying the same payload later would just fail identically) for `PendingSaveSync` to retry. |
| `leaderboardStore.ts` | `syncLeaderboardStats` — self-reported upsert into `leaderboard_entries` (core stats + a best-effort separate MP-columns upsert); `level`/`total_xp`/`games_played`/`games_won`/`average_score`/`worst_score` specifically get silently overwritten server-side by a trigger (migration 0035) regardless of what's pushed here. |
| `loadAchievementProgress.ts` | `loadAchievementProgressState` — assembles the `AchievementProgressState` the Achievements/Profile pages need (player_stats + counters + MP stats). |

**Multiplayer**

| File | Role |
|---|---|
| `mpStore.ts` | Client → Edge Function (`create`/`respond`/`state`/`move`/`resign`) + read-only RPC lists (`getMyMpGames`, `getMyMpHistory`, `getMyMpStats`). `MpError`. |
| `useMpGame.ts` | The MP play-screen hook. Turn drafting (`draw` then `commit`); stats/achievement-counter crediting happen server-side now (see `mp/index.ts`) — this just diffs a progress snapshot at game-over to show what unlocked. |
| `useNotifications.ts` | One combined Realtime hook: friend requests + game requests + your-turn count → a single badge. Replaced `useFriendActivity` + `useMpActivity`. |
| `friendsStore.ts` | Friend RPC wrappers (`getFriends`, `sendFriendRequest`, `addFriendByCode`, …). |

**Small pure formatters** — `formatNames.ts` (`joinNames`), `formatScore.ts`
(shared int/decimal/`—` rendering), `achievementFormat.ts`, `aiPersonas.ts`
(cosmetic AI name + blurb, New-Game-time only).

**Platform** — `supabaseClient.ts` (the singleton + `isSupabaseConfigured`),
`sound.ts` (Web Audio synthesis, no files), `haptics.ts` (Capacitor / `navigator.vibrate`),
`shareCard.ts` (canvas → PNG standings image).

---

## 4. Data flows

### Finishing a solo game
```
game/page.tsx  →  GameContext (state hits gameOver; owns the game's seed +
                   move log the whole way through — see gameSeedRef/moveLogRef)
               →  GameOverScreen mounts
                    ├ snapshot achievement progress (localStorage)
                    ├ buildSoloVerifyPayload(state, seed, moveLog, ...)
                    ├ verifySoloGame() → Edge Function `solo-verify`:
                    │     replays the game from seed+moveLog through the
                    │     real engine (src/solo/replay.ts) — a replay that
                    │     doesn't hold up rejects the whole submission —
                    │     then writes player_stats/achievement_counters/
                    │     game_history from the verified result
                    ├ syncLeaderboardStats()      → leaderboard_entries
                    ├ PlayerLevelContext.refresh()
                    └ diff snapshot → show AchievementUnlock card
   (a network failure → pendingSaveQueue → PendingSaveSync retries later;
   a genuine rejection is not retried — see verifySoloGame.ts)
```
No seed (a save from before this shipped) → that one game is skipped
entirely, same treatment as the "track stats" opt-out.

### An async multiplayer turn
```
multiplayer/play  →  useMpGame
   getMpState        → mpStore → Edge Function → redacted view
   [player drafts turn locally: groups, layoffs, discard]
   draw              → Edge Function: applyDraw   → returns the drawn card
                                                   → credits achievement counters
                                                     for the caller's own seat
   commitTurn        → Edge Function: applyCommit → validates + advanceThroughAi
                                                   → writes mp_game_state
                                                   → credits achievement counters
                                                     (derived from what was
                                                     just verified, not the
                                                     client's own claim)
                                                   → returns new redacted view
   on gameOver: Edge Function's finalizeParticipants also runs
                recordMpGameOutcome() → player_stats + game_history for every
                human participant, before the response is even sent — the
                client just diffs a progress snapshot to show what unlocked
```
The Edge Function is the **only** reader/writer of `mp_game_state` (the sealed
full state + deck) — and, as of this change, the only writer of
`player_stats`/`achievement_counters`/`game_history` for a multiplayer game
too (closing a gap where a client could otherwise call `recordMpGameResult`
directly with a fabricated result). Clients never see another hand or the
draw pile.

### Achievements / XP
All pure (`src/achievements.ts`, `src/leveling.ts`). The app just assembles an
`AchievementProgressState` from Supabase (`loadAchievementProgress.ts`) and
renders `allAchievements()` / `computeTotalXp()`. There is no "unlocked" flag
stored — unlock = current value ≥ tier threshold, always recomputed.

---

## 5. `supabase/` — backend

### Migrations (`supabase/migrations/`, run by hand in the SQL editor, in order)

| # | Adds |
|---|---|
| 0001 | Accounts + `player_stats` + `game_history` (RLS). |
| 0002 | `achievement_counters`. |
| 0003–0005 | `worst_score`, `games_tied`, `winner_score` columns. |
| 0006 | `leaderboard_entries` (one public row per account, self-reported). |
| 0007–0008 | Daily Deal streak + last-played, cross-device. |
| 0009 | **Friends:** `profiles` (+ friend codes `BR-XXXXX`), `friendships`, `mp_events` inbox, friend RPCs. |
| 0010 | **Multiplayer:** `mp_games`, `mp_game_state` (RLS on, **zero policies** → unreachable), `mp_participants`, `mp_my_games`/`mp_my_history`/etc. RPCs. |
| 0011 | MP stats: `mp_my_stats()` RPC + `mp_games_played/won/best_win_streak` on `leaderboard_entries`. |
| 0012 | One-tap friend links: `mp_add_friend_by_code()` + `friendships replica identity full` (so accept/unfriend reach both parties over Realtime). |
| 0013 | Security hardening: `WITH CHECK` on self-report UPDATE policies, display-name constraint, `mp_rate_limit` + `mp_bump_rate_limit()`. |
| 0014 | MP housekeeping: `mp_trim_events()`, `mp_housekeeping()` + daily `pg_cron`. |
| 0015 | `solo_saves` (owner-only) — cloud sync of the in-progress solo/pass-and-play game (`LocalSaveSync`). |
| 0016 | Observability: `schema_migrations` (version tracking, backfilled), `client_errors` (insert-only), `app_events` (anonymous analytics). |
| 0017 | `mp_nudge()` — "your turn" reminder for a stalled MP game, rate-limited. |
| 0018 | `daily_deal_scores` (owner-only) + `daily_deal_submit()` / `daily_deal_friend_scores()` — per-deal friend leaderboard on the Daily Deal game-over screen. |
| 0019 | `favorite_game_configs` (owner-only) — syncs "my usual" solo/pass-and-play setup across devices. |
| 0020 | `push_subscriptions` (owner-only) — Web Push endpoints; sent from the `mp` function's `addEvent()` via VAPID (`your_turn`/`game_request`/`nudge` only). |
| 0021 | `bio` column on `leaderboard_entries` (140 chars, same shape as `display_name`) — set on Account, shown in OpponentStrip's popover for a multiplayer opponent (fetched client-side via `mp_participants` + `leaderboardStore.fetchBiosFor`, no Edge Function change needed). |
| 0022 | Extends `settings` (0001) with `theme`/`card_back`/`card_face`/`colorblind_mode`/`meld_hints`/`highlight_layoffs`/`show_whose_turn`/`sound_volume`/`ambient_music_enabled`/`ambient_volume` — every Settings/Theme/Card back/Card face preference now syncs to the account, not just AI difficulty. See `accountSettingsSync.ts`. |
| 0023–0034 | Cosmetics/profile evolution (avatar frames, titles, banners, badges, showcase, Creator badge, a much larger cosmetic catalog) — see `supabase/migrations/README.md` for the full list; not restated here. |
| 0035 | Closes the solo-stats hole: drops the owner insert/update policies on `player_stats`/`achievement_counters` (only `solo-verify`'s and `mp`'s service-role writes reach them now — same zero-client-RLS idea as `mp_game_state`), and a trigger overwriting `leaderboard_entries`' `level`/`total_xp`/`games_played`/`games_won`/`average_score`/`worst_score` with server-recomputed values on every write. |
| 0036 | Same fix for the Daily Deal streak: `daily_deal_completions` (service-role-only writes) + a trigger recomputing `leaderboard_entries`' `daily_deal_streak`/`daily_deal_best_streak`/`daily_deal_last_played` from it, closing the same "plain client-writable column" gap those three had. |
| 0037 | `settings.haptics_on` — splits Haptics into its own synced toggle, previously bundled into `sound_on`. |
| 0038 | Schedules the `daily-deal-reminder` Edge Function via `pg_cron`/`pg_net` — a once-daily push for any account whose Daily Deal streak is about to lapse. Needs manual one-time setup (a Vault secret) outside this file. |
| 0039 | The Weekly Challenge, built server-verified from day one: `weekly_challenge_completions` (service-role-only writes, same shape as 0036) + a trigger computing `leaderboard_entries`' new `weekly_challenge_streak`/`weekly_challenge_best_streak`/`weekly_challenge_last_played` columns from it. |

> **Realtime gotcha:** an RLS policy that filters on non-PK columns needs
> `REPLICA IDENTITY FULL` on that table or UPDATE/DELETE events are dropped
> for the other party. That's why 0012 sets it on `friendships`.

### Edge Function (`supabase/functions/mp/`)

- `index.ts` — Deno. Path-routed: `/mp/{create,respond,cancel,state,move,resign}`.
  Auth + DB + wiring only. Uses the service-role client to reach the sealed
  `mp_game_state` — and, as of migration 0035, is also the only writer of
  `player_stats`/`achievement_counters`/`game_history` for a multiplayer
  game (`creditAchievementCounters` per verified move,
  `recordMpGameOutcome` at game-over) — this used to be a client-side write
  (`recordMpGameResult`) with nothing re-verifying it against the real
  server state.
- `_shared/cors.ts` — `corsHeaders`, `json()`.
- `_engine/` — **gitignored build artifact.** A copy of `src/` with explicit
  `.ts` import extensions, produced by `scripts/bundle-mp-engine.mjs` (the
  Supabase deploy bundler ignores `deno.json` / extension-less imports).
- Project ref: `wnhzcjfhnvvhsjrhapes`.

### Edge Function (`supabase/functions/solo-verify/`)

- `index.ts` — Deno. Single route. Auth + request sanitizing + DB wiring
  around `src/solo/replay.ts`'s pure `replaySoloGame` — replays a finished
  solo/pass-and-play game from the client's seed + move log through the
  real engine, rejects the whole submission if any move doesn't hold up,
  and only then writes `player_stats`/`achievement_counters`/`game_history`
  with the service-role client. See §4's "Finishing a solo game" flow.
- `_engine/` — **gitignored build artifact**, produced by
  `scripts/bundle-solo-verify-engine.mjs` (a deliberate near-duplicate of
  `bundle-mp-engine.mjs`, not shared, so nothing about `mp`'s own bundle can
  regress) — a smaller slice of `src/` than `mp`'s own copy (no `ai/` or
  `mp/`: solo-verify replays already-concrete logged moves, never re-runs
  AI strategy code).
- Requires migration 0035 (and, for Daily Deal completions specifically,
  0036; Weekly Challenge, 0039) to have run for the holes to actually be
  closed — see `supabase/functions/README.md`.

### Edge Function (`supabase/functions/contact/`)

- `index.ts` — Deno, single route. Takes the `/support` page's submission
  and emails it via Resend. `SUPPORT_EMAIL` and `RESEND_API_KEY` are
  Supabase secrets — the destination address never reaches the client.
  Callable signed out (see the file's own doc for why that's fine). No
  migration, no `_engine/` copy — self-contained.
- Deploy: `npx supabase secrets set RESEND_API_KEY=... SUPPORT_EMAIL=...`
  then `npx supabase functions deploy contact`.

---

## 6. Build, test, deploy

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Tests | `npm test` (vitest, 346 tests) |
| E2E | `npm run test:e2e:ci` (Playwright — 5 browser projects; excludes `@visual` and self-skips the live 2-account MP test without `SUPABASE_SERVICE_ROLE_KEY`) |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Production build | `npm run build` (static export to `out/`) |
| Headless engine sanity | `npm run demo` |
| Load test | `k6 run scripts/load-test.js` — hits real Supabase, opt-in only, see the script's own setup comment |
| iOS (Capacitor, not distributed) | `npm run ios:sync` / `npm run ios:open` |

**Deploy the web app:** push to `main` → GitHub → Vercel →
`https://books-and-runs.vercel.app`. *(Push after committing — a local commit
alone changes nothing live.)*

**Deploy a migration:** paste the `.sql` into the Supabase SQL editor. There
is no CLI migration workflow.

**Deploy the Edge Function:**
```
node scripts/bundle-mp-engine.mjs && npx supabase functions deploy mp
```
Re-run the bundle step whenever `src/` changes.

`supabase/functions/**` is excluded from the app's `tsconfig` and ESLint
(it's Deno, not the app's toolchain).

---

## 7. Conventions worth knowing

- **React imports:** `import { ReactNode, FormEvent } from "react"` — not
  `React.ReactNode`. (`layout.tsx` is the lone `React.*` holdout.)
- **Redirect "pages":** static export has no `redirects` config for client
  routes — a redirect is a `"use client"` page that calls `router.replace()`
  in an effect (see `app/multiplayer/page.tsx`).
- **Theme/colorblind/card-back** apply by setting a `data-*` attribute on
  `<html>` directly (instant, no re-render) and are re-applied before first
  paint by inline scripts in `layout.tsx`.
- **Security-definer RPCs** always `set search_path = public` and
  `revoke execute … from anon, public; grant … to authenticated`.
- **`mp_game_state` is sealed** — RLS enabled with no policies. Only the
  service-role Edge Function can touch it.
- Engine mutations are **in-place on `GameState`**; MP adapter mutations are
  **transactional** (`structuredClone`, commit on success).

---

## 8. Audit — cleanup opportunities (last re-verified 2026-09-11)

A full pass for dead code, redundancy, and optimization opportunities —
originally done 2026-09-10, re-run from scratch after this session's
largest batch of new features (card faces, account-wide settings sync,
first-visit tips, account bios, security hardening). Same conclusion both
times: the codebase is clean and unusually well-commented; findings stay
modest even after roughly doubling in size. Nothing was removed this pass
— every finding below was either already true and re-confirmed, or newly
checked and found to be a false alarm.

### Applied historically (verified inert, separate commits)

- **Removed 3 unused MP client wrappers** from `app/lib/mpStore.ts`:
  `getMyMpRecord` + `MpRecord`, `getMyMpActiveCount`, `MP_GAME_CAP`. Zero
  callers anywhere in `app/` or `src/`; the 3-game cap is enforced
  server-side (the Edge Function keeps its own `MP_GAME_CAP`), and
  `getMyMpStats` superseded `getMyMpRecord`. The Postgres RPCs
  (`mp_my_record`, `mp_active_count`) were left in the DB.

### This pass's method (so a future re-check can repeat it cheaply)

1. `npx ts-prune` for unused exports across the whole TS codebase.
2. A file-level orphan check — every non-route `.ts`/`.tsx` file grepped
   elsewhere for at least one reference by name.
3. `grep` sweeps for `TODO`/`FIXME`/`HACK`/`@deprecated`, `console.log`
   (vs. deliberate `console.error`), and `eslint-disable` comments.
4. `git ls-files` checked for accidentally-tracked build output or
   oversized files.
5. Comment-density spot checks on the lowest-ratio files, to catch any
   that are actually under-explained rather than just data-heavy.
6. Re-read the two "report-only" findings below against the current code
   to confirm they still hold rather than assuming.

**Result:** `ts-prune` flagged nothing beyond Next.js's own
framework-required exports (`default`/`metadata`/`viewport` on every
route file — used implicitly by file-based routing, not dead) and the
same "type alias only used in its own file" category as #3 below. The
orphan check's three hits (`src/demo.ts`, `src/testHelpers.ts`,
`src/mp/adapter.ts`) were all false positives from the check's own
narrow search scope — `demo.ts` runs via `npm run demo`, `testHelpers.ts`
is imported by 7 `*.test.ts` files, `adapter.ts` is imported by
`supabase/functions/mp/index.ts` (outside `app`/`src`, where the check
was looking). No genuinely orphaned file exists anywhere in the repo.

### Report-only — real but not worth the risk right now

1. **Triplicated "snapshot progress → diff → show unlock" logic**, in
   `components/GameOverScreen.tsx`, `components/RoundSummary.tsx`, and
   `lib/useMpGame.ts`. Each differs deliberately (localStorage key, timing,
   which counters). A shared `useAchievementUnlockDiff` hook could unify it,
   but it sits on the game-over UX critical path and all three are covered
   only by manual testing. Refactor only with a dedicated test pass.

2. **Per-turn achievement counter derivation exists twice** —
   `GameContext.tsx` (`bump()` from local play) and `useMpGame.ts`
   (`bumpC()` from a committed MP move) compute the same counter categories
   from different inputs. Consolidating means a shared "describe this turn"
   function over both the local and the redacted-MP shapes.

3. **~35 type aliases (plus a few small helper functions) are `export`ed
   but only used in their own file** — `ts-prune` now flags around this
   many, up from ~15 at the 09-10 count, growth roughly proportional to
   how much code got added this session (`FlightSpec`, `BuyOffer`,
   `FlightInput`/`FlightEvent`, `ColorblindOption`, `DailyDealResult`,
   `CreateMpGameInput`, `Candidate`, `GroupValidation`, `MpSeat`,
   `RedactedPlayer`, `TUTORIAL_AI_ID`, `TUTORIAL_BOOK_IDS`/`RUN_IDS`,
   `MeldType`, `AchievementSource`/`AchievementFamily`, `SortMode`,
   `ThemeErrorColors`, `TutorialGate`, `LayOffMove`, `ShareRow`/
   `ShareCardInput`, `SavedScorecard`, `PendingSave`, `SubscribeResult`,
   `ReportInput`, `AiPersona`, `RoundMode`, `Notifications`, …). Zero
   runtime cost; dropping `export` would only tidy the public surface.
   Left as-is — several are plausible future imports and the churn isn't
   worth it.

4. **`/multiplayer` + `/multiplayer/new` redirect stubs** are intentional
   legacy shims. Keep until old links have aged out.

5. **`app/lib/dailyDealStore.ts`** exports `localDateKey` used only
   internally — same "unnecessary export" category as #3. `dateSeed` is the
   one exception: `weeklyChallengeStore.ts` reuses its djb2 hash directly
   (it only ever hashes a string, so the "date" in its name is just where it
   was first written, not a real constraint) rather than duplicating it.

6. **The five `loadLocalX`/`saveLocalX`/`applyX` store triads**
   (`themeStore.ts`, `cardBackStore.ts`, `cardFaceStore.ts`,
   `colorblindStore.ts`, and `settingsStore.ts`'s own shape) repeat the
   same small pattern five times rather than sharing a generic "local
   store" factory. Looked at deliberately this pass, not just carried
   over: each is a handful of lines, each has genuinely different framing
   (a CSS attribute vs. a React-live hook vs. a plain object), and a
   factory abstraction would need to flex for all three shapes — net
   more code and a layer of indirection to read through, for five files
   that are individually trivial to read as they are. Not a finding,
   a considered "no."

### Checked and clean (both passes)

- No `TODO`/`FIXME`/`HACK`/`@deprecated` markers anywhere.
- All `console.*` calls are deliberate error logging in `.catch` handlers
  (`src/demo.ts`'s plain `console.log`s are its actual output — it's a CLI
  benchmark script, not app code).
- All 11 `eslint-disable` lines (grew from 7) are `react-hooks/exhaustive-deps`
  or a documented `@next/next` rule exception, each with a reason in the
  adjacent comment.
- No orphaned files — every non-route `.ts`/`.tsx` file has a real importer
  somewhere in `app/`, `src/`, or `supabase/functions/`.
- No build output, `node_modules`, or oversized files accidentally tracked
  by git — the largest tracked files are `e2e/visual.spec.ts-snapshots/`
  baseline PNGs, which are supposed to be there.
- Bundle size: `/game` and Home are each ~220–236KB gzipped JS on first
  load (measured directly from a real `next build`'s output, not
  estimated); the Supabase SDK stays lazy-loaded off that path, enforced
  by `scripts/check-bundle.mjs` in CI so this can't silently regress.
- `tsc`, `eslint .`, `vitest` (346, up from 199), and `next build` all
  pass clean.
