# Books & Runs: game feel, input and accessibility audit (2026-09-25)

Method: read AGENTS.md and CODEBASE_MAP.md §8/§9 (past audits covered security, cheat-prevention, cosmetics, i18n, and the S-tier and UX audits, so none of that is repeated here). Then read the code (GameContext.tsx, game/page.tsx, DraggableHand, PlayingCard, HandPreviewBar, CardFlightLayer, sound.ts, haptics.ts, settingsStore, CSS) and drove a solo game live at 375x812 and 1440x900.

Caveats:
- The browser harness was flaky (a stray navigation to /how-to-play mid-game), so live coverage is partial. Draw, open drawer, select, discard, confirm and the AI "thinking" state were verified.
- I did not verify per-theme WCAG contrast numerically.
- Findings marked (code) come from source only.

## Executive summary

The fundamentals are strong: real card faces, a card-flight system, an undo ring, colorblind modes, screen-reader labels on every card, synthesized SFX and haptics, and a focus-trapped drawer.

The moment-to-moment loop is heavier than the genre standard, and some table-stakes accessibility and input features are absent:
- No game-speed or animation-speed control.
- No gamepad support.
- No keyboard shortcuts.
- No "reduce motion" setting inside the app.
- The board opts out of text scaling.
- Every solo turn goes through a pass-the-device gate and a modal hand drawer, and every discard needs a confirm.

The biggest wins are removing friction from a solo human turn (gate, drawer, discard confirm), a speed setting, and a keyboard/gamepad layer.

## Strengths (at or above standard)

- **Card-flight system:** CardFlightLayer animates draw, discard, meld and lay-off flights (380ms), honors prefers-reduced-motion, and staggers the cards of a meld.
- **AI turn feedback:** the AI "thinking…" line and persona blurb show during the AI turn (verified live). The result note ("Reynard melded X +2") is kept on screen for a 900ms hold between AIs.
- **Undo:** a 6s grace ring (UNDO_GRACE_MS) plus an undo sound. Balatro and Hearthstone have nothing comparable.
- **Screen-reader basics:**
  - Each hand card has role=button, an aria-label such as "2 of spades, wild", and aria-pressed.
  - There is a polite live region for turn announcements (game/page.tsx:1106).
  - The drawer has a focus trap and Esc to close.
  - The opponent status line is announced.
- **Card readability:** colorblind modes (protan/deutan/tritan), 3 text scales, layoff badges, a NEW badge on the drawn card, and wild cards tinted.
- **Sound and haptics:** synthesized SFX with an independent volume, ambient music that is opt-in (off by default), a separate haptics toggle, a tutorial audio override, and an AudioContext resume path.
- **Drag input:** long-press-to-drag reorder with pointercancel handling and touch-action:none; tap and keyboard (Enter/Space) selection stays in parity.
- **Table and layout:** safe-area insets and viewport-fit=cover, a sticky opponent strip, and a persistent hand preview bar.
- **Difficulty:** 5 AI tiers with persona blurbs, plus a Daily Deal, a Weekly Challenge and a tutorial.

## Findings, ranked by impact/effort

### 1. High (S/M): a pass-the-device gate on every turn of a solo game
- **Modern games:** never interrupt a single human vs AI. Pass-and-play games gate only when a human hands off to another human.
- **Current state:**
  - The "Pass the device to You / I'm ready — show my hand" screen appeared at game start and appears after every AI turn in a 1-human game. Verified live on mobile and desktop.
  - GameContext.tsx sets `setAwaitingReveal(true)` unconditionally when the next player is human (lines 541, 550, 629, 807, 890, 933).
  - Rendered at game/page.tsx:634 via components/PassGate.tsx.
  - This adds one full-screen tap per round-trip and hides the board and discard result the moment the AI finishes.
- **Recommendation:** skip the gate when `humanCount === 1`. The same applies at game start. Keep it only when 2+ humans share the device (and after a human's turn hands off to a human).
- **Effort:** S.

### 2. High (M): the hand is not directly playable
- **Modern games:** Balatro, Hearthstone, Snap and Uno keep the hand permanently on the table, and you tap or drag the card to play it. Solitaire apps show the table and the hand together.
- **Current state:**
  - The only hand on the board is HandPreviewBar, which is read-only: 34x50px fanned corner-index cards, 14px step (HandPreviewBar.tsx:20-32).
  - Any action means tapping the bar to open a modal drawer (game/page.tsx:1536-1560) that covers the table, discard pile and opponents.
  - A turn takes about 6 taps: draw, open drawer, select, Discard, Confirm, and Done or auto-close.
  - While the drawer is open you cannot see the discard pile or your melds. Lay-off closes the drawer and scrolls to the table (handleLayOffFromDrawer).
  - The Discard pile and Draw pile are not drag targets. DraggableHand only reorders.
- **Recommendation:**
  - Make the preview bar interactive: tap to select, with a Discard/Meld action strip next to it.
  - Or make the drawer a non-modal, half-height sheet so the piles stay visible.
  - Add drag-to-discard onto the pile, and drag-to-meld for lay-offs.
  - Keep the full drawer for heavy meld-building.
- **Effort:** M/L.

### 3. High (S): a confirm on every discard
- **Modern games:** discards are free actions, and undo covers mistakes. Confirmations are reserved for irreversible or costly actions.
- **Current state:**
  - Discard, then a "Discard the Queen of hearts and end your turn? Confirm/Cancel" prompt (game/page.tsx:821, 1019). Verified live.
  - The existing 6s undo ring (UNDO_GRACE_MS) makes this redundant.
- **Recommendation:** add a "Confirm discards" toggle in Settings (default off for experienced players) and rely on undo. Or skip the confirm when the selection was deliberate, for example a double-tap.
- **Effort:** S.

### 4. High (M): no game-speed, skip-animation or AI-pacing control
- **Modern games:** Balatro has game speed 0.5-4x, Hearthstone has fast AI, and BGA has fast-play. Marvel Snap has quick play.
- **Current state:**
  - AI_TURN_DELAY_MS=450 and AI_RESULT_HOLD_MS=900 are hardcoded (GameContext.tsx:227-228). FLIGHT_MS=380 is also fixed.
  - There is no setting in HouseSettings for speed, and no tap-to-skip on the thinking state.
  - A 4-AI game therefore has a fixed floor of 4x1.35s+ per round-trip.
  - The whole AI turn also lands as one instant state change, so the AI draw is not shown (only the discard flight is emitted, at about line 610).
- **Recommendation:**
  - Add a "Game speed: Relaxed / Normal / Fast / Instant" setting that scales the three constants.
  - Tap-to-skip the AI hold.
  - Emit a face-down draw flight for AIs (and a face-up flight when they take the discard) so the opponent's turn reads.
- **Effort:** S (setting) and M (AI draw flight).

### 5. High (M): no in-app "Reduce motion", and no reduced-motion coverage of the main game animations
- **Modern games:** offer a reduced-motion toggle that works regardless of the OS, plus a WCAG 2.3.3-style motion audit.
- **Current state:**
  - Only the OS prefers-reduced-motion media query is honored (globals.css, CardFlightLayer, Confetti, IntroSplash, foil).
  - There is no in-app control. That is not an option on kiosk or corporate machines, and it is not synced like the other prefs.
  - The lifted card, hover-translate and card-enter animations need a check. The button:active scale is handled.
- **Recommendation:** add a Settings toggle (Motion: System / Reduced / Full) that sets a `[data-reduce-motion]` attribute on `<html>`, and have the CSS and CardFlightLayer key off both. Sync it via accountSettingsSync.
- **Effort:** S/M.

### 6. Med (M): no gamepad or console-style navigation
- **Modern games:** Xbox/PS/Switch/Steam Deck players expect D-pad focus with A/B/Y prompts, and PWAs on Steam Deck and TV browsers are common.
- **Current state:** there is zero Gamepad API use (grep found none) and no focus-ring navigation model. The browser's Tab focus is the only route.
- **Recommendation:**
  - Add a small `useGamepad` hook that maps D-pad and stick to arrow-key focus movement, A to click, B to Escape and Y to draw. This can build on the keyboard layer in item 7.
  - Show button prompts when a pad is detected.
  - Put spatial arrow-key navigation on the hand.
- **Effort:** M/L.

### 7. Med (M): keyboard play is possible but slow, and there are no shortcuts
- **Current state:**
  - Only Esc (drawer) and Enter/Space on cards are handled (game/page.tsx:326, DraggableHand:389).
  - There is no shortcut for Draw pile (D), Draw discard (F), Discard (X), Confirm meld (M), Undo (Ctrl+Z / U) or Sort, and no roving-tabindex arrows in the hand.
  - Tabbing through 13 cards is 13 stops.
  - Hover exists on cards, and there is no right-click menu.
- **Recommendation:**
  - Add a shortcut map with a "?" overlay listing the bindings.
  - Use a roving tabindex with Left/Right in the hand.
  - Have Undo respond to Ctrl+Z.
- **Effort:** M.

### 8. Med (S): the game board is excluded from text scaling
- **Modern games:** WCAG 1.4.4 needs 200% text scale, and users with low vision most need larger text during play.
- **Current state:**
  - `<main data-no-text-scale>` (game/page.tsx:1101) and textScaleStore deliberately exclude the game board, "out of scope."
  - HandPreviewBar cards use fixed px, and the tiny 9px badges (NEW, layoff arrow, "as X") are illegible on a phone.
- **Recommendation:**
  - Let the text scale apply to game text (contract, status line, buttons).
  - Raise the badge fonts to 11-12px minimum.
  - Add a "Large cards" option for the hand.
- **Effort:** S/M.

### 9. Med (M): no legal-move highlighting and thin why-rejected feedback
- **Modern games:** Hearthstone highlights playable cards, and Solitaire apps show valid drops and give hints.
- **Current state:**
  - Only lay-off badges ("↓") exist, plus an optional Auto-meld hint, which is off by default.
  - Pre-meld, nothing shows which cards contribute to the contract (books/runs in progress, "2 of 3 needed").
  - The drawer's Group / Confirm Meld buttons are greyed with no reason shown.
- **Recommendation:**
  - Add a progress line under the contract ("Book of 9s: 2/3, need 1 more") and soft-highlight candidate cards, behind an Assist toggle.
  - Add a disabled-reason tooltip or inline text on Confirm Meld / Discard.
- **Effort:** M.

### 10. Med (S): AI turns are silent, and sound is missing for several events
- **Modern games:** every opponent action has a whoosh or thud, and the same sound is layered for draw / deal / shuffle / score tally.
- **Current state:**
  - sound.ts has 8 sounds (tap, slide, meld, round-win, game-win, undo, achievement, level-up).
  - runAiLoop (GameContext.tsx:534-635) plays none. The AI's draw, discard and meld are silent.
  - There is no shuffle/deal sound, no score-count tick, no "your turn" cue, and no near-win/low-deck cue.
- **Recommendation:**
  - Play playCardSlide on the AI discard flight and playMeld on an AI meld.
  - Add a soft "your turn" chime.
  - Add a deal riffle at round start.
  - Duck the ambient bed under SFX.
- **Effort:** S/M.

### 11. Med (S): a hand-size and layout gap on wide screens, TV and landscape
- **Modern games:** use the full width, with a side-by-side table and hand layout and left/right-handed options.
- **Current state:**
  - The board is `max-w-2xl mx-auto` (game/page.tsx:1102), so on a 1440px desktop it is a narrow column of about 670px with a lot of empty space.
  - Landscape phones have no dedicated layout, and there is no 10-foot mode (min font, focus rings).
  - The hand-preview bar and drawer are clamped to the same width.
- **Recommendation:**
  - Use a two-column layout at >=1024px: table left, hand and actions right, and a larger fan.
  - Add a landscape layout and a left-handed mirrored layout toggle.
  - Add a TV mode for large focus rings.
- **Effort:** M/L.

### 12. Med (S/M): layout shift on draw
- **Current state:**
  - Drawing removes the "Draw a card from the pile or discard pile to start your turn." banner, and the Table melds panel jumped up about 145px and the hand count changed (before/after screenshots, 375px width).
  - The hint banner reflows the piles and the melds during play.
- **Recommendation:** reserve the banner's height, or use an overlay, so the target areas don't move under the finger.
- **Effort:** S.

### 13. Low/Med (S): missing accessibility options
- **Modern games:** dyslexia-friendly font, left-handed layout, high-contrast / forced-colors, reduced-transparency, and turn-timer accommodations. The grep found none of `dyslex`, `leftHand`, `prefers-contrast`, `forced-colors` or `prefers-reduced-transparency`.
- **Current state:**
  - There is no forced-colors or prefers-contrast handling, and translucent felt overlays (bg-black/50 and similar) are always on.
  - There is no turn timer, which is good for accessibility, though an opt-in timer would suit async MP and quick play.
  - `select-none` is applied only on the hand, so text on the rest of the page can be selected and double-tap zoom is possible.
  - There is no overscroll-behavior rule (grep found none).
- **Recommendation:** add `overscroll-behavior: none` on the game route, `@media (prefers-contrast: more)` and `forced-colors` rules, an opt-in font choice, and a `touch-action: manipulation` rule on buttons to remove double-tap-zoom delay.
- **Effort:** S each.

### 14. Low (S): haptics are minimal on the web
- **Current state:** haptics.ts has only light/medium/success, all via navigator.vibrate on Android web (iOS Safari ignores it). There is no discard, error, turn-start, or round-end variant.
- **Recommendation:** add an error buzz for rejected moves and a "your turn" tap. Consider the iOS haptic switch trick.
- **Effort:** S.

### 15. Low (S): score explanation and win celebration
- **Current state:**
  - RoundSummary and Confetti exist, and I did not exercise them live.
  - The hand-points header ("YOUR HAND 140 pts") reads as a score but is the penalty for cards held. Consider a tooltip or label ("penalty if you go out now").
- **Recommendation:** add a count-up tally and an end-of-round breakdown of the penalty per card.
- **Effort:** S.

### 16. Low (M): modes and difficulty design
- **Current state:** 5 AI tiers, Daily Deal, Weekly Challenge and a tutorial exist. The dictionary/setup screens show no custom rules or variants, no puzzle-style scenarios ("finish this hand in N moves"), no adaptive difficulty, and no handicaps.
- **Recommendation:** add an adaptive tier suggestion after 3 wins or losses, and an AI reveal / "coach" mode. Consider a small set of curated puzzles.
- **Effort:** M/L.

## Quick wins (each S)
1. Skip the pass gate when there is a single human (#1).
2. A "Confirm discards" toggle, defaulting off (#3).
3. A game-speed setting that scales AI_TURN_DELAY_MS, AI_RESULT_HOLD_MS and FLIGHT_MS (#4).
4. AI sounds, and a "your turn" chime (#10).
5. Reserve the banner height to stop the layout shift on draw (#12).
6. Badge fonts >=11px, `touch-action: manipulation`, and `overscroll-behavior: none` (#8, #13).
7. In-app Reduce motion attribute (#5).
8. Keyboard shortcuts D/F/X/Ctrl+Z with a "?" overlay (#7).

## Bigger bets
- An always-on interactive hand with drag-to-discard and drag-to-meld, replacing the modal drawer for the common turn (#2).
- A gamepad layer with spatial focus and button prompts (#6).
- A wide-screen, landscape and TV layout, plus a left-handed mode (#11).
- Assist layer: contract progress, candidate highlighting, and disabled-reason messages (#9).
- An adaptive-difficulty, puzzle and custom-rules mode set (#16).

## Not verified
- MP async flows, the theme-by-theme contrast ratios, low-end frame pacing, and the 8-player hand layout.
- Round-end and win-celebration visuals (harness navigated away).
