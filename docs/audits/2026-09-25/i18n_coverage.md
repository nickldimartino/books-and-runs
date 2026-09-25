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
