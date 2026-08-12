/**
 * The ordered walkthrough shown during a tutorial game (see src/tutorial.ts
 * for the scripted deal these steps assume). Each step either dismisses on
 * a tap ("tap") or requires the player to actually do the thing being
 * taught — game/page.tsx watches the live game state and calls
 * advanceTutorialStep() itself once a gated step's condition is met, so
 * there's no "skip" button on those, only on the tutorial as a whole.
 *
 * `target` is a data-tutorial attribute value (see game/page.tsx) the
 * overlay spotlights; null centers the step as a plain modal instead.
 */

export type TutorialGate =
  | { type: "tap" }
  | { type: "drawn" }
  | { type: "grouped"; meldType: "book" | "run" }
  | { type: "melded" }
  | { type: "discarded" };

export interface TutorialStep {
  id: string;
  target: string | null;
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
    id: "book",
    target: "hand",
    title: "Make a book",
    body: 'A book is 3+ cards of the same rank. Tap your three 7s, then tap "Group selected cards."',
    gate: { type: "grouped", meldType: "book" },
  },
  {
    id: "run",
    target: "hand",
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
    body: "See a gold ↓ badge on a card? That means it fits a meld already on the table — including your own, later in the game. Turn this off anytime in Settings.",
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
    target: "hand",
    title: "End your turn",
    body: 'Tap one more card in your hand, then tap "Discard selected card" to finish your turn.',
    gate: { type: "discarded" },
  },
  {
    id: "wrapup",
    target: null,
    title: "You've got it!",
    body: "That's the whole loop — draw, meld, discard. I'll let the Beginner AI take its turns automatically now; keep playing to see the round through to the end. Good luck!",
    gate: { type: "tap" },
  },
];
