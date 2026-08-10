import { Card, GameState, Player, Rank, Suit } from "./types";

let idCounter = 0;

/** Builds a Card for tests. isWild defaults based on rank (2s and jokers) unless overridden. */
export function makeCard(rank: Rank, suit: Suit = "hearts", overrides: Partial<Card> = {}): Card {
  idCounter += 1;
  return {
    id: overrides.id ?? `${suit[0]}-${rank}-${idCounter}`,
    suit,
    rank,
    isWild: rank === "2" || rank === "JOKER",
    ...overrides,
  };
}

export function makeHand(specs: Array<[Rank, Suit] | Rank>): Card[] {
  return specs.map((spec) => (Array.isArray(spec) ? makeCard(spec[0], spec[1]) : makeCard(spec)));
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: overrides.id ?? "p1",
    name: overrides.name ?? "Player",
    isAI: overrides.isAI ?? false,
    hand: overrides.hand ?? [],
    hasMeldedContract: overrides.hasMeldedContract ?? false,
    cumulativeScore: overrides.cumulativeScore ?? 0,
    ...overrides,
  };
}

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    players: overrides.players ?? [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })],
    currentPlayerIndex: 0,
    drawPile: [],
    discardPile: [],
    melds: [],
    discardHistory: [],
    pickupHistory: [],
    roundOver: false,
    gameOver: false,
    ...overrides,
  };
}
