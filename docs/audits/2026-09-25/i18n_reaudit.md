# i18n re-audit (features added since commit 7151e42) and permanent guards

## Scope
All 291 new or changed English keys since 7151e42 plus the uncommitted tree (game speed, reduce motion, legal-move hints, keyboard/gamepad help, discard confirm, quests/XP/welcome-back/identity/Quick Deal, streak shields, block/report/safety/delete-account, turn clock, notification prefs/quiet hours, NotificationBell, install hint, toasts, magic-link/OTP, cosmetic requirements, resign labels, Settings tabs, `translateError`, push copy). Every new key was read in all 9 non-English locales against the English (meaning, terminology, register, placeholders, plurals, length).

## Findings and fixes
Hardcoded English reaching the UI: one real gap. `PlayingCard` wild stand-in badge ("as 7") was a literal; now `card.standInAs` in all 10 locales. Everything else routes through `t()` (source scanner, pseudo-locale e2e, and an AST grep of app/**/*.ts for sentence-like literals; the remaining literals are console messages, `<head>` metadata, English fallbacks not reachable from the UI, and `serverErrors.ts` match keys).
Missing keys / placeholder drift / plural gaps: none (parity test passes). Two real gaps found by the new plural check turned out to be false positives (`safety.reason.*` is not a plural family; fr/es/it/pt "many" only applies to 1e6+ and is not required).

Translation quality fixes by locale:
- **es**: block confirm/description used vosotros ("Dejaréis", "aparecéis") in a Latin-American file, now ustedes; "Coger" (offensive in parts of LatAm) -> "Tomar"; cosmeticReq lay-off category "Descartes en mesa" (means discards on the table) -> "Añadir cartas"; "Signature" -> "Exclusivos".
- **de**: "Spiele n Spiel unentschieden" -> "Beende n Spiele unentschieden"; terms.termination "jederzeit nicht mehr nutzen" -> "Nutzung jederzeit beenden"; "Signature" -> "Signatur".
- **fr**: bell aria "nouvelle(s)" -> "nouvelles : n"; push title "Le temps presque écoulé" -> "Le temps est presque écoulé"; push copy made gender-neutral.
- **it**: terms.termination switched from informal tu to the impersonal formal register used by the rest of terms.*; "aggancio" -> "attacco" (matches "attacca"); bell aria "nuova/e"; "Signature" -> "Esclusivi"; push copy neutral.
- **pt-BR**: "no Rodada Diária" -> "na Rodada Diária" (x2); lay-off/meld categories "Encaixes"/"Jogos baixados" -> "Acréscimos"/"Combinações" (match the file's acrescentar/combinar); stray "»" at the start of privacy.export.bodyMiddle (rendered "Baixar meus dados » que…"); bell aria; "Signature" -> "Exclusivos"; push copy neutral.
- **ru**: "+50 штрафа" (wrong noun form after a number) -> "штраф +50"; gendered "Ты собрал" -> neutral; weekly-shield explainer rewritten ("Одного щита можно добиться серией…" was garbled); "Signature" -> "Фирменные"; lay-off category -> "Подкладывание"; push copy neutral ("сделал(а)", "засчитана как сдача").
- **ja**: notifications.pushError used casual "ね" -> polite; lay-off category "付け札" -> "レイオフ" (matches the file); Quick Deal summary "AI 1 簡単 + 1 難しい人" (suffix "人" only on the last item) -> "AI（1 簡単 + 1 難しい）"; five "ライバル：…AI" achievement titles shortened (Expert was truncated at 375px).
- **zh**: contract category "合同" (legal contract) -> "定约" (the file's term); "…困难 个 AI" -> "AI（…）"; game.why.groupMore reworded; ASCII "," "?" -> full-width in 3 strings and the push copy.
- **ko**: keyboard sheet "선택한 카드 선택/해제" -> "포커스된 카드 선택/해제"; lay-off category "붙이기" -> "레이오프".
Layout: Quick Deal summary was `truncate` (cut off in ja/zh); now `line-clamp-2`.
Push copy (`supabase/functions/_shared/push.ts`) changes need `supabase functions deploy mp daily-deal-reminder` to go live (not done here).

## Live pass (Playwright/Chromium, 375px, 9 locales)
Home (returning guest: quests card, Quick Deal, sign-in prompt), all 33 guest routes incl. every Settings tab with info panels open, local game (board, keyboard-help sheet, fake gamepad prompts, hand drawer), game at 1280px, install hint (Chromium prompt + iOS Safari variant), offline/online toasts, magic-link "enter your email" error. Detector: visible text nodes/attributes equal to the English baseline, ASCII 3+ word runs in zh/ja/ko/ru, horizontal scroll, off-screen and ellipsis-clipped text. Result: nothing untranslated beyond proper nouns/cognates/keycap legends; no horizontal overflow; the only clips were the ja/zh ones fixed above (plus sr-only "What does this do?" labels, false positives). Screenshots of de/ru/ja keyboard help, gamepad prompts, board, wide layout and install hint were inspected.

### Not verified live
Signed-in-only surfaces (identity chip, XP/shield rows, bell dialog with real items, account safety/delete sections, notification prefs, MP play page, real magic-link/OTP delivery). Creating throwaway accounts on the live Supabase project (a remote identity provider) is outside what an agent may do without the owner doing it, so those were covered statically only: parity, source scanner, component tests. Run the live specs (`e2e/live-*.spec.ts`, `home-progress`, `notification-bell`) with the service key locally and eyeball de/ru/ja at 375px.

## Guard design
1. `app/lib/i18n/dictionaries/parity.test.tsx` (vitest, app project): identical key sets, identical `{placeholder}` sets, plural forms required by `Intl.PluralRules` (categories reachable for 0..1000), no empty values, and "looks untranslated" (non-en value identical to English, >3 letters). Exceptions: `app/lib/i18n/sameAsEnglishAllowlist.ts` (per key, per locale, with a reason; stale entries fail). Failures print the exact keys.
2. `app/lib/i18n/hardcodedText.test.tsx`: `@babel/parser` scan of app/**/*.tsx for JSX text, `{"literal"}` children, `aria-label/title/placeholder/alt/label` literals (also in ternaries/`||`), and `setError("…")`-style calls. Exceptions: `hardcodedAllowlist.ts` (reasoned). Babel, not the TS API, because TypeScript 7 ships no JS compiler API and typescript-eslint doesn't support it; `eslint-plugin-i18next` was not added (redundant and it would need the same parser workaround).
3. Dev-only pseudo-locale: `pseudoLocale.ts` + `LocaleProvider` (`?lang=xx` or `localStorage booksAndRuns:pseudoLocale=1`; `NODE_ENV !== "production"` only; not a `LocaleId`, not in the picker; confirmed absent from the production bundle). `e2e/pseudo-locale.spec.ts` (no secrets): 33 routes + a local game, fails on 3+ plain ASCII words, with a self-test proving the detector fires. Runs in the existing CI e2e job on all 5 browser projects (~10 s per project).
4. Process: AGENTS.md "Adding user-visible text" checklist, mirrored in CODEBASE_MAP.md 3e, `.github/pull_request_template.md`.
5. CI: `npm run i18n:check` step in `check`; vitest guards also run under `npm test`; pseudo spec included by `test:e2e:ci`.

Run: `npm run i18n:check` (fast, unit) and `npx playwright test e2e/pseudo-locale.spec.ts` (routes).
