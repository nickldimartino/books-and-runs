// The shared vocabulary for the whole game engine: cards, melds, players,
// the round contracts, and the single GameState object that every engine
// function reads and mutates. Everything in src/ (and, through the redacted
// views, the multiplayer server and the React app) is built on these types.
//
// GameState is deliberately a plain, JSON-serializable object with no
// classes, Maps, or Sets at the top level — it round-trips through
// localStorage for the local saved game and through Postgres for a
// multiplayer game, so anything that wouldn't survive JSON.stringify /
// JSON.parse can't live on it (see the note on Meld.wildCardIds).

/**
 * The seat id that represents "the signed-in account" in a solo/pass-and-
 * play game, where several human players can share one device/session but
 * at most one of them is actually the account owner. New Game always
 * assigns this id to the first human slot ("You"). Not cryptographically
 * enforced — anyone could rename that seat or seat a different person in
 * slot 0 — but it's the same convention every account-linked feature in
 * the app relies on: stats (app/lib/recordGameResult.ts, which re-exports
 * this for its existing importers), achievement counters
 * (app/GameContext.tsx), and the solo-verify Edge Function's own replay.
 * Lives here (not app/lib) so a Deno bundle of src/ can use it too.
 */
export const YOU_PLAYER_ID = "human-0";

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
  // Deadlock backstop (see discardAndAdvance): counts consecutive turns in
  // which every player has already melded their contract and nobody has
  // melded, laid off, or gone out. Once every player has melded, the only
  // normal way a round ends is someone emptying their hand — but a player
  // can be stuck holding cards that fit no meld on the table, and two such
  // players will cycle those cards through the discard pile forever. Past a
  // small multiple of the player count this ends the round and scores every
  // hand, exactly as a stock-exhausted round does. Optional so saved games
  // and multiplayer states written before this field round-trip fine.
  stalledTurns?: number;
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
