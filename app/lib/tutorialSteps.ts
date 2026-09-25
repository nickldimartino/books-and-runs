/**
 * The ordered walkthrough shown during a tutorial game (see src/tutorial.ts
 * for the scripted deal these steps assume). Each step either dismisses on
 * a tap ("tap") or requires the player to actually do the thing being
 * taught — game/page.tsx watches the live game state and calls
 * advanceTutorialStep() itself once a gated step's condition is met, so
 * there's no "skip" button on those, only on the tutorial as a whole.
 *
 * `target` is one or more data-tutorial attribute values (see game/page.tsx)
 * the overlay spotlights; null centers the step as a plain modal instead.
 * An array spotlights the union of every named element's bounding box — a
 * step whose instructions span two separate sections (e.g. "select cards in
 * your hand, then tap Group selected cards" — the hand and the "Build your
 * meld" section aren't adjacent) needs both reachable at once, not just the
 * one the step happens to mention first.
 */

import type { TranslationKey } from "./i18n/keys";

type TutorialGate =
  | { type: "tap" }
  | { type: "drawn" }
  | { type: "grouped"; meldType: "book" | "run" }
  | { type: "melded" }
  | { type: "discarded" };

export interface TutorialStep {
  id: string;
  target: string | string[] | null;
  /** Translation keys, not literal text — TutorialOverlay.tsx resolves
   * them via t() at render time, so this array can stay a plain static
   * list instead of a factory function needing a live t() to build. */
  title: TranslationKey;
  body: TranslationKey;
  gate: TutorialGate;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    target: null,
    title: "tutorial.welcome.title",
    body: "tutorial.welcome.body",
    gate: { type: "tap" },
  },
  {
    id: "contract",
    target: "round-header",
    title: "tutorial.contract.title",
    body: "tutorial.contract.body",
    gate: { type: "tap" },
  },
  {
    id: "opponents",
    target: "opponent-strip",
    title: "tutorial.opponents.title",
    body: "tutorial.opponents.body",
    gate: { type: "tap" },
  },
  {
    id: "hand-bar",
    target: "hand-bar",
    title: "tutorial.handBar.title",
    body: "tutorial.handBar.body",
    gate: { type: "tap" },
  },
  {
    id: "draw",
    target: "draw-piles",
    title: "tutorial.draw.title",
    body: "tutorial.draw.body",
    gate: { type: "drawn" },
  },
  {
    id: "hand",
    target: "hand",
    title: "tutorial.hand.title",
    body: "tutorial.hand.body",
    gate: { type: "tap" },
  },
  {
    id: "organize-hand",
    target: "hand",
    title: "tutorial.organizeHand.title",
    body: "tutorial.organizeHand.body",
    gate: { type: "tap" },
  },
  {
    id: "wildcards",
    target: null,
    title: "tutorial.wildcards.title",
    body: "tutorial.wildcards.body",
    gate: { type: "tap" },
  },
  {
    id: "book",
    target: ["build-meld", "hand"],
    title: "tutorial.book.title",
    body: "tutorial.book.body",
    gate: { type: "grouped", meldType: "book" },
  },
  {
    id: "run",
    target: ["build-meld", "hand"],
    title: "tutorial.run.title",
    body: "tutorial.run.body",
    gate: { type: "grouped", meldType: "run" },
  },
  {
    id: "confirm",
    target: "confirm-meld",
    title: "tutorial.confirm.title",
    body: "tutorial.confirm.body",
    gate: { type: "melded" },
  },
  {
    id: "table-melds",
    target: "table-melds",
    title: "tutorial.tableMelds.title",
    body: "tutorial.tableMelds.body",
    gate: { type: "tap" },
  },
  {
    id: "layoff-hint",
    target: "hand",
    title: "tutorial.layoffHint.title",
    body: "tutorial.layoffHint.body",
    gate: { type: "tap" },
  },
  {
    id: "discard",
    target: ["discard-btn", "hand"],
    title: "tutorial.discard.title",
    body: "tutorial.discard.body",
    gate: { type: "discarded" },
  },
  {
    id: "wrapup",
    target: null,
    title: "tutorial.wrapup.title",
    body: "tutorial.wrapup.body",
    gate: { type: "tap" },
  },
];
