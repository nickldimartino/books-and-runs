# Books & Runs

A local pass-and-play card game with five tiers of AI opponents, accounts,
and stats — built on a framework-agnostic TypeScript rules engine, a
Next.js UI, Supabase for auth/stats, and a Capacitor iOS wrapper. Based on
the house rules reference doc and the project design doc's phased roadmap.
All six phases of that roadmap are now built.

## What's here

- `src/types.ts` — card, player, meld, and contract types; the 7-round
  contract table; penalty point values
- `src/deck.ts` — deck construction (scales decks to player count), shuffle, deal
- `src/meld.ts` — book/run detection and validation, including wild-card
  substitution and a backtracking solver that finds a full contract from a
  hand if one exists
- `src/scorer.ts` — penalty scoring per the house rules table
- `src/gameEngine.ts` — turn structure: draw, meld, lay off, discard, round
  advancement, Round 7's no-discard-on-out rule, final scoring
- `src/ai/` — the five difficulty tiers (`beginner.ts` through `expert.ts`),
  a shared strategy interface, and an orchestrator (`index.ts`) that plays a
  full AI turn
- `src/demo.ts` — runs a complete 7-round game between one AI of each
  difficulty and prints the results, proving the engine works end to end
- `app/` — the Next.js UI: Home, New Game setup, Game board (with a
  pass-and-play "pass the device" gate between human turns), Round summary,
  Game over, Sign in, Stats, Achievements, Settings, How to Play, History,
  In-Person Scorecard, Privacy Policy, and Terms of Service screens
  - `scorecard/page.tsx` — a standalone scoring grid for the physical card
    game, independent of the digital rules engine and Supabase entirely:
    unlimited named players, the same round-selection options as New Game,
    and a live per-round/total grid, persisted to its own `localStorage` key
    (`lib/scorecardStore.ts`) so an in-progress paper-replacement scorecard
    survives a reload
  - `game/page.tsx`'s "Player activity this round" (toggleable in Settings)
    — a collapsible table of each player's current hand size and latest
    discard/discard-pile pickup, reading straight from `Player.hand.length`
    and `GameState.discardHistory`/`pickupHistory` (the latter two already
    reset per round in `gameEngine.ts`). Restores the in-person visibility
    pass-and-play otherwise hides — you'd normally see everyone's hand size
    and what they pick up/discard at a real table. Blind draw-pile draws are
    never shown, since those aren't visible in person either
  - The "Tutorial" option on New Game — a fixed 1-vs-1 practice round (You
    vs. one Beginner AI, "1 Book + 1 Run" only) with a scripted, non-random
    hand (`src/tutorial.ts`) guaranteed to contain exactly one obvious book
    and one obvious run, so the guided walkthrough (`lib/tutorialSteps.ts`,
    rendered by `components/TutorialOverlay.tsx` — a spotlight-and-tooltip
    overlay, four dimmed strips framing a cutout around whatever it's
    pointing at) hits the same teaching moments every time. Steps either
    dismiss on a tap or wait for the actual action (a real draw, a real
    meld, a real discard) before advancing. Turns on every optional feature
    (lay-off hints, player activity, meld grouping, sound) for the
    tutorial's duration regardless of your saved Settings, without ever
    writing back to them. `GameContext.tsx`'s `isTutorial` flag makes
    `persist()` a full no-op and keeps `quitToHome()` from clearing a real
    saved game if you exit mid-tutorial — a tutorial game never touches the
    real saved-game slot, Supabase stats, or achievements, in either
    direction
  - `GameContext.tsx` wires the screens above to the engine, and persists
    the in-progress game to `localStorage` so Home's "Continue" button can
    resume it (survives a full reload — see `lib/localSave.ts`)
  - `AuthContext.tsx` wraps Supabase Auth (email/password only — Google
    sign-in was removed since Google won't verify an OAuth consent screen
    for a domain the project doesn't own, like a shared `vercel.app`
    subdomain; would need a custom domain to revisit)
  - `lib/supabaseClient.ts` — degrades gracefully to a "not configured"
    state when no Supabase project is connected, so local play always works
  - `lib/recordGameResult.ts` — writes stats/history to Supabase when a
    signed-in user finishes a game
  - `lib/settingsStore.ts` — default AI difficulty (synced to Supabase's
    `settings` table when signed in) and sound effects / meld grouping /
    lay-off highlighting on-off (all local-only, like theme), saved to
    `localStorage`
  - `lib/sound.ts` — short sound effects for draw/discard/lay-off (a soft
    flick), sort/drag-reorder (a long sweep), meld (three descending taps),
    round win (a two-note bell chime), and game win (a melodic victory
    flourish), all synthesized on the fly with the Web Audio API — no audio
    files, so nothing to license or fetch. Wired into `GameContext.tsx`'s
    action handlers and `game/page.tsx`'s round/game-over transitions
- `supabase/migrations/0001_init.sql` — the `player_stats`, `game_history`,
  and `settings` tables, with row-level security so each user can only ever
  read/write their own rows
- `supabase/migrations/0002_achievements.sql` — the `achievement_counters`
  table backing the Achievements page (`src/achievements.ts` defines the 200
  achievements — 40 families × 5 tiers — as a pure function of these counters
  plus `player_stats`; `app/GameContext.tsx` increments counters only for the
  signed-in seat, `human-0`). Flushed via `lib/recordAchievementProgress.ts`
  at the end of every round (`RoundSummary.tsx`) and again at game-over
  (`GameOverScreen.tsx`), each flush clearing what it sent
  (`clearSessionCounters`) so nothing double-counts — games_played/games_won
  still only count a fully-finished game (`recordGameResult`), but meld/
  discard/turn-style counters no longer wait for one. `recordAchievementProgress`
  also now surfaces Supabase errors instead of discarding them, since a
  silently-failed write previously looked identical to a successful no-op
- `supabase/migrations/0003_worst_score.sql` — adds `worst_score` to
  `player_stats` (highest single-game score, alongside the existing
  `best_score`)
- `src/leveling.ts` — account level/XP, needing no schema of its own: it's a
  pure function of the same `player_stats`/`achievement_counters` data
  achievements already use (finishing/winning games, wins by AI difficulty,
  achievement tiers unlocked). `app/PlayerLevelContext.tsx` fetches it once
  in the root layout so Home and the game screen both show the current level
  without independent fetches; `GameOverScreen` diffs before/after XP to
  show what a finished game earned.
- `ios/` — the native Xcode project Capacitor generates to wrap the static
  export; `capacitor.config.json` points it at `out/`. Ships with a custom
  app icon and launch screen (green felt + a two-card mark) instead of
  Capacitor's placeholder — see `ios/App/App/Assets.xcassets/`
- `src/**/*.test.ts` — Vitest unit tests for the engine (deck, meld/run
  solving, scoring, full turn/round/game-over flow, and the contract-aware
  discard fix below); `src/testHelpers.ts` has shared card/state builders

## Running it

```bash
npm install
npm run dev     # Next.js UI at http://localhost:3000
npm run demo     # headless CLI demo: 5 AIs play a full game, prints results
npm run test     # Vitest unit test suite (engine + AI)
npm run lint     # ESLint (React hooks rules + Next.js checks)
npm run build     # production build (static export, see next.config.ts)
```

`npm run lint` parses `.ts`/`.tsx` with Babel rather than `typescript-eslint`, since
`typescript-eslint` doesn't yet support this project's TypeScript 7 (preview) —
see the comment in `eslint.config.mjs`. That means lint is syntax-only, no
type-aware rules; `npm run test`/`tsc --noEmit` remain the source of truth for
type correctness.

Local pass-and-play and AI opponents work with zero setup — no Supabase
project or iOS toolchain required. Auth/stats and the iOS build are optional
layers on top; see the checklists below to turn them on.

## What's verified

- **140 Vitest unit tests, all passing** (`src/**/*.test.ts`) — deck
  construction/shuffle/deal, book/run solving (including wild substitution
  and insufficient-hand rejection), lay-off validity, scoring, the full
  turn lifecycle (draw/meld/lay-off/discard), Round 7's no-discard-on-out
  rule, game-over winner selection, round advancement, achievements, and
  leveling.
- `npm run lint`, `tsc --noEmit`, and `npm run build` all pass clean, both
  with and without Supabase env vars set (the unconfigured state shows a
  friendly "not set up yet" message on Sign in/Stats instead of crashing).
- Manually exercised end to end in a browser: full pass-and-play turn
  cycles (including 2+ human seats, not just human-then-AI), laying off
  onto existing melds, and Continue (reloading mid-turn and confirming
  hand/draw-pile/drawn-this-turn state comes back intact). No
  console/hydration errors.
- **Verified in the iOS Simulator**: built via `xcodebuild`, launched, and
  played through real touch input — pass-and-play gate, draw/discard, AI
  auto-play, safe-area padding under the notch, and the custom app icon on
  the springboard all confirmed working. This is the native shell, not
  just the browser build.
- **Not manually verified**: playing an entire 7-round game to completion
  through the UI (only via the CLI demo and unit tests) — a melded hand
  only shrinks via lay-offs, so reaching game-over by clicking through the
  browser would take many dozens of turns for marginal extra confidence.

## Turning on accounts + stats

The app runs fine without this — it only unlocks Sign in and Stats.

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`, then
   `0002_achievements.sql` (unlocks the Achievements page), then
   `0003_worst_score.sql`.
3. In **Authentication → Providers**, enable Email.
4. In **Authentication → URL Configuration**, add
   `<your-deployed-url>/reset-password` (and `http://localhost:3000/reset-password`
   for local dev) to the Redirect URLs allow list — "Forgot password?" won't
   work without it, since Supabase rejects redirecting to any URL not on
   this list.
5. Copy `.env.local.example` to `.env.local` and fill in your project's URL
   and anon key from **Project Settings → API**.
6. `npm run dev` — Sign in and Stats now work.

Email/password is the only sign-in method — Google OAuth was removed after
Google Cloud declined to verify the app's OAuth consent screen for a domain
this project doesn't own (a shared `vercel.app` subdomain); it would need a
custom domain to revisit.

Account confirmation and password-reset emails go out through Supabase's
built-in email service by default, which Supabase itself documents as
rate-limited and not meant for production use — mail can arrive late, land
in spam, or not send at all. For real use, set a custom SMTP provider under
**Project Settings → Auth → SMTP Settings** (Resend, Postmark, and similar
all have small free tiers).

## Running the iOS app

Not currently pursued for App Store distribution, but the native project
builds and runs fine locally for testing. To run it yourself:

```bash
npm run ios:sync   # rebuilds the web app and re-syncs ios/
npm run ios:open   # opens the project in Xcode
```

Pick a Simulator in Xcode and hit Run. A few things need your Apple account
and can't be done for you:

For a real device: you'll need an Apple ID signed into Xcode to set up
signing and provisioning, and to change `com.booksandruns.app` in
`capacitor.config.json` (and `ios/App/App/Info.plist`'s `CFBundleURLTypes`)
to a bundle ID registered under your account. An App Store submission would
additionally need a paid Apple Developer Program membership ($99/year) —
not currently pursued.

## Contract-aware AI discards

`deadCards()` (`src/ai/strategy.ts`) previously judged a card "dead" purely
by duplicate-rank count in hand — it had no concept of runs at all, so on
run-heavy rounds (3, 5, 7) AIs would routinely discard the only card
building toward a run they badly needed. It's now scoped to
`CONTRACTS[state.round - 1]`: it only checks book candidates when the round
needs books, only checks run candidates (reusing `bookCandidates` /
`runCandidates` from `src/meld.ts`) when the round needs runs, and only
treats a candidate's cards as "live" if it's completable with the wilds
currently in hand.

## Known gaps

- Stats are tracked for the device owner only (the first human player seat,
  "You") — other pass-and-play participants at the table aren't assumed to
  have their own accounts.
