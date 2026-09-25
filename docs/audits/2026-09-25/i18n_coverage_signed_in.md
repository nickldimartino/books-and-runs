# i18n coverage report

## Done before the rate-limit cutoff (git diff)
- Dates now use the active locale, not the browser's: app/leaderboard/page.tsx (season label), app/player/page.tsx (joined date, game history dates).
- 87 new keys x 10 languages (update.*, error.*, notFound.*, globalError.*, card.canLayOffTitle, err.* auth/cosmetic/avatar/push/meld/mp).

## Done after
- New app/lib/i18n/serverErrors.ts: translateError() maps English messages from Supabase auth, the `mp` Edge Function, engine/adapter/meld validators and store-thrown Errors to keys (patterns handle {n}/{name}). Applied at display sites: sign-in, reset-password, account (email/password/2FA), player (name/photo/frame/title/banner/badge), new-game/multiplayer, tournaments(/new), settings + welcome push errors, game meld errors, useMpGame (all errors).
- error.tsx, not-found (new NotFoundContent client component), global-error (loadTranslator, no provider), UpdateAvailableBanner (was mounted OUTSIDE LocaleProvider; moved inside), PlayingCard "NEW" badge and lay-off tooltip translated.
- DocumentTitleLocalizer: tab titles (home, how-to-play, history, terms, privacy, 404, all others) localized at runtime.
- History credits list uses Intl.ListFormat (was hardcoded ", and").
- Settings language buttons' aria-label uses Intl.DisplayNames in the UI language.
- privacy.title key (Russian h1 was accusative "Политику...").
- public/offline.html: inline 10-language strings.
- Keys added total: 87 + card.newBadge, meta.homeTitle, privacy.title.

## Live sweep (mobile 375px, iframe, 9 non-en locales x 34 routes; text-node equality vs English baseline + Latin-run check)
Routes: / , how-to-play, terms, privacy, history, sign-in, reset-password, settings (+#display/#audio/#gameplay/#accessibility), settings/theme, card-back, card-face, ambient-song, new-game, new-game/local, new-game/multiplayer, support, tip, scorecard, stats, achievements, leaderboard, friends, clubs, tournaments(/new), multiplayer(/new), player, account, 404.
Result: no untranslated strings beyond proper nouns / valid cognates (Expert, Contact, Bug, Volume, Account, Protanopia...); no horizontal overflow in any locale incl. de/ru/fr/ja/zh/ko. Signed-out gates of sign-in-only routes were checked (their signed-in bodies were not).
Also driven live in ru: new-game/local -> pass gate -> in-game board, hand drawer, invalid-meld error (now translated), opponent popover, whose-turn tip: all translated, no overflow.

## Not verified live (limitation)
Signed-in-only screens (profile, friends, clubs, tournaments, leaderboard, account, MP lobby/play, stats) and round summary / game over / tutorial: creating accounts and entering passwords is outside what I may do, and the live project is production. These were reviewed statically (all strings go through t()); recommend a human pass or the existing e2e specs with a locale set.

## Residual limitations
- Static-export `metadata` (description, OG/Twitter tags, manifest.ts name/description, opengraph-image text, sitemap) is English at build time; only document.title is localized at runtime.
- Push notification bodies from Edge Functions (daily-deal-reminder, mp turn notifications) are English; localizing needs a per-user language lookup + function redeploy (not done).
- Edge Function `contact` errors are not shown verbatim (support page uses a generic translated message). Unrecognized Supabase auth messages fall through in English.
- Proper nouns intentionally English: Books & Runs, AI names, theme/card back/face/song names, easter-egg "Jenny" tip is translated.
- History (de) intentionally keeps English "Book"/"Run" terms.

---

# Signed-in live sweep (2026-09-25, follow-up)

Method: Playwright driving `next dev` against the live Supabase project with 4 throwaway accounts (A main, B friend, C pending friend request to A, D fresh for the onboarding dialog), an active MP game (48h limit), a pending MP invite, a tournament and a club; all accounts removed afterwards (verified none left). Every visible text node, aria-label, placeholder and title was collected per screen and compared with the English dictionary (exact/parameterised match) plus a 3+ consecutive English words check (stop-word aware for Latin-script locales); document overflow, off-screen and clipped elements also checked. 9 locales x mobile 375px (+ de, ru, ja at 1280px desktop): 522 screen snapshots, 0 horizontal overflow, 0 untranslated strings after the fixes below (remaining hits are proper nouns: theme/card-face/banner names "Classic", "The Complete Table", default display names "Player NNNN", the history page's English game name quotes; sr-only "clip" hits are visually hidden text).

| Screen (signed in) | States driven | Result |
|---|---|---|
| Home | fresh-account welcome onboarding dialog, identity chip, closest-achievement card, MP games list (yours / waiting / pending invite), Daily Deal, Weekly Challenge, menu, keyboard help (desktop) | OK. Quests card / welcome-back not rendered live (server-backed, undeployed) |
| Player profile | all 8 edit tabs (picture, badge, trophies, frame, title, banner, boutique, name+bio), locked-item tooltips | GAP FOUND + FIXED: unlock-requirement text ("Unlocks at Level 10", "Master every ... achievement", streak/score rules, "Free") was English in badge/frame/title/banner/boutique tooltips and tap hints |
| Achievements, Leaderboard, Stats, History, Scorecard | default states, incl. challenges category titles | OK (leaderboard shows its error/unavailable state; new RPCs undeployed) |
| Friends | requests list, add-by-code, safety menu, report dialog, block ConfirmDialog | OK |
| Clubs / Tournaments | list, detail (club + series), new tournament | OK |
| Account | data export, delete-account section (open + typed confirm), blocked players (unavailable state) | OK |
| Multiplayer lobby / new / New Game MP | turn-limit picker + notes | OK |
| MP play | board, emotes bar + failed send state, turn badge area, nudge, Leave -> resign ConfirmDialog, player safety summary, keyboard help | OK |
| Settings (5 tabs) | all tabs | OK |

Not reachable live and verified differently: solo round summary, game over (+XP card, daily/weekly result), tutorial (all 15 steps), keyboard help, report dialog (both variants), turn-timer badge (mine/expired/last-chance), ConfirmDialog, install hint, update banner, toasts, gamepad prompts, quests card, welcome-back card, blocked-players list, delete-confirm dialog. Method: (a) throwaway vitest rendering GameOverScreen (regular + daily, mock XP/streak/quest response), RoundSummary, KeyboardHelp, TurnTimerBadge, ConfirmDialog, ReportDialog x2, TutorialOverlay x15 in all 9 locales with the real dictionaries (0 English strings; test removed after); (b) dictionary-level scan of every locale for values that still equal English or contain English word runs (only valid cognates/proper nouns: "Android (Chrome)", "{n} min", "Error 404" etc.); (c) static scan of all app/*.tsx for hardcoded JSX text/aria/placeholder/title (0 hits except the "BR-XXXXX"/"you@example.com" input format hints and the author's name). Components that only appear with undeployed server data (quests, blocks list, leaderboard RPCs, emotes/timer live data) therefore have their strings checked at key level, not live.

## Fixes made in this pass
- New `app/lib/cosmeticRequirementText.ts` (+ unit test) and 21 new keys x 10 locales (`cosmeticReq.*`, `cosmeticReq.gamesTied.one/other` with ru few/many, `player.badge.free`): localised unlock requirements on the profile pickers and card face/back pickers.
- Home MP list: turn-clock chip ("turn ends in 14h" / "overdue", amber in the last quarter, red when overdue) beside the round label, keys `home.turnEndsIn`, `home.turnOverdue`; reuses `turnTimer.unit.*`. Appears once the migration 0061 `mp_my_games` is deployed (older server returns no limit, so nothing shows).
- Error handling: `ReportDialog` and the friends add-by-code flow tested `err instanceof Error`, but Supabase RPC errors are plain PostgrestError objects, so "too many attempts" / "You can't connect with this player" never reached translateError. Now read structurally.

## Server-originated strings (code audit)
- `mp` Edge Function errors: all user-reachable ones were already mapped in serverErrors.ts; added `unknown emote`, `invalid target`, `no such user`, `cannot report yourself`, `invalid report`, `not authenticated`, `unauthorized`, `confirmation required`, `Method not allowed` (-> translated generic / signed-out lines; not reachable from the UI but no longer able to leak English).
- `delete-account`: "Current password is incorrect", "Couldn't leave your games", "Couldn't delete the account", "sign in first" mapped. `contact`: never shown verbatim (generic translated message).
- Content-filter rejections (SQL `content_guard_message`, ContentRejectedError): the four sentences are mapped (safety.content.*). Block/report failures use dedicated translated keys; rate-limit "Too many attempts" mapped.
- Turn-clock: the server sends no sentences (numbers only); copy is client-side (turnTimer.*). Push copy in `_shared/push.ts` is localised server-side for all 10 languages by recipient language (all 10 kinds incl. turn_warning/auto_played/forfeited/emote/streaks present in each).

## Visual snapshots
Baselines are `*-darwin.png` and the tests are excluded from CI (`--grep-invert @visual`, see visual.spec.ts header), so they are a local macOS tool and this machine is the right place to regenerate. Regenerated home/new-game/how-to-play/settings for all 5 projects (20 files; second run passes). The Daylight test was already failing independent of this work: AccountSwitchGuard forces the default theme for signed-out visitors, so seeding localStorage is undone on load; marked `test.fixme` with the reason (its 5 old baselines are left untouched). Nothing needs CI-side regeneration.

## Verification
tsc --noEmit --incremental false: clean. eslint app src e2e sw: clean. vitest: 66 files / 798 tests pass. diffkeys: 0 missing in all 9 locales; placeholders match; no extra keys (only ru few/many plural siblings). `rm -rf .next && npm run build`: succeeds.
