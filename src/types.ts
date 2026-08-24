export type Suit = "hearts" | "diamonds" | "clubs" | "spades" | "joker";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "JOKER";

export interface Card {
  id: string; // unique instance id, e.g. "H-7-a" (two decks means duplicate rank/suit)
  suit: Suit;
  rank: Rank;
  isWild: boolean; // true for 2s and jokers
}

export type MeldType = "book" | "run";

export interface Meld {
  id: string;
  type: MeldType;
  ownerId: string; // player who originally laid this meld
  cards: Card[];
  runStartIndex?: number; // for runs: index into RUN_ORDER of the leftmost slot, so lay-offs know the range
  // Ids of cards in `cards` actually functioning as a generic wild here, for
  // display (the "as X" badge) — not derivable by comparing a card's own
  // rank to its slot's rank, since a 2 (whose own rank is always "2")
  // standing in for a *different* suit's own "2" slot has a rank that
  // happens to match its slot anyway. A plain array (not a Set) since Meld
  // is part of GameState, which round-trips through JSON for local/Supabase
  // persistence — a Set would silently serialize as "{}".
  wildCardIds?: string[];
}

export interface ContractRequirement {
  round: number;
  books: number;
  runs: number;
  bookSize: number; // min cards per book
  runSize: number; // min cards per run
  label: string;
  // True only for the game's final round (the traditional "no rummy" round):
  // the meld must use every card in hand, natural and wild, since there's no
  // discard afterward. See solveWholeHandContract in meld.ts.
  wholeHandMeld: boolean;
}

export type Difficulty = "beginner" | "easy" | "medium" | "hard" | "expert";

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty;
  hand: Card[];
  hasMeldedContract: boolean; // true once this player has laid their full contract this round
  cumulativeScore: number;
}

export interface DiscardEvent {
  playerId: string;
  card: Card;
}

export interface GameState {
  round: number; // 1-based position within selectedContracts, not a fixed 1-7
  selectedContracts: ContractRequirement[]; // the ordered set of rounds this game is playing
  players: Player[];
  currentPlayerIndex: number;
  drawPile: Card[];
  discardPile: Card[]; // top of pile is last element
  melds: Meld[]; // all melds on the table this round, across all players
  discardHistory: DiscardEvent[]; // for AI opponent modeling
  pickupHistory: DiscardEvent[]; // cards picked up from the discard pile, per player — signals intent
  roundOver: boolean;
  gameOver: boolean;
  winnerId?: string;
}

export const CONTRACTS: ContractRequirement[] = [
  { round: 1, books: 2, runs: 0, bookSize: 3, runSize: 4, label: "2 Books", wholeHandMeld: false },
  { round: 2, books: 1, runs: 1, bookSize: 3, runSize: 4, label: "1 Book + 1 Run", wholeHandMeld: false },
  { round: 3, books: 0, runs: 2, bookSize: 3, runSize: 4, label: "2 Runs", wholeHandMeld: false },
  { round: 4, books: 2, runs: 1, bookSize: 3, runSize: 4, label: "2 Books + 1 Run", wholeHandMeld: false },
  { round: 5, books: 1, runs: 2, bookSize: 3, runSize: 4, label: "1 Book + 2 Runs", wholeHandMeld: false },
  { round: 6, books: 3, runs: 0, bookSize: 3, runSize: 4, label: "3 Books", wholeHandMeld: false },
  { round: 7, books: 0, runs: 3, bookSize: 3, runSize: 4, label: "3 Runs", wholeHandMeld: true },
];

// The "short game" mode: drops rounds 4 and 5 (the two hardest, mixed
// 2-meld rounds), keeping the rest in their original order.
export const SHORT_GAME_CONTRACTS: ContractRequirement[] = CONTRACTS.filter(
  (c) => c.round !== 4 && c.round !== 5
);
