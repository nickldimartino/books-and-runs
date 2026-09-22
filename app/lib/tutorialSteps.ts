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
    body: "This quick tour walks you through your first turn and points out where everything lives on screen. It only takes a minute — let's go.",
    gate: { type: "tap" },
  },
  {
    id: "contract",
    target: "round-header",
    title: "Your round's contract",
    body: "Up top: which round you're on and the contract you owe. Every round needs a specific set of melds before you can lay anything down. This round it's 1 Book + 1 Run.",
    gate: { type: "tap" },
  },
  {
    id: "opponents",
    target: "opponent-strip",
    title: "The table",
    body: "This strip is everyone playing — their marker, how many cards they're holding, and whose turn it is (the highlighted one). Tap any player to see their last discard and last pickup. When an opponent takes a turn, what they did shows up right here.",
    gate: { type: "tap" },
  },
  {
    id: "hand-bar",
    target: "hand-bar",
    title: "Your hand",
    body: "Your cards ride in this bar along the bottom, always one tap away. Opening it up full-screen is where you sort your hand, build melds, and discard — which we'll do in a moment.",
    gate: { type: "tap" },
  },
  {
    id: "draw",
    target: "draw-piles",
    title: "Draw a card",
    body: "Every turn starts with a draw. Tap the draw pile for a fresh card, or take the top of the discard pile if it helps your hand. Try it now.",
    gate: { type: "drawn" },
  },
  {
    id: "hand",
    target: "hand",
    title: "Your full hand",
    body: "Here's everything you're holding, opened up. You've already got what this round's contract needs — a book and a run are hiding in here.",
    gate: { type: "tap" },
  },
  {
    id: "organize-hand",
    target: "hand",
    title: "Organize your hand",
    body: 'Tap "Sort by suit" or "Sort by rank" to group your cards automatically, or press and drag any card to move it wherever you like. It\'s purely for your own convenience — it has no effect on the game.',
    gate: { type: "tap" },
  },
  {
    id: "wildcards",
    target: null,
    title: "Wild cards",
    body: "Jokers are always wild. 2s are dual-purpose — a 2 can stand in for any missing card, or play as its own rank, whichever helps. None of either in your hand this round, but if you lay a wild onto a run later, you may be asked which card it's filling in for.",
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
    body: 'A run is 4+ cards of one suit in sequence. Tap your 3, 4, 5, and 6 of spades, then tap "Group selected cards" again.',
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
    title: "The table melds",
    body: "There they are — laid out where every player can see them, and grouped by who owns them. Once your contract's down it stays down; you build on it from here.",
    gate: { type: "tap" },
  },
  {
    id: "layoff-hint",
    target: "hand",
    title: "Laying off",
    body: "With your contract melded, you can add single cards onto any meld on the table — yours or an opponent's. Watch for a small ↓ badge on a card: it means that card fits somewhere. Nothing qualifies this turn, but keep an eye out. You can turn the hint off in Settings.",
    gate: { type: "tap" },
  },
  {
    id: "discard",
    target: ["discard-btn", "hand"],
    title: "End your turn",
    body: 'Every turn ends with a discard. Tap one card in your hand, then "Discard selected card," then "Confirm."',
    gate: { type: "discarded" },
  },
  {
    id: "wrapup",
    target: null,
    title: "That's the whole loop",
    body: "Draw, meld, discard — every turn. First player to empty their hand ends the round; everyone else is penalized for whatever's left in theirs. The Beginner AI will take its turns automatically from here — play on to see the round through. Good luck!",
    gate: { type: "tap" },
  },
];
