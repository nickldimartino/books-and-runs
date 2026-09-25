# Books & Runs — Social/Multiplayer + Technical/PWA Audit (read-only, 2026-09-25)

Method: read AGENTS.md + CODEBASE_MAP.md §8/§9 (security, cheat, load, feature audits are NOT repeated); grepped `app/`, `supabase/`; measured the existing `out/` build (dated 09:21, same day as HEAD; pre-dates only a test-spec commit) by static analysis of every route's HTML, gzip/brotli-sizing referenced chunks, and a mobile Lighthouse run against a static server on :4173 (since stopped). No repo files edited, no production calls made.

## 1. Executive summary

Foundations are strong: server-authoritative MP, friend codes and share links, clubs, tournaments, seasonal board, 10 languages, push, export, update banner. Against modern social-game standards the gaps are almost entirely *the human layer*, not the engine:

1. **No safety/moderation layer**: no block, no mute, no report for names/bios/users (only profile photos), no display-name/bio filter, no age gate, and account deletion is a `mailto:` to the developer's personal address (hardcoded in the shipped bundle text). This is the biggest store-readiness and GDPR risk.
2. **No turn clock or AFK handling**: an unresponsive friend blocks a game forever, and the 3-active-game cap turns that into a slot-hostage problem. Only a manual nudge (1 per 6h) and manual resign exist.
3. **No communication or reactions** in game, no rating/ranked loop, no matchmaking beyond "friends".
4. **Tech**: Lighthouse mobile perf 81 (LCP 4.1s, CLS 0.132 on Home); ~260–300 KB gz JS on *every* route because providers/English dictionary are eager; SW has cache-poisoning-style staleness bugs (`/init.js` cache-first, unbounded cache); no install prompt, `storage.persist`, app badge, web-vitals, or hreflang.

Accessibility, best-practices, SEO Lighthouse scores are all 100.

## 2. Strengths (at/above standard)

- Authoritative sealed server state, redacted views, per-action MP moves; realtime refresh with ordered/coalesced responses (stale response can't roll back a board).
- Friend-code UX: `BR-XXXXX`, one-tap share link `/friends?add=`, image share card via `navigator.share`, signed-out visitors routed through sign-in with `?next=` (better than many indie games).
- Friends-only leaderboard scope toggle, monthly season view (`season_snapshots`), per-deal Daily Deal friend board, clubs with re-ranked standings, tournaments, one-tap rematch (`multiplayer/play/page.tsx` ~L568-593), nudge with sane rate limits (mig 0017: 8/h per caller, 1/6h per game).
- Push: VAPID, dead-endpoint cleanup on 404/410, per-game `tag` (collapses duplicates), deep-link `url` on notificationclick, opt-in soft-ask at onboarding, streak-at-risk pushes for Daily Deal/Weekly.
- Account: self-serve JSON data export, 2FA, account-switch data isolation, settings sync across devices, COPPA-style "under 13 / higher local age" clause in Privacy.
- PWA: `display_override`, `id`, categories, maskable icons, safe-area (`viewport-fit=cover`), per-theme `theme-color` kept in sync (init.js + applyTheme), pre-paint theme/lang init, update banner that re-checks on `visibilitychange`, offline fallback page, dynamic-import locale dictionaries (other 9 lazy, ~36 KB gz each), no webfonts (system stack -> zero font cost), no third-party scripts, Supabase SDK lazy (CI guarded by `scripts/check-bundle.mjs`), reduced-motion handled, sitemap/robots/OG image (1200x630), analytics anonymous by design, tight CSP/headers.
- Lighthouse a11y/best-practices/SEO = 100; TBT 0 ms; JS bootup 0.1 s; CSS 18 KB gz single file.

## 3. Findings — Social / Multiplayer (ranked)

**S1 (High) No block / mute / user report; only photo reports.**
Standard: Xbox/PSN/Steam/Clash Royale/WWF all ship block + report-with-reason on profile and in-game; Apple App Store guideline 1.2 *requires* report + block for UGC/user-to-user apps. Current: only `report_profile_photo()` (mig 0025/0049) exists; display names and free-text `bio` (140 chars, shown to opponents in OpponentStrip popover) can't be reported; friend requests/invites from anyone who has your code or finds you on the leaderboard (leaderboard Add-friend on every row) have no decline-and-block option. Rec: `blocks(user_id, blocked_id)` table; block hides you from their leaderboard add button/friend-code lookup/invites and auto-declines requests/invites; generic `report_user(target, kind[name|bio|photo|behavior], reason)` RPC reusing `mp_bump_rate_limit`; entries in Player page + OpponentStrip + game-over. Effort M.

**S2 (High) Account deletion is manual email; personal address embedded in client.**
`app/account/page.tsx` ~L477 uses `mailto:[contact address]` (also in the translated privacy/account strings via that page). Standard: GDPR Art. 17 self-serve; Apple guideline 5.1.1(v) requires in-app account deletion for any app with account creation; Google Play requires an in-app + web deletion path. Also leaks a personal address to scrapers. Rec: `delete-account` Edge Function (service role: cascade profiles/leaderboard/friendships/mp_participants -> anonymise finished games' seats to "Deleted player", resign active games, remove avatar storage object, then `auth.admin.deleteUser`), re-auth/typed-confirm UI, and use the `contact` function instead of a raw mailto. Effort M.

**S3 (High) No turn timer / AFK / auto-forfeit; abandoned games hold slots hostage.**
Standard: WWF (5-day forfeit + warnings), Chess.com/Lichess correspondence (per-move days), BGA (turn clocks, "kick" on expiry). Current: mig 0014 header says explicitly "Nothing here forfeits or cancels a game"; only manual resign. The `MP_GAME_CAP = 3` (mp/index.ts L64, counts pending+active for host and each invitee) means one silent friend permanently burns a slot for the other — a griefing/annoyance vector and a retention leak. Rec: per-game `turn_deadline` (host option: 1/3/7 days, default 3), a pg_cron sweep at ~75% -> reminder push, at 100% -> auto-play/auto-skip (draw+discard highest-value card via existing AI hard-coded fallback) for N strikes then auto-resign; show "Zara has 18h left" chip in HomeGames. Also let a stalled *pending* invite auto-expire (e.g., 7 days). Effort M-L.

**S4 (High) Realtime/resume robustness: no refetch on foreground or reconnect.**
`useMpGame.ts` ~L362-372 and `useNotifications.ts` only refresh on Postgres-change events. iOS/Android suspend websockets in the background; events missed while backgrounded are never replayed, so a returning player can stare at a stale board/badge until they act (the ordered-refresh logic protects against stale *responses*, not missed *events*). Grep shows no `visibilitychange`/`online` handler in either. Rec: `refresh()` on `visibilitychange->visible`, `online`, and channel `SUBSCRIBED` status after a drop; same for notifications badge. Effort S.

**S5 (Med) No quick chat / emotes / reactions.**
Standard: Clash Royale emotes, Marvel Snap limited emotes, Hearthstone "Well played/Thanks/Oops", WWF chat, Uno! reactions. Async games without any expressiveness feel like solitaire with delay. Rec: safe canned-phrase + emoji reaction set (8-12, localised via `t()`) attached to the last turn (`mp_reactions` row per game/turn; push "Zara reacted 👏"), mute-able. No free-text chat needed (avoids moderation burden). Effort M. Cheaper win: show a per-turn "what happened" recap when it's your turn (a static "opponent melded 2 books" push body — `PUSH_COPY` is generic: "It's your move", mp/index.ts L133-138).

**S6 (Med) Notification strategy is one master toggle.**
Standard: per-type toggles (turns / invites / friend requests / streaks / marketing), quiet hours, badge counts, collapse. Current: single push on/off in Settings; Daily Deal reminder fires from one daily cron (mig 0038) in UTC — not the user's local time; `your_turn` and `nudge` push twice-ish (the nudge inserts both a `your_turn` and `nudge` event -> two pushes; the `tag` mp-<id> collapses them visually, fine, but verify `renotify`); game_over/friend accepted never pushed (may be intentional); no `navigator.setAppBadge`. Rec: `notification_prefs` on `settings` (per-kind bools + quiet-hours window + tz), honoured in `sendPushForEvent`; store IANA tz to schedule reminders at local ~18:00; set app badge from `useNotifications.total` and in the SW push handler. Effort M.

**S7 (Med) No ratings/ranked; leaderboard is level-based and fetches everything.**
Standard: Elo/Glicko-2 (Clash trophies, Hearthstone ranks, BGA ELO) with seasons and soft reset; "around me" view. Current: leaderboard sorts on level/XP (grindable — it's the *time* metric, not skill), and `app/leaderboard/page.tsx` L306-336 does `select("*")` with no `.limit()`/pagination — PostgREST's default 1000-row cap will silently truncate the board (and mis-rank) once >1000 active accounts, and it ships every row's columns to every viewer. Rec: server-side ranking RPC (`leaderboard_page(sort, offset, limit)` + `my_rank()`), "You are #N" sticky row, friends board via RPC; then an MP-only Glicko-2 rating updated in `recordMpGameOutcome` (only 2+ human games, rated flag) with monthly soft-reset using existing `season_snapshots`. Effort M (RPC/pagination), L (rating).

**S8 (Med) No matchmaking / play-with-strangers / open invite link.**
Standard: WWF "random opponent", Uno quick match, Discord activities "join via link". Current: opponents are friends only or AI (`new-game/multiplayer`); invite = friend inbox only. A friendless new player can't ever try the headline feature. Rec: (a) game invite *link* (`/multiplayer/join?code=`, deep-links through sign-in like `/friends?add=`) reusing friend-code plumbing, share via `navigator.share`; (b) opt-in "find an opponent" queue for async 2-player with level bands; the anti-smurf story comes free once ratings exist. Effort M (link), L (queue).

**S9 (Med) No display-name / bio content filter; no age gate at sign-up.**
Only uniqueness + length + no control chars (mig 0013/0024). Standard: profanity/slur filter on public strings (App Review expects it with UGC), age screen (neutral DOB or "I am 13+/16+ per region") on sign-up. `sign-in/page.tsx` shows only Terms/Privacy links. Rec: blocklist RPC check in display-name/bio setters (server-side, multilingual list) + a 13+ checkbox recorded with consent timestamp. Effort S-M.

**S10 (Low-Med) Presence & recent players.**
No last-seen/online dot; no "recent opponents" list to add after a game (WWF/Xbox surface this at game-over). Rec: after game-over show "Add friend" on non-friend human opponents (data already in `mp_participants`); optional coarse presence ("active today"). Effort S (add-from-game-over).

**S11 (Low) Clubs lack chat/events/goals; tournaments are round-robin only.**
Clubs are scoreboards. Standards: club goals ("club wins 50 games this week"), announcements. Tournaments: no bracket/knockout/Swiss; no scheduling. Rec: weekly club goal on existing standings + a pinned message; knockout option for 4/8 players. Effort M-L. (Deprioritise until S1–S5 exist.)

**S12 (Low) Weekly Challenge and other modes have no friend board** (CODEBASE_MAP §3d notes Weekly Challenge "no per-challenge friend leaderboard yet"; Daily Deal has one). Effort S-M, mirrors mig 0018.

**S13 (Low) Cosmetic showcase/gifting:** big cosmetics catalog with Trophy Case; no gifting, no "showcase to friends" moment beyond share card; Boutique gate is creator-only pending real purchase. Note only.

## 4. Findings — Technical (ranked)

**T1 (High) Service worker: `/init.js` is cache-first and never invalidated; cache grows unbounded.**
`public/sw.js` caches every `script|style|image|font` request cache-first under the fixed name `br-shell-v1`. Next content-hashes `_next/static/*`, but **`/init.js`, `/icons/*`, `/apple-icon.png`, `/icon.png` are un-hashed**: once cached, a returning visitor never gets an updated `init.js` (theme/locale ID lists — its own header says they must be hand-synced when adding a theme or language; a new theme id would fail to apply pre-paint for every existing installed user forever, until SW cache name is bumped). Also every past deploy's hashed chunks stay in the cache (no eviction, no bump) -> storage bloat on installed PWAs; navigations are cached per full URL including `?g=<uuid>`, `?id=`, `?add=` variants (unbounded, also stores pages with query strings). Navigation is network-first with **no timeout**: on lie-fi the page hangs instead of falling back to cache. RSC `.txt` payloads (fetch destination "") are not cached, so offline client-side route changes fail even for visited pages. Rec: stale-while-revalidate for un-hashed same-origin files; version cache name from build id (`CACHE_NAME = "br-shell-" + BUILD_ID`) and prune; cap entries (LRU ~60); `ignoreSearch` keying for navigations; 3-4 s network timeout race; cache `_next/static` + `.txt` GETs. Effort S-M.

**T2 (High/Med) Home CLS 0.132 (>0.1 "needs improvement") and LCP 4.1 s (mobile Lighthouse, simulated Slow 4G/4x CPU); perf score 81.**
Lighthouse (`/tmp/lh_home.json`): FCP 0.9 s, LCP 4.1 s (element render delay 1.36 s), TBT 0, CLS 0.132. Culprit: the "Daily Deal" section on Home (`main > div.flex > section`, top 604px, 130px tall) shifts after hydration (state-dependent copy "Sign in to keep a streak…" swapping in). LCP is likely gated by hydration + the first-visit intro splash (`html[data-intro]::before` covers screen up to 4.5 s in init.js). Rec: reserve fixed min-height for the Daily Deal/Weekly cards and render their final skeleton in the static HTML; end intro splash sooner/skip when Lighthouse or `saveData`; consider splash only for the first-ever visit, not each session (`sessionStorage`). Effort S. (Run field Web Vitals to confirm — see T8.)

**T3 (Med) Every route ships ~257–297 KB gz (830–985 KB raw) JS; providers and English dictionary are eager.**
Measured from `out/*.html`: /(index) 267 KB gz, /game 289, /multiplayer/play 297, /sign-in 257 (lowest), /leaderboard 263, /how-to-play 257. The floor (257 KB gz, sign-in) means ~all cost is the shared layout: React/Next runtime + providers (`GameProvider`/`GameContext` ~1000 lines + engine + AI strategies + achievements + `en.ts` dictionary ≈44 KB gz chunk `35xagh7m…js`, 112 KB source) mounted for every page including /privacy. Lighthouse flags ~77 KiB unused JS on Home. Rec: (a) lazy-mount `GameProvider` only on `/`, `/game`, `/new-game*` or `import()` the AI/engine chunks at game start; (b) keep en dictionary but split per-route namespace (or move rarely-used prose: terms/privacy/how-to-play/tutorial/achievements 44 families ≈ the bulk) into route-level dynamic dictionaries; (c) measure with `@next/bundle-analyzer` equivalent. Target <180 KB gz baseline. Effort M. Low-end: Lighthouse simulated 4x CPU still shows TBT 0 and bootup 0.1 s, so runtime cost is fine; it's the download/parse on cellular.

**T4 (Med) No install UX, no storage persistence, no app badge, no manifest richness.**
Grep finds none of: `beforeinstallprompt` (Android/desktop install button), iOS "Share -> Add to Home Screen" hint, `navigator.storage.persist()` (an evictable localStorage holds the in-progress solo save, achievements pending queue, pending saves — Safari's 7-day ITP eviction applies to non-installed sites), `setAppBadge`, `manifest.screenshots` (already known/open), `shortcuts` (New game / Daily Deal / Continue), `share_target`, `prefer_related_applications`. Also no `<meta name="mobile-web-app-capable"/apple-mobile-web-app-*>` or `apple-touch-startup-image` splash. Manifest `orientation: "portrait"` is unlocked in Android WebView/TWA but forces a locked layout on tablets/desktop windows — consider `"any"`+CSS or `portrait-primary` only for phones. Manifest icons: identical PNG declared for `any` and `maskable` (comment says safe-zone OK — verify with maskable.app; icon art at 512 has *no* separate monochrome icon). Rec: install prompt after first completed game (deferred `beforeinstallprompt`), iOS hint in Settings/Home; call `navigator.storage.persist()` after first save/sign-in; add `shortcuts` (Daily Deal, Continue, Friends), 2-3 `screenshots` (also unlocks Chrome's richer install dialog), badge API. Effort S-M.

**T5 (Med) No field performance/error-rate telemetry.**
`analytics.ts` (`app_events`) tracks game_started/completed only; `errorReporter.ts` captures errors. No `web-vitals` (LCP/CLS/INP), no SW/offline/push-opt-in funnel counters (push subscribe success/denied, install accepted, update-banner refresh rate). Anonymous by design — vitals fit that (no user id). Rec: `onLCP/onCLS/onINP` -> `track("vitals", {route, metric, value_bucket, connection})`; add `error rate per release` panel (appVersion already stamped). Effort S.

**T6 (Med) SEO / social: single OG image, no hreflang, no structured data.**
`out/index.html`: one `opengraph-image` for all routes (no per-route OG for `/how-to-play`, `/player?id=` shares, or friend invite links `/friends?add=`); no `<link rel="alternate" hreflang>` (language is client-side localStorage only, so the 10 languages are invisible to search — there is one URL); no JSON-LD (`VideoGame`/`SoftwareApplication`/`FAQPage` for how-to-play); sitemap `lastModified: new Date()` on every build (should be real dates); `robots.disallow` OK. Rec: `/how-to-play` FAQ JSON-LD, `SoftwareApplication` on home; per-locale static routes (`/de/…`) only if organic acquisition in other languages matters — otherwise skip hreflang; friend-invite OG ("Join Nick on Books & Runs") needs server-rendered metadata, impossible with static export unless a small Vercel Edge/route; note as trade-off. Effort S (JSON-LD) / L (per-locale routes).

**T7 (Low-Med) Battery/CPU: infinite CSS animations and audio when hidden.**
`globals.css` has 6 `infinite` animations (foil sweeps on rarity rings/banners at 3.2–5 s; card-flip spinner; tutorial pulse); the profile/cosmetics screens with many foil items animate continuously (GPU/battery). No `visibilitychange` handling in `ambience.ts`/`sound.ts`: ambient pad keeps rendering while the tab/PWA is backgrounded on desktop; on mobile OS suspends but resume behaviour untested. No `prefers-reduced-data`/`navigator.connection.saveData` respect (intro splash, share-card canvas, foil). Rec: `ctx.suspend()` on hidden and resume on visible; `animation-play-state: paused` under `html[data-hidden]`; pause foil animations for off-screen items (`content-visibility`/IntersectionObserver); honour saveData for splash. Effort S.

**T8 (Low) Memory / long-session:** no obvious leaks from grep (`setInterval` absent; rAF loops bounded; channels removed in cleanups). `useNotifications` and `useMpGame` each open a Realtime channel — Home + game screen simultaneously is fine. Not measured with heap snapshots (not feasible headless here). Recommend a 30-minute soak in the E2E chaos suite recording `performance.memory`. Effort S.

**T9 (Low) Cache headers/deploy:** `vercel.json` sets only security headers; Vercel's defaults apply (immutable for `_next/static`, `must-revalidate` for HTML). Un-hashed `/init.js` and `/icons/*` fall under the same short default — fine at the HTTP layer; the T1 SW bug is the real issue. Add explicit `Cache-Control: public, max-age=31536000, immutable` for `/icons/*`? (not hashed — no). Leave as-is; add `Cache-Control: no-cache` for `/sw.js` explicitly (Vercel already treats it fine; belt-and-braces). Effort S.

**T10 (Low) a11y of shell:** no skip-to-content link (grep: none), `role="status"` live regions exist for game/toasts (good). Lighthouse a11y 100 on Home. Add skip link and `aria-current` on nav; verify focus return after modals. Effort S.

**T11 (Info) Security headers/CSP:** unchanged from audited state (`unsafe-inline` retained for RSC payload, documented); no regression found. `style-src 'unsafe-inline'` also present.

**T12 (Info) Web push on iOS 16.4+:** works only for Home-Screen-installed PWAs; the Settings push UI should say so and detect "not installed" (`matchMedia('(display-mode: standalone)')`) before prompting, otherwise iOS Safari users see "unsupported" with no path forward. Grep shows `getPushPermission()` returns "unsupported" with no install guidance. Combine with T4 install hint. Effort S.

## 5. Quick wins (each ≤ a day)

1. Refresh MP/notification state on `visibilitychange`/`online`/re-`SUBSCRIBED` (S4).
2. Fix SW: versioned cache name, SWR for `/init.js`, entry cap, nav timeout (T1).
3. Reserve Home Daily Deal card height -> CLS < 0.1 (T2).
4. Replace `mailto:` deletion with `contact` Edge Function ticket now (interim for S2); scrub personal address from bundle.
5. Add-friend button on non-friend human opponents at game-over (S10).
6. `navigator.storage.persist()` + install prompt + iOS A2HS hint (T4/T12).
7. web-vitals -> `track()` (T5).
8. `.limit()` + count on leaderboard query; drop `select("*")` (S7).
9. Reactions-lite: static push body copy ("Zara played — your turn") (S5).
10. Pause ambient audio + foil animations when hidden (T7).

## 6. Bigger bets

- Safety suite: block + report + name/bio filter + age gate + in-app delete (S1, S2, S9) — prerequisite for any store submission.
- Turn clocks + auto-forfeit + reminder ladder (S3).
- Rated MP (Glicko-2) + server-paginated leaderboards with "around me" + seasons rewards (S7).
- Reactions/quick-chat + game invite link + opt-in matchmaking queue (S5, S8).
- Bundle diet: route-scoped providers and dictionary namespaces to get < 180 KB gz baseline (T3).

## 7. Store-readiness (Capacitor / TWA wrapper — brief)

Beyond parked packaging work, likely rejection reasons: no in-app account deletion (Apple 5.1.1(v), Google Play policy), no user block/report for UGC (Apple 1.2), no age rating/age gate flow, Sign in with Apple required if any third-party login is added (none today — email/password only, OK), push permission strings and APNs (web push VAPID won't work inside WKWebView; needs `@capacitor/push-notifications`), tip jar via Stripe Payment Links (Apple IAP rule 3.1.1 — digital tip/cosmetics must use IAP in the iOS build; Boutique purchase later has same constraint; hide `/tip` when `Capacitor.isNativePlatform()`), `ios/App/App/public` is gitignored (fine), and SW/offline behaviour inside native shell should be disabled or verified. TWA needs `assetlinks.json` + manifest `screenshots`.

## 8. Not verified / caveats

- Lighthouse run is one mobile-simulated pass on a local static server (`serve`), not Vercel edge with brotli/HTTP2; absolute LCP will be better in production, CLS finding is layout-based and stands.
- Field CWV unavailable (no telemetry — hence T5).
- No CPU-throttled heap/leak profiling; no live two-player push/realtime check performed.
