<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Adding user-visible text (mandatory checklist)

The app ships in 10 languages (en zh ja ko de fr es pt-BR ru it). Anything a player can see, hear via a screen reader, or receive as a push must be translatable. Guards below fail CI when this slips; follow the list so they never have to.

1. **Use `t()`.** `const { t, tPlural } = useT();` — never a literal in JSX text, `aria-label`, `title`, `placeholder`, `alt`, `label`, or a toast/error string. Plain helpers take `t`/`tPlural` as parameters.
2. **Add the key to `app/lib/i18n/dictionaries/en.ts` first, then to all 9 other locale files** with identical `{placeholder}` sets. Match the terminology already used in that locale file (book/run/meld/lay off/discard/contract/shield/streak/quest/XP), informal register in the UI (formal only in `terms.*`/`privacy.*` for de/fr/es/ru/it), and avoid vosotros in `es` (the file is Latin-American).
3. **Plurals go through `tPlural`** with `.one`/`.other` siblings (Russian also `.few`/`.many`). Never write `count === 1 ? "" : "s"`.
4. **Server / Edge Function text:** return a stable code or English message that `app/lib/i18n/serverErrors.ts` maps (`translateError`), or, for pushes, add the copy to every locale table in `supabase/functions/_shared/push.ts` (needs a function redeploy).
5. **Never bake translated text into state or module scope at mount** — the dictionary can still be loading on a hard load. Translate at render.
6. **New pages** are a thin `page.tsx` (metadata) plus a `*Content.tsx` client component that calls `useT()`; add the tab title to `DocumentTitleLocalizer`.
7. **Deliberately untranslated:** "Books & Runs", AI opponent names, cosmetic item/theme/card-back/face/song names. Anything else that is legitimately identical or literal goes in `app/lib/i18n/sameAsEnglishAllowlist.ts` / `hardcodedAllowlist.ts` **with a reason**.
8. **Run `npm run i18n:check`** (dictionary parity + hardcoded-text scanner + pseudo-locale unit test) before finishing. For any new route/screen also run `npx playwright test e2e/pseudo-locale.spec.ts` (loads routes in the dev-only pseudo-locale, `?lang=xx`, and fails on plain English) and add the route to its `ROUTES` list.
9. **Look at it in de, ru and ja at mobile width (375px)** for overflow/truncation — those three are the longest and the widest-glyph locales. Signed-in-only screens are not covered by the pseudo-locale spec; check them by hand or with the live specs.
