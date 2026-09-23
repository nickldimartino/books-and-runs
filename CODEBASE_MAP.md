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
| `meld.ts` | **The hard part.** Is a group a legal book/run? Can a hand complete a contract? Wild-card placement rules. `validateManualGroup`, `solveContract`, `solveWholeHandContract`, `layOffOptions`, `RUN_ORDER`, `groupMeldsByOwner` (shared by `game/page.tsx` and `multiplayer/play/page.tsx`'s own "Table melds" sections). |
| `gameEngine.ts` | The turn state machine. `createGame`, `drawFromPile`/`drawFromDiscard`, `meldChosenGroups`/`attemptMeldContract`, `layOffCard`, `discardAndAdvance`, `startNextRound`. Also `eligibleBuyers`/`buyDiscard` (the "buy the discard" rule — engine-complete but disabled in the app, see `BUY_DISCARD_ENABLED` in `GameContext`). |
| `ai/index.ts` | `playAITurn(state)` — runs one full AI turn through the same engine calls a human's UI makes. `aiWantsToBuyDiscard`. |
| `ai/strategy.ts` | The `AIStrategy` interface + shared helpers (`MISTAKE_CHANCE`, `dangerScore`, `deadCards`, `handWantsCard` — the rank-match/run-adjacency "does this discard obviously help me" check every tier above Beginner applies, lay-off planners). No strategy of its own. |
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
| `/leaderboard` | One row per account (self-reported snapshot). Sortable, with an All-time/This month toggle — the season view subtracts each account's monthly `season_snapshots` baseline (migration 0044) client-side, narrowed to games-played/won/win-rate since level/XP/streaks don't reset. Add-friend button per row; names link to `/player`. |
| `/friends` | Friend list, incoming/outgoing requests, friend code + share link (`?add=BR-XXXXX`); names link to `/player`. |
| `/clubs`, `/clubs?id=<uuid>` | A standing named group of friends with its own scoreboard (real MP stats, filtered + re-ranked to the roster) — list + detail, same query-param routing as `/player`. Owner-curated membership, only onto an existing friend. |
| `/tournaments`, `/tournaments?id=<uuid>`, `/tournaments/new` | A round-robin series — the same roster plays a fixed number of ordinary MP games back-to-back, standings summed live. List + detail (query-param routed) + the creation form (`?club=<uuid>` pre-checks that club's roster). |
| `/history` | Local (device) game history. |
| `/scorecard` | Standalone pen-and-paper scorekeeper (no engine — just a score grid). |
| `/settings`, `/settings/theme`, `/settings/card-back`, `/settings/card-face` | House rules, theme picker (38 themes), card-back picker, card-face picker (6 styles). Every preference here syncs to the account when signed in — see `accountSettingsSync.ts`. |
| `/account` | Email/password, 2FA, data export, danger zone. Links out to `/player` for display name/bio/avatar, which live there now. |
| `/how-to-play` | Rules reference. `BackLink` returns to wherever you came from (`?from=game`). |
| `/sign-in`, `/reset-password`, `/privacy`, `/terms` | Auth + legal. |
| `/support` | Bug report / feature request form (type dropdown, subject, description, optional reply-to email, up to 5 attachments). Submits to the `contact` Edge Function, which emails it — the destination address is a Supabase secret, never shipped to the client. Works signed out. Linked from the Home footer and Settings' Help section. |
| `/tip` | "Support the developer" — an optional one-time tip via Stripe Payment Links (`PAYMENT_LINKS` in the file itself), gated behind sign-in so a completed payment can be attributed back to an account. Grants the ☕ Supporter badge — see the `stripe-webhook` Edge Function and migration 0043. Linked from Settings' Help section. |
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
| `SoundQuickToggle.tsx` | game screen | One-tap mute/unmute for sound effects + ambient music, without a trip to Settings. |
| `UndoRing.tsx` | game screen | The ring around Undo that visibly drains over its grace window (`GameContext.UNDO_GRACE_MS`) — pure CSS animation, remounted via `key={expiresAt}`. |
| `GameOverScreen.tsx` | game screen | Final standings, share image, **records the game** (stats/achievements/XP/leaderboard), shows achievement unlocks. |
| `RoundSummary.tsx` | game + MP screens | Between-round panel; also flushes per-round achievement progress and shows mid-game unlocks. |
| `AchievementUnlock.tsx` / `AchievementIcons.tsx` | round summary + game over + MP | Shared "you unlocked this" card; one line-art icon per achievement category. |
| `UnlockToast.tsx` | game over + MP | Top-of-screen toast for a newly-earned profile cosmetic (avatar emoji/frame/title/banner) — see `allCosmetics.ts`'s `diffNewlyUnlockedCosmetics`. Separate from `AchievementUnlock.tsx`, which is for achievements themselves. |
| `Confetti.tsx` | game over | Win celebration. |
| `PassGate.tsx` / `BuyOfferGate.tsx` | game screen | "Pass the device to X" interstitial; the (disabled) buy-the-discard offer. |
| `PlayerAvatar.tsx` / `AvatarFrame.tsx` / `PremiumBadgeIcon.tsx` | profile, Leaderboard, Friends, OpponentStrip | `PlayerAvatar` renders the picture itself (photo or emoji-on-color); `AvatarFrame` wraps it in an earned ring (flat color for most, a special conic-gradient + shimmer treatment for `grandmaster`/`prismatic`/`dealerstable` — see `profileCosmetics.ts`/`globals.css`'s `.prismatic-foil`/`.diamond-foil`/`.dealers-table-*`); `PremiumBadgeIcon` draws the earned corner-badge overlay as hand-drawn line art instead of a raw emoji glyph. |
| `ProfileBanner.tsx` | profile page | Wraps the profile header in a wide color strip (`bannerPresets.ts`). `prismatic` and `dealerstable` are real layered DOM (a diamond scatter over the rainbow gradient; a jeweled wood band around a felt table) rather than the single `background` string every other banner uses. |
| `EmptyState.tsx` | Leaderboard, Friends, other empty lists | Shared "nothing here yet" card (icon + explanation + optional action) — one consistent tone for a brand-new account instead of each page inventing its own. |
| `BackLink.tsx` | nearly every page | The "← X" pill in a page's top-left corner — covers a plain `href`, a custom `onClick` (router.back(), a conditional fallback), and a custom label. Replaced 25+ hand-copies of the same className. |
| `CenteredMessage.tsx` | Clubs, Tournaments, Friends, Leaderboard, Achievements, Account, Player, Sign-in, Reset-password | The centered "this needs X" screen — heading, optional body, optional "Sign in" CTA, a way back. Covers the "Supabase isn't configured" gate, the "sign in to see this" gate (including a dynamic `?next=` redirect and a `router.replace()`-based back action), and a couple of one-off empty/error states that want the identical shell. Replaced 13+ hand-copies, three of which had independently invented their own local `Shell` wrapper for it. |
| `HandSortButtons.tsx` | game + MP screens | The "Sort by suit / Sort by rank" button pair in the hand drawer — was pixel-identical, hand-copied in both game screens. |
| `CardFanHero.tsx` | home | The decorative fanned-cards hero. |
| `LoadingSpinner.tsx` | data pages | A card-flip loading state. |
| `PageTip.tsx` | one per route — see `tipsStore.ts`'s `TipId` union for the current list | A first-visit-only dismissible banner; permanently replaced several pages' old always-visible explanatory paragraphs. |
| `IntroSplash.tsx` | home | The one-time "dealing" animation on first visit to `/` this session (`sessionStorage`, not `tipsStore` — replays every new session, purely decorative). |

### 3d. Stores & helpers (`app/lib/`)

**Local persistence (localStorage, `booksAndRuns:*` keys)**

Every store below builds on `localStorageUtil.ts`'s `readLocalStorage`/
`writeLocalStorage`/`removeLocalStorage` — the SSR-guard + try/catch
boilerplate around the raw browser call, shared so it's written once
instead of hand-copied into each store. String in/string out only; JSON
parsing and validating a value against a store's own known-option list
stay with each caller.

| File | Key / purpose |
|---|---|
| `localSave.ts` | `savedGame` — the one in-progress solo game (`SavedGame`), plus the Daily Deal/Weekly Challenge save slots below, all three built on one internal `makeSaveSlot(key, events?)` factory (same load/save/clear shape, parametrized by storage key and which events to fire). |
| `settingsStore.ts` | `settings` — house rules (`HouseSettings`): preferred difficulty, sound, haptics. |
| `themeStore.ts` | `theme` — 38 themes, applied via `[data-theme]` before paint. |
| `cardBackStore.ts` | `cardBack` — card-back identity ("match" = mirror the table theme). |
| `cardFaceStore.ts` | `cardFace` — 6 card-face drawing styles (default `classic`); read live via `useCardFace()` inside `CardFace.tsx` itself, not prop-drilled. |
| `colorblindStore.ts` | `colorblindMode` — `[data-colorblind]` override for 3 card colours. |
| `textScaleStore.ts` | `textScale` (default/large/xlarge) — `[data-text-scale]` on `<html>`, overriding Tailwind's own `--text-*` theme tokens (see globals.css) so every `text-xs`..`text-4xl` utility scales with no per-page change. `[data-no-text-scale]` on the actual game board (`game/page.tsx`, `multiplayer/play/page.tsx`) resets it back to 1 for that subtree — gameplay is deliberately excluded; Home's own tile buttons are unaffected by construction (they size their label via `cqw`, never these classes). Usable signed out, unlike Theme. |
| `accountSettingsSync.ts` | Mirrors the stores above to the account (migration 0022's `settings` table) when signed in — push helpers (`pushTheme`/`pushCardBack`/`pushCardFace`/`pushColorblindMode`/`pushTextScale`/`pushHouseSettingsPatch`, the last debouncing the two volume sliders) called from each picker's own change handler; `applyAccountSettings` (pull side, called from `AccountSettingsSync.tsx`) only overwrites a field the account has actually set — validated against each store's own known-option list first, same as every local loader already does — and fires a `br:settings-synced` event so an already-mounted page picks it up live. Exists because a fresh "Add to Home Screen" install gets its own empty local storage on iOS. |
| `useSyncedLocalPreference.ts` | The "load from local storage, re-load on `br:settings-synced`" effect + loading-state boilerplate every Theme/Card back/Card face/Ambient song settings subpage needs — one hook instead of four hand-copies. Its value type isn't limited to a single primitive: Card back and Ambient song each reload two things from the same event (their own choice plus one read-only value they need but never set). |
| `accountScope.ts` | Detects a genuine account handoff on this device (as opposed to the same account continuing, or a guest session) — the logic `AccountSwitchGuard.tsx` calls before resetting every local cache above, so one account's leftovers can't leak into (or get pushed into the cloud row of) a different account that signs in next. |
| `tipsStore.ts` | `seenTips` — which first-visit page tips (`PageTip.tsx`) have been dismissed; "Show again" in Settings clears it. |
| `dailyDealStore.ts` | `dailyDeal` — Daily Deal results + streak; seeded deal by calendar date. |
| `dailyDealLeaderboard.ts` | Per-deal friend leaderboard (migration 0018): `submitDailyDealScore`, `fetchDailyDealFriendScores`. |
| `weeklyChallengeStore.ts` | `weeklyChallenge` — Daily Deal's bigger, harder sibling: full 7-round game vs. 3 Hard AIs, seeded deal by ISO week (`isoWeekKey`). Own results + streak, own save slot (`localSave.ts`'s `WEEKLY_CHALLENGE_SAVE_KEY`). No per-challenge friend leaderboard yet. |
| `favoriteGameConfig.ts` | "My usual" saved solo/pass-and-play setup (localStorage): load/save/describe + `contractsFor` / `playerConfigsFor` deal helpers. |
| `scorecardStore.ts` | `scorecard` — the standalone scorekeeper's grid. |
| `pushSubscriptions.ts` | Web Push opt-in (Settings page): register `public/sw.js`, subscribe/unsubscribe via `PushManager`, keep `push_subscriptions` (migration 0020) in step. The actual send is server-side — see `mp/index.ts`'s `sendPushForEvent`. |
| `pendingSaveQueue.ts` | `pendingSaves` — finished games whose Supabase write failed; retried by `PendingSaveSync`. |
| `firstSessionStore.ts` | `hasStartedAGame` — whether this device has ever started a game (tutorial included). Softens Home's Sign-in/Daily Deal/Weekly Challenge CTAs and promotes New Game's tutorial link to a real button for a session that's never played; returns to normal the moment one does. |

**Recording a finished game (the write path)**

`player_stats`/`achievement_counters`/`game_history` no longer accept direct
client writes at all (migration 0035) — every write to them is
server-verified, derived from a replay/the real engine, never taken on a
client's word. See §8 for the full design.

| File | Role |
|---|---|
| `recordGameResult.ts` | Just `YOU_PLAYER_ID` (re-exported from `src/types.ts`) and the shared `RoundHistoryEntry` shape now — the write itself moved server-side (see `verifySoloGame.ts` below and `mp/index.ts`'s `recordMpGameOutcome`). |
| `verifySoloGame.ts` | Client side of the solo-verify flow: `buildSoloVerifyPayload` (seed + move log + seats + contracts from `GameState`/`GameContext`) and `verifySoloGame` (calls the Edge Function via `callEdgeFunction.ts`, throws `SoloVerifyError` on rejection). |
| `pendingSaveQueue.ts` | Queues a `verifySoloGame` payload that couldn't reach Supabase (offline/network failure only — a genuine rejection is never queued, since replaying the same payload later would just fail identically) for `PendingSaveSync` to retry. |
| `leaderboardStore.ts` | `syncLeaderboardStats` — self-reported upsert into `leaderboard_entries` (core stats + a best-effort separate MP-columns upsert); `level`/`total_xp`/`games_played`/`games_won`/`average_score`/`worst_score` specifically get silently overwritten server-side by a trigger (migration 0035) regardless of what's pushed here. |
| `loadAchievementProgress.ts` | `loadAchievementProgressState` — assembles the `AchievementProgressState` the Achievements/Profile pages need (player_stats + counters + MP stats). |

**Multiplayer**

| File | Role |
|---|---|
| `mpStore.ts` | Client → Edge Function (`create`/`respond`/`state`/`move`/`resign`, via `callEdgeFunction.ts`) + read-only RPC lists (`getMyMpGames`, `getMyMpHistory`, `getMyMpStats`). `MpError`. |
| `callEdgeFunction.ts` | The "get the session, POST with a bearer token, tolerantly parse JSON, throw a custom Error subclass" wrapper shared by `mpStore.ts`'s `callMp` and `verifySoloGame.ts` — deliberately not `supabase.functions.invoke`, so the function's own real error message survives instead of a generic non-2xx message. |
| `useMpGame.ts` | The MP play-screen hook. Turn drafting (`draw` then `commit`); stats/achievement-counter crediting happen server-side now (see `mp/index.ts`) — this just diffs a progress snapshot at game-over to show what unlocked. |
| `useNotifications.ts` | One combined Realtime hook: friend requests + game requests + your-turn count → a single badge. Replaced `useFriendActivity` + `useMpActivity`. |
| `friendsStore.ts` | Friend RPC wrappers (`getFriends`, `sendFriendRequest`, `addFriendByCode`, …). |
| `clubsStore.ts` | Club RPC wrappers (migration 0040) — create/rename/delete, add/remove member (owner-only, only onto an existing friend), `getClubStandings` (real MP stats, filtered + re-ranked to the roster). |
| `tournamentsStore.ts` | Tournament RPC wrappers (migration 0041) — a round-robin series among a fixed roster, not a bracket. `createTournament` links an already-created mp_games row as round 1; `addTournamentRound` links a rematch as the next one; `getTournamentStandings` sums each player's `mp_participants.final_score`/`outcome` live across every linked game. Never touches the `mp` Edge Function itself. |
| `mpSchema.ts` | Runtime (zod) validation of what the `mp` Edge Function's responses actually contain — the function is still the authority, but a malformed/truncated response surfaces as a clean "couldn't load" instead of a React crash three components deep. Checks only the shape the play screen reads, not every field. |

**Cosmetics** (avatar, frame, title, banner, badge — see migration 0028's
`cosmetic_unlocks` table for the server-side mirror of the unlock rules
below)

| File | Role |
|---|---|
| `cosmeticUnlocks.ts` | The shared `CosmeticUnlockRule` union + `isCosmeticUnlocked`/`cosmeticRequirementLabel` — one unlock-condition system for every gated cosmetic (badge, frame, title, banner), computed from an `UnlockContext` built out of an account's own live data. |
| `avatarPresets.ts` | Free `EMOJI_OPTIONS`/`COLOR_OPTIONS` for a picture-less avatar, plus the 13 earned `PREMIUM_EMOJI_OPTIONS` badges (level milestones + one per achievement category + the Epic/Mythic/Prismatic tier badges). |
| `profileCosmetics.ts` | `AVATAR_FRAME_OPTIONS` (+ `AVATAR_FRAME_COLOR`) and `TITLE_OPTIONS` — frames are free flat colors except `grandmaster`/`prismatic`/`dealerstable`, which `AvatarFrame.tsx` special-cases into an animated ring instead of using the flat-color map. |
| `bannerPresets.ts` | `BANNER_OPTIONS` — a CSS `background` string per banner (2-stop linear or conic gradient only, so `shareCard.ts`'s canvas parser can replay it) plus an `unlock` rule; `prismatic`/`dealerstable` get a real layered-DOM treatment in `ProfileBanner.tsx` beyond what this flat string shows. |
| `allCosmetics.ts` | `ALL_GATED_COSMETICS` — every gated badge/frame/title/banner in one flat list, and `diffNewlyUnlockedCosmetics` (before/after progress snapshots → what just unlocked) that `UnlockToast.tsx` renders. |
| `achievementIconPaths.ts` | Raw path/circle/rect data for the 9 achievement-category icons — one shared source `AchievementIcons.tsx` renders as JSX and `shareCard.ts` replays as `Path2D` draws on a `<canvas>` (which has no SVG renderer), so the two can't visually drift apart. |
| `achievementRarity.ts` | "Only 4% of players have this" — reads migration 0029's `achievement_unlock_counts` (a daily-refreshed summary table; the underlying per-account rows are owner-only, so a client can't compute this itself). |
| `avatarUpload.ts` | Client-side prep for an uploaded profile photo — center-cropped to a square and downsized via `<canvas>` before it ever leaves the device, then uploaded to the `avatars` Storage bucket (migration 0024) at a fixed per-account path so a re-upload replaces the old file in place. |
| `profileShareCard.ts` | `buildProfileShareCardInput` — the one place a `leaderboard_entries` row becomes a `ProfileShareCardInput` (`shareCard.ts`), so `/player`'s own share button and `/friends`' "share to add me" button (a friend-code footer swapped in) can't drift into two differently-rendered cards. |

**Small pure formatters** — `formatNames.ts` (`joinNames`), `formatScore.ts`
(shared int/decimal/`—` rendering), `text.ts` (`capitalize` — "medium" ->
"Medium", including for `<select>`/`<option>` labels specifically, where
a CSS `text-transform` instead doesn't render correctly in iOS Safari's
native picker wheel), `achievementFormat.ts`, `aiPersonas.ts`
(cosmetic AI name + blurb, New-Game-time only), `handSort.ts` (shared hand-
sort comparators, used by both `GameContext.tsx` and `useMpGame.ts` so
solo/pass-and-play and multiplayer hands sort identically).

**Platform** — `supabaseClient.ts` (the singleton + `isSupabaseConfigured`),
`sound.ts` (Web Audio synthesis, no files), `ambience.ts` (optional
synthesized background pad for the game screens, same no-files approach as
`sound.ts`), `haptics.ts` (Capacitor / `navigator.vibrate`), `shareCard.ts`
(canvas → PNG standings/profile image), `useFocusTrap.ts` (keeps Tab
cycling inside a modal/sheet), `errorReporter.ts` (dependency-free
`window.onerror`/`unhandledrejection` capture → the `client_errors` table,
migration 0016), `analytics.ts` (anonymous aggregate product counters →
`app_events`, migration 0016 — no user id, session id, or IP, ever),
`exportUserData.ts` (Account page's "download my data" — assembles
everything this account owns from the same owner-RLS tables/RPCs the rest
of the app already reads, client-side, into one JSON file).

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
| 0040 | Clubs — `clubs` + `club_members` (owner-curated, only onto an existing friend), RPCs for create/rename/delete/add/remove member, and `club_standings()` (a filtered, re-ranked view of real multiplayer stats — no new stats pipeline). |
| 0041 | Tournaments — a round-robin series, not a bracket (see `tournamentsStore.ts`'s own doc). `tournaments` + `tournament_games` link a fixed roster's ordinary multiplayer games together; no `mp` Edge Function changes. RPCs create/link/cancel a series and compute live standings from `mp_participants`. |
| 0042 | The Rarity Vault — Epic (3/6-of-9 categories mastered), Mythic (Level 250, 500 games, 30-day Daily Deal streak, 12-week Weekly Challenge streak), and Prismatic (all of the above at once) cosmetic tiers, plus a Creator-only frame + banner. New `cosmetic_unlocked()` requirement kinds; see `cosmeticUnlocks.ts`. |
| 0043 | The tip jar — `supporter_payments` (service-role-write-only, same ground-truth pattern as `daily_deal_completions`/`weekly_challenge_completions`), written by the new `stripe-webhook` Edge Function after a completed Stripe Payment Link checkout. Grants the ☕ Supporter badge via a new `supporter_only` `cosmetic_unlocked()` branch. See `app/tip/page.tsx`. |
| 0044 | Seasonal leaderboard — `season_snapshots` (user_id, season_start, games_played, games_won), populated monthly by `snapshot_season_start()` via `pg_cron` (plus a run-once backfill). Read-only from the client's perspective (any signed-in user can select, same as `leaderboard_entries`); `app/leaderboard/page.tsx` computes "this month" as current cumulative minus the snapshot. Doesn't touch `leaderboard_entries` or the all-time board at all. |
| 0045 | `settings.show_meld_hint` — syncs the "Hint: Auto-meld" button's Settings toggle (off by default) across devices, same nullable pattern as every other Settings column since 0022. |
| 0046 | `settings.text_scale` — syncs the "Text size" accessibility control (see `textScaleStore.ts`) across devices. Unlike Theme, usable while signed out too — this column only matters once someone is signed in and wants it to follow them. |
| 0047 | `leaderboard_entries.is_test_account` — hides a flagged testing account from the public leaderboard (filtered client-side in `app/leaderboard/page.tsx`, since a project that hasn't run this migration yet has no such column) and from `refresh_achievement_rarity()`'s denominator. SQL-editor-only, same pattern as 0030's `is_creator`. |
| 0048 | Security hardening from a full audit — `mp`/`solo-verify` no longer leak raw exception messages to clients, `daily-deal-reminder`'s cron-secret check is now timing-safe, `solo_verify_upsert_player_stats()` makes the solo pacing-floor check+write atomic (closes a TOCTOU race), a trigger locks `leaderboard_entries.is_creator`/`.is_test_account` to their existing value regardless of what a write tries to set, `avatar_photo_path` gets an ownership CHECK, `client_errors` columns get bounded lengths, and every club/tournament RPC's grants were re-verified against its actual signature. (CSP's `img-src` gap for avatar photos was fixed in `vercel.json`, not this file.) |
| 0049 | Three follow-ups deferred out of 0048: `compute_total_xp()`/`category_mastered()` now require `p_user_id = auth.uid()` (previously any signed-in account could call either directly and read another account's derived stats/achievement progress — every real caller already only ever passed its own id); profile photo reports move from a direct client insert to a rate-limited `report_profile_photo()` RPC (`mp_bump_rate_limit`), closing "report many different accounts rapidly" (reporting the *same* account twice was already blocked by a unique constraint); `club_create()`/`tournament_create()` get real per-account caps (10 owned clubs, 10 active — not cancelled, not fully played — tournaments hosted at once). |
| 0050 | Cheat-prevention audit (2d): `leaderboard_entries.mp_games_played`/`.mp_games_won`/`.mp_best_win_streak` (added in 0011, never locked down like the rest of that table) now get overwritten on every write with `mp_stats_for()`'s honest server-computed numbers, same "server truth wins" pattern 0035/0036/0039 already use for every other stat family — closes a real "fake your public MP record/rank" hole. Also revokes `game_history`'s leftover 0001-era client-insert policy (unused — the real write already goes through `solo-verify`'s service-role key, bypassing RLS). |

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
- `_shared/playerStats.ts` — `computePlayerStatsUpdate` + `EMPTY_WINS_BY_DIFFICULTY`,
  shared with `solo-verify`'s own `handleVerify` below — both derive the
  same `player_stats` row shape from a game's outcome; this is the one
  place that math is defined, so a future scoring-formula change can't
  land in only one of the two functions.
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
  (the `player_stats` shape itself via `../_shared/playerStats.ts`, shared
  with `mp`) with the service-role client. See §4's "Finishing a solo
  game" flow.
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

### Edge Function (`supabase/functions/stripe-webhook/`)

- `index.ts` — Deno, single route, no Supabase JWT auth (Stripe calls this
  directly — deployed with `--no-verify-jwt`). Verifies the
  `Stripe-Signature` header manually via Web Crypto (no Stripe SDK — the
  scheme is simple enough not to need one), then records a completed
  `checkout.session.completed` into `supporter_payments` (migration 0043)
  with the service-role client. `client_reference_id` on the Payment
  Link's own URL (appended by `app/tip/page.tsx`) is what ties a payment
  back to an account — Payment Links have no server-side "create
  checkout" step of their own to attach metadata another way. No
  `_engine/` copy — self-contained.
- Deploy: `npx supabase functions deploy stripe-webhook --no-verify-jwt`
  then `npx supabase secrets set STRIPE_WEBHOOK_SECRET=...` — see
  `supabase/functions/README.md` for the one-time Stripe Dashboard setup
  (Payment Links + the webhook endpoint itself).

---

## 6. Build, test, deploy

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Tests | `npm test` (vitest, 471 tests) |
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
- **Local-only stores** build on `app/lib/localStorageUtil.ts`'s
  `readLocalStorage`/`writeLocalStorage`/`removeLocalStorage` for the
  SSR-guard + try/catch shape, rather than each hand-rolling it — see §3d.
  A store whose read fallback deliberately differs from "key genuinely
  absent" (fail safe when storage is broken entirely, e.g.
  `firstSessionStore.ts`, half of `reviewPromptStore.ts`) calls
  `window.localStorage` directly instead, since the shared helper can't
  tell "absent" and "read threw" apart.

---

## 8. Audit — cleanup opportunities (last re-verified 2026-09-23)

A full pass for dead code, redundancy, and optimization opportunities —
originally done 2026-09-10, re-run 2026-09-11 and 2026-09-14 (both found
the codebase clean, nothing removed), then **2026-09-23's pass actually
acted on findings for the first time** — see that section below for what
changed. ~32,800 lines across 164 `app`/`src` files as of this pass.

This pass also extended the check beyond dead code, into documentation
completeness specifically (every file should open with an explanation of
its role, not just be commented well internally) — see "Documentation
completeness" below for that part's own method and findings.

### 2026-09-23 — first pass to actually act on findings (10 commits)

Prior passes (09-10/09-11/09-14) kept concluding "clean, nothing to do."
This one ran three parallel research agents (scoped by area: `src/` +
Edge Functions, `app/lib/`, and `app/components/`/page routes) rather
than relying on `ts-prune`/orphan-grep alone, which surfaced genuine
redundancy and two real bugs the earlier method missed:

- **Two real bugs fixed**, not just cleanup: `localSave.ts`'s
  `loadCloudSave` silently treated a genuine Supabase read error the
  same as "no save exists" (both call sites already had a `try/catch`
  written to handle a thrown error — the function just never threw one);
  `accountSettingsSync.ts`'s `applyAccountSettings` cast cloud settings
  values without validating them against each store's own known-option
  list, unlike every local loader.
- **One real app bug found and fixed earlier the same day** (via the
  live multiplayer E2E work, not this audit): `app/tournaments/page.tsx`
  read `mp_games.seats` with `user_id` instead of the actual `userId`
  the `mp` function writes, silently dropping every human seat and
  breaking "Start next round" for any real tournament.
- **One feature-parity gap closed**: multiplayer's discard pile never
  showed the "can be laid off" badge solo's already had, despite already
  computing the identical per-card check for the hand itself.
- **Extractions**: `BackLink`/`CenteredMessage`/`HandSortButtons`
  components (§3c), `localStorageUtil.ts`/`useSyncedLocalPreference.ts`/
  `callEdgeFunction.ts`/`text.ts` (§3d), `groupMeldsByOwner`/
  `handWantsCard` (§2), a shared `SettingsLinkRow` shell, `nameOf`
  folded into `leaderboardStore.ts`, `_shared/playerStats.ts` (§5) —
  see each row above for what it replaced.
- **Dead code deleted**: `fetchOwnAvatar` (zero callers), and the whole
  card-back/face "showcase" write pipeline (`cardBackLabel`/
  `cardFaceLabel`, `updateShowcaseCardBack`/`Face`, player.tsx's
  bootstrap backfill) — write-only, nothing ever read
  `showcase_card_back`/`showcase_card_face` back out to display it. The
  two DB columns (migration 0028) were left in place; dropping a column
  is a schema change, not a dead-code cleanup.
- **Investigated and deliberately declined**: unifying the round-mode
  picker across 3 setup screens and the Badge/Frame/Title/Banner
  cosmetic-editor tabs in `player.tsx` — both looked like clean dedups
  on the surface but had real per-instance differences (layout, copy, a
  silently-missing validation warning on one page; four genuinely
  different tile/overlay types) that made a shared abstraction a
  real-regression risk without a design QA pass, not a safe mechanical
  change. Left as-is rather than forced.
- Every change verified via `tsc`, `eslint`, the full `vitest` suite
  (including the seeded AI balance test, to confirm the difficulty
  ladder didn't shift), and live browser checks; each commit's CI run
  confirmed green before moving to the next.

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

6. ~~The five `loadLocalX`/`saveLocalX`/`applyX` store triads... a
   considered "no."~~ **Reconsidered 2026-09-23** — a broader external
   review (not just this document's own prior pass) flagged the same
   pattern across 16 files, not 5, and closer inspection showed the
   shared part was narrower than assumed: only the SSR-guard + try/catch
   around the raw `localStorage` call, not the whole load/save/apply
   shape (which does genuinely differ per store, as this entry
   originally argued). `app/lib/localStorageUtil.ts` now provides just
   that narrow piece; 12 of the 16 flagged stores were migrated onto it.
   See the 2026-09-23 pass below.

### Checked and clean (all four passes)

- No `TODO`/`FIXME`/`HACK`/`@deprecated` markers anywhere.
- All `console.*` calls are deliberate error logging in `.catch` handlers
  (`src/demo.ts`'s plain `console.log`s are its actual output — it's a CLI
  benchmark script, not app code).
- No orphaned files — every non-route `.ts`/`.tsx` file has a real importer
  somewhere in `app/`, `src/`, or `supabase/functions/`. (`app/robots.ts` is
  the one new false-positive this pass — a Next.js file-convention route,
  same category as `manifest.ts`/`sitemap.ts`, never imported by name.)
- No build output, `node_modules`, or oversized files accidentally tracked
  by git — the largest tracked files are `e2e/visual.spec.ts-snapshots/`
  baseline PNGs, which are supposed to be there.
- Bundle size: `/game` and Home are each ~220–236KB gzipped JS on first
  load (measured directly from a real `next build`'s output, not
  estimated); the Supabase SDK stays lazy-loaded off that path, enforced
  by `scripts/check-bundle.mjs` in CI so this can't silently regress.
- `tsc`, `eslint .`, `vitest` (471, up from 346), and `next build` all
  pass clean.
- All 13 `eslint-disable` lines (grew from 12) are `react-hooks/exhaustive-deps`
  or a documented `@next/next` rule exception, each with a reason in the
  adjacent comment.

### Documentation completeness (new this pass, 2026-09-14)

Checked separately from dead-code, since a file can be internally
well-commented and still lack the "what is this and why does it exist"
paragraph a newcomer needs before diving in.

**Method:** every non-test `.ts`/`.tsx` file in `app`/`src` checked for an
explanatory comment near its top (imports, then a comment before the first
real declaration — this codebase's own convention, comment right above
what it describes, rather than always above the imports); a comment-
density pass (comment lines ÷ total lines) to flag any file that might be
under-explained rather than just JSX/prose-heavy; and this document's own
component/lib tables cross-checked against the actual file list.

**Result:**
- Of 152 files, 147 already had a real explanation at the top (often
  positioned as a JSDoc block directly above the main export rather than
  before the imports — a deliberate, consistent convention here, not a
  gap). 5 genuinely had none: `app/lib/scorecardStore.ts`,
  `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/sign-in/page.tsx`, and
  `app/layout.tsx` (which was already extensively commented section-by-
  section, just missing one lead-in sentence). All 5 fixed this pass.
- The comment-density pass's lowest-ratio files were all either static
  prose pages (privacy/terms/how-to-play — the visible content *is* the
  explanation) or straightforward JSX-rendering pages whose file-header
  comment already covers the "why"; spot-checked `clubs/page.tsx`,
  `tournaments/page.tsx`, and `scorecard/page.tsx` specifically (real
  feature logic, not just prose) and each had a solid header — a low ratio
  here just means the rest is self-evident JSX, which matches this
  project's own "comment the why, not the what" convention rather than
  under-documenting it.
- This document's own tables had fallen behind: 8 components
  (`AvatarFrame`, `EmptyState`, `PlayerAvatar`, `PremiumBadgeIcon`,
  `ProfileBanner`, `SoundQuickToggle`, `UndoRing`, `UnlockToast`) and 13
  `app/lib/` files (`accountScope`, `achievementIconPaths`,
  `achievementRarity`, `ambience`, `analytics`, `avatarPresets`,
  `avatarUpload`, `errorReporter`, `exportUserData`, `handSort`,
  `mpSchema`, `profileShareCard`, `useFocusTrap`) existed in the repo with
  their own good file-level comments but no row in §3c/§3d. All added this
  pass, including a new **Cosmetics** subsection in §3d for the avatar/
  frame/title/banner/badge catalog files, which had grown into a real
  subsystem with no documented home of its own.

**2026-09-23 follow-up:** the 7 new files from that day's pass
(`BackLink.tsx`, `CenteredMessage.tsx`, `HandSortButtons.tsx`,
`localStorageUtil.ts`, `text.ts`, `useSyncedLocalPreference.ts`,
`callEdgeFunction.ts`) each checked against the same convention before
being added to this document's tables — all 7 already had a real
explanation directly above their one real export, no gaps to fix.

A second, fully independent re-check the same day (not just trusting
this document's own prior claim) went further: all 165 current
`app`/`src` files plus the 7 Supabase Edge Function files, each read in
full rather than pattern-matched. Found 2 genuine gaps that had crept in
since 09-14 — `app/lib/dailyDealStore.ts` and `app/lib/localSave.ts`
each had every individual piece well-commented but never stated the
file's own overall purpose in one place, unlike sibling files
(`weeklyChallengeStore.ts`, `scorecardStore.ts`) that do. Both fixed.
Also added a one-line comment to `supabase/functions/_shared/cors.ts`,
which had none — genuinely tiny/self-evident, but every other file here,
including equally small ones, still carries at least a line explaining
itself, so it was worth the one-line cost for consistency.

---

## 9. Full audit history (security, cheat-prevention, load testing, feature/UX)

Distinct from §8 above, which is specifically dead-code/redundancy/
documentation cleanup. This section logs the broader "is the whole
product sound" passes — security hardening, anti-cheat, adversarial/
load testing, and feature audits against modern game standards — so a
future pass can check what's already been covered instead of redoing it.

### 2026-09-23 — six-part full-product audit

Requested as one large session: a bug fix, then a lettered sequence
(2a–2f) covering redundancy, documentation, security, cheat-prevention,
adversarial/load testing, and a feature audit against "modern video game
standards." Each part built on the previous — 2c-2f in particular each
independently re-verified the previous parts' fixes live against
production rather than trusting they'd landed correctly.

- **Bug fixes first, outside the lettered list** — `c3adae0` added
  Accept/Decline directly to the pending-game screen (previously only
  reachable from Home); `1330f70` fixed migration 0047 referencing a
  table (`achievement_families`) that was never created, restoring
  `refresh_achievement_rarity()`'s real single-table body from 0029.
- **2a (redundancy/dead code) + 2b (documentation)** — see §8's own
  "2026-09-23 — first pass to actually act on findings" entry above
  (10 commits, `84ce009`..`6ce25ac`) — the two were done as one pass.
- **2c (security hardening)** — `5d712e2`, `1770d8c`. Full pass found:
  a CSP `img-src` gap breaking avatar photos, `mp`/`solo-verify` leaking
  raw exception messages to clients, a TOCTOU race in solo-verify's
  pacing floor (closed with an atomic `solo_verify_upsert_player_stats`
  upsert), a privilege-escalation hole letting a client set its own
  `is_creator`/`is_test_account`, a missing `avatar_photo_path` ownership
  check, unbounded `client_errors` columns, and stale RPC grants across
  every club/tournament function. A follow-up (`1770d8c`) closed 3 items
  originally deferred for the user's own call: `compute_total_xp()`/
  `category_mastered()` could be asked about any account, not just your
  own; `profile_photo_reports` had no rate limit; `club_create()`/
  `tournament_create()` had no per-account cap despite a comment implying
  one existed. Migrations `0048`, `0049`.
- **2d (cheat-prevention audit)** — `213e738`. Three parallel research
  passes: multiplayer info-leakage/move-validation (clean — redaction,
  RLS, and server-side hand validation all held up), the stats/
  achievement write surface (found `leaderboard_entries.mp_games_played`/
  `.mp_games_won`/`.mp_best_win_streak` were the one stat family never
  locked down like the rest, since migration 0011 — closed via a trigger
  extension), and solo-verify's replay coverage (clean — a full `gameOver`
  is already required before anything is credited; the one open item,
  grinding minimal-but-legal games against the 10s pacing floor, is a
  documented, accepted trade-off, not an oversight). Migration `0050`.
- **2e (adversarial/load testing)** — no code changes. Full e2e
  regression (119 passed locally with the service-role key, matching a
  green CI run), live adversarial UI testing with throwaway accounts
  (XSS payloads render inert everywhere, validation/uniqueness/rapid-
  click protections all held, mobile/tablet layouts clean, zero bugs
  found), and a k6 load test against production (5 VUs/30s: p95 latency
  286ms, 1.3% failure rate, both under threshold). Afterward, live-
  reverified every 2c/2d fix directly against production with throwaway
  accounts (10/10 checks passed) once the user had run migrations 0049/
  0050.
- **2f (feature audit vs. modern game standards)** — published as
  [The Third Scorecard](https://claude.ai/artifact/EtBroWay8HEucP4tsGcsMz).
  Reverified the prior two audits'
  ([UX audit](https://claude.ai/artifact/MnVTCQ8sNudNibQAdgonTs),
  [S-tier audit](https://claude.ai/artifact/GLsdYNo2YV97PZoxvY2awc)) 12
  combined findings live rather than re-reading them — 11 of 12 were
  already closed by earlier sessions' work (real card faces, a full
  card-flight animation system, opponent presence on the board, an
  image-based share card, a public Trophy Case, Android web haptics,
  all 5 failing theme contrasts, the CTA-weight/tutorial-discoverability/
  blank-screen UX fixes). Found: no manifest `screenshots` array (still
  open — needs real screenshot image assets, not just code), one
  remaining plain-text empty state, and 3 items flagged as deliberate
  product-scope questions rather than defects (a real but unreleased
  native iOS app with no Android counterpart, English-only with no i18n,
  Weekly Challenge having no streak-at-risk reminder despite Daily Deal
  having one).
- **Follow-up** — `5f23f73`: Weekly Challenge now gets a streak-at-risk
  reminder too (rides `daily-deal-reminder`'s existing daily cron, gated
  to Saturday/Sunday UTC so it doesn't nag daily), and the Stats page's
  "Past games" empty state now matches the `EmptyState` treatment used
  everywhere else instead of one bare line of text.

**Net result:** zero new defects found in security, cheat-prevention, or
load testing. Both prior UX/feature audits are now fully closed except
the manifest screenshots array (deferred — needs image assets) and
language support (deferred — the user's own call, saved for after
everything else). The user's own read of where this leaves the product:
"flirting with S-tier," with native-app release and localization the two
open questions, both intentionally parked rather than forgotten.
