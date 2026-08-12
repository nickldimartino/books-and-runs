import { buildDeck, shuffle } from "./deck";
import { CONTRACTS, Card, GameState, Player } from "./types";

export const TUTORIAL_HUMAN_ID = "human-0";
export const TUTORIAL_AI_ID = "tutorial-ai";

// A natural book (3 sevens, different suits) and a natural run (3-4-5-6 of
// spades) — no wilds involved, and no rank in common between them, so the
// tutorial's "make a book" / "make a run" steps always have exactly one
// obviously-correct answer. (An earlier version ran the spades up to 7,
// which put a 4th "7" in the run — asking a player to "tap your three 7s"
// with a spade 7 sitting right there was a real trap, caught in testing.)
export const TUTORIAL_BOOK_IDS = ["h-7-0", "d-7-0", "c-7-0"];
export const TUTORIAL_RUN_IDS = ["s-3-0", "s-4-0", "s-5-0", "s-6-0"];

// Six filler cards, deliberately picked (not randomly dealt) so there's no
// chance they accidentally form a second book or run, or share a rank with
// the book/run above — every rank here is different from those and from
// each other, and none are spades.
const TUTORIAL_FILLER_IDS = ["d-K-0", "c-Q-0", "h-J-0", "d-10-0", "c-9-0", "h-8-0"];

/**
 * A fixed, non-random game for the New Game "Tutorial" option: exactly one
 * human (You) vs. one Beginner AI, playing only the "1 Book + 1 Run" round.
 * The human's starting hand always contains exactly one obvious book and
 * one obvious run — see TUTORIAL_BOOK_IDS/TUTORIAL_RUN_IDS — so every
 * tutorial playthrough hits the same guaranteed teaching moments. Never
 * used for real games, and (see GameContext.tsx's isTutorial handling)
 * never touches the real saved-game slot or Supabase.
 */
export function createTutorialGame(): GameState {
  const deck = buildDeck(1);
  const riggedIds = new Set([...TUTORIAL_BOOK_IDS, ...TUTORIAL_RUN_IDS, ...TUTORIAL_FILLER_IDS]);
  const byId = new Map(deck.map((c) => [c.id, c]));

  const humanHand: Card[] = [
    ...TUTORIAL_BOOK_IDS.map((id) => byId.get(id)!),
    ...TUTORIAL_RUN_IDS.map((id) => byId.get(id)!),
    ...TUTORIAL_FILLER_IDS.map((id) => byId.get(id)!),
  ];

  const rest = shuffle(deck.filter((c) => !riggedIds.has(c.id)));
  const aiHand = rest.slice(0, 13);
  const afterHands = rest.slice(13);
  const discardPile = [afterHands[afterHands.length - 1]];
  const drawPile = afterHands.slice(0, afterHands.length - 1);

  const players: Player[] = [
    {
      id: TUTORIAL_HUMAN_ID,
      name: "You",
      isAI: false,
      hand: humanHand,
      hasMeldedContract: false,
      cumulativeScore: 0,
    },
    {
      id: TUTORIAL_AI_ID,
      name: "Beginner AI",
      isAI: true,
      difficulty: "beginner",
      hand: aiHand,
      hasMeldedContract: false,
      cumulativeScore: 0,
    },
  ];

  return {
    round: 1,
    selectedContracts: [CONTRACTS[1]], // "1 Book + 1 Run"
    players,
    currentPlayerIndex: 0,
    drawPile,
    discardPile,
    melds: [],
    discardHistory: [],
    pickupHistory: [],
    roundOver: false,
    gameOver: false,
  };
}
