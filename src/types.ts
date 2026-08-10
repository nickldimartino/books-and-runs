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
}

export interface ContractRequirement {
  round: number;
  books: number;
  runs: number;
  bookSize: number; // min cards per book
  runSize: number; // min cards per run
  noDiscardOnGoOut: boolean; // Round 7 special rule
  label: string;
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

// Penalty points per card, per the house rules
export const PENALTY_VALUES: Record<string, number> = {
  NUMBER: 5, // 3-10
  FACE: 10, // J, Q, K
  ACE: 15,
  WILD: 20, // 2s
  JOKER: 50,
};

export const CONTRACTS: ContractRequirement[] = [
  { round: 1, books: 2, runs: 0, bookSize: 3, runSize: 4, noDiscardOnGoOut: false, label: "2 Books" },
  { round: 2, books: 1, runs: 1, bookSize: 3, runSize: 4, noDiscardOnGoOut: false, label: "1 Book + 1 Run" },
  { round: 3, books: 0, runs: 2, bookSize: 3, runSize: 4, noDiscardOnGoOut: false, label: "2 Runs" },
  { round: 4, books: 2, runs: 1, bookSize: 3, runSize: 4, noDiscardOnGoOut: false, label: "2 Books + 1 Run" },
  { round: 5, books: 1, runs: 2, bookSize: 3, runSize: 4, noDiscardOnGoOut: false, label: "1 Book + 2 Runs" },
  { round: 6, books: 3, runs: 0, bookSize: 3, runSize: 4, noDiscardOnGoOut: false, label: "3 Books" },
  { round: 7, books: 0, runs: 3, bookSize: 3, runSize: 4, noDiscardOnGoOut: true, label: "3 Runs (No Discard)" },
];

// The "short game" mode: drops rounds 4 and 5 (the two hardest, mixed
// 2-meld rounds), keeping the rest in their original order.
export const SHORT_GAME_CONTRACTS: ContractRequirement[] = CONTRACTS.filter(
  (c) => c.round !== 4 && c.round !== 5
);
