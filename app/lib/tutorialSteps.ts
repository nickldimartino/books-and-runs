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

export type TutorialGate =
  | { type: "tap" }
  | { type: "drawn" }
  | { type: "grouped"; meldType: "book" | "run" }
  | { type: "melded" }
  | { type: "discarded" };

export interface TutorialStep {
  id: string;
  target: string | string[] | null;
  title: string;
  body: string;
  gate: TutorialGate;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Books & Runs!",
    body: "This quick tutorial walks you through your first turn. It only takes a minute — let's get started.",
    gate: { type: "tap" },
  },
  {
    id: "contract",
    target: "round-header",
    title: "Your round's contract",
    body: "Each round needs a specific combination of melds before you can lay anything down. This round: 1 Book + 1 Run.",
    gate: { type: "tap" },
  },
  {
    id: "draw",
    target: "draw-piles",
    title: "Draw a card",
    body: "Every turn starts with a draw — tap the draw pile for a random card, or the discard pile if the top card helps you. Try it now.",
    gate: { type: "drawn" },
  },
  {
    id: "hand",
    target: "hand",
    title: "Your hand",
    body: "This is your hand. You've already got everything you need for this round's contract — a book and a run are hiding in there.",
    gate: { type: "tap" },
  },
  {
    id: "organize-hand",
    target: "hand",
    title: "Organize your hand",
    body: 'Tap "Sort by suit" or "Sort by rank" to group your cards automatically, or press and drag any card to move it wherever you like. This is just for your own convenience — it has no effect on the game.',
    gate: { type: "tap" },
  },
  {
    id: "wildcards",
    target: null,
    title: "Wild cards",
    body: "2s and Jokers are wild — they can stand in for any missing card in a book or run. None in your hand this round, but if you draw one later and lay it onto a run, you may be asked which end it's filling in for.",
    gate: { type: "tap" },
  },
  {
    id: "book",
    target: ["build-meld", "hand"],
    title: "Make a book",
    body: 'A book is 3+ cards of the same rank. Tap your three 7s, then tap "Group selected cards."',
    gate: { type: "grouped", meldType: "book" },
  },
  {
    id: "run",
    target: ["build-meld", "hand"],
    title: "Make a run",
    body: 'A run is 4+ same-suit cards in order. Tap your 3, 4, 5, and 6 of spades, then tap "Group selected cards" again.',
    gate: { type: "grouped", meldType: "run" },
  },
  {
    id: "confirm",
    target: "confirm-meld",
    title: "Lay it down",
    body: 'Your book and run match the round\'s contract exactly. Tap "Confirm Meld" to lay them on the table.',
    gate: { type: "melded" },
  },
  {
    id: "table-melds",
    target: "table-melds",
    title: "The table",
    body: "Nice! Your book and run are on the table now, where everyone at the table can see them.",
    gate: { type: "tap" },
  },
  {
    id: "layoff-hint",
    target: "hand",
    title: "Planning ahead",
    body: "Later on, watch for a gold ↓ badge on a card in your hand — it means that card fits a meld already on the table, including your own. Nothing in this hand qualifies yet, but keep an eye out as the round goes on. Turn this off anytime in Settings.",
    gate: { type: "tap" },
  },
  {
    id: "player-activity",
    target: "player-activity",
    title: "Keeping track",
    body: "This shows what everyone's picked up, discarded, and how many cards they're holding — just like you'd see at a real table. Turn it off anytime in Settings.",
    gate: { type: "tap" },
  },
  {
    id: "discard",
    target: ["discard-btn", "hand"],
    title: "End your turn",
    body: 'Tap one more card in your hand, then tap "Discard selected card" to finish your turn.',
    gate: { type: "discarded" },
  },
  {
    id: "wrapup",
    target: null,
    title: "You've got it!",
    body: "That's the whole loop — draw, meld, discard. The goal each round is to be the first player to empty your hand completely — everyone else gets penalized for whatever's left in theirs. I'll let the Beginner AI take its turns automatically now; keep playing to see the round through to the end. Good luck!",
    gate: { type: "tap" },
  },
];
