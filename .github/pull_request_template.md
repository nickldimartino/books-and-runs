## What & why

<!-- One or two sentences. -->

## Checklist

- [ ] User-visible text: every new string goes through `t()`/`tPlural`, exists in `en.ts` and all 9 locale files, and `npm run i18n:check` passes (see AGENTS.md "Adding user-visible text"). N/A if this PR adds no UI text.
- [ ] Checked new/changed screens in de, ru and ja at mobile width (overflow/truncation), or N/A.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` pass.
