import { buildDeck, deal, shuffle } from "./deck";
import { canLayOff, leftoverAfterMelds, solveContract } from "./meld";
import { handPenalty } from "./scorer";
import { CONTRACTS, Card, Difficulty, GameState, Meld, Player } from "./types";

export interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty;
}

export function createGame(playerConfigs: PlayerConfig[]): GameState {
  const numDecks = Math.ceil(playerConfigs.length / 2);
  const deck = buildDeck(numDecks);
  const { hands, drawPile, discardPile } = deal(deck, playerConfigs.length);

  const players: Player[] = playerConfigs.map((cfg, i) => ({
    id: cfg.id,
    name: cfg.name,
    isAI: cfg.isAI,
    difficulty: cfg.difficulty,
    hand: hands[i],
    hasMeldedContract: false,
    cumulativeScore: 0,
  }));

  return {
    round: 1,
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

function currentContract(state: GameState) {
  return CONTRACTS[state.round - 1];
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

/** Draw one card from the draw pile, reshuffling the discard pile in if needed. */
export function drawFromPile(state: GameState): Card {
  if (state.drawPile.length === 0) {
    const top = state.discardPile.pop()!;
    state.drawPile = shuffle(state.discardPile);
    state.discardPile = [top];
  }
  const card = state.drawPile.pop()!;
  currentPlayer(state).hand.push(card);
  return card;
}

/** Draw the top card of the discard pile instead. */
export function drawFromDiscard(state: GameState): Card | null {
  if (state.discardPile.length === 0) return null;
  const card = state.discardPile.pop()!;
  const player = currentPlayer(state);
  player.hand.push(card);
  state.pickupHistory.push({ playerId: player.id, card });
  return card;
}

/**
 * Attempt to meld the player's full contract for this round, all at once.
 * Returns the melds laid if successful, or null if the contract can't
 * currently be completed from hand.
 */
export function attemptMeldContract(state: GameState): Meld[] | null {
  const player = currentPlayer(state);
  if (player.hasMeldedContract) return null; // already melded this round
  const req = currentContract(state);
  const melds = solveContract(player.hand, req, player.id);
  if (!melds) return null;

  player.hand = leftoverAfterMelds(player.hand, melds);
  player.hasMeldedContract = true;
  state.melds.push(...melds);
  return melds;
}

/** Lay a single card off onto any existing meld on the table (own or another player's). */
export function layOffCard(state: GameState, cardId: string, meldId: string): boolean {
  const player = currentPlayer(state);
  if (!player.hasMeldedContract) return false; // must meld own contract first
  const card = player.hand.find((c) => c.id === cardId);
  const meld = state.melds.find((m) => m.id === meldId);
  if (!card || !meld) return false;
  if (!canLayOff(card, meld)) return false;

  meld.cards.push(card);
  player.hand = player.hand.filter((c) => c.id !== cardId);
  return true;
}

/**
 * Discard a card, ending the turn. Handles Round 7's no-discard-on-go-out rule.
 * Returns true if the round ended as a result of this action.
 */
export function discardAndAdvance(state: GameState, cardId: string): boolean {
  const player = currentPlayer(state);
  const req = currentContract(state);

  // Round 7: going out (empty hand right after melding) skips the discard entirely
  if (req.noDiscardOnGoOut && player.hasMeldedContract && player.hand.length === 0) {
    endRound(state, player.id);
    return true;
  }

  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) return false;
  const [card] = player.hand.splice(idx, 1);
  state.discardPile.push(card);
  state.discardHistory.push({ playerId: player.id, card });

  if (player.hasMeldedContract && player.hand.length === 0) {
    endRound(state, player.id);
    return true;
  }

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return false;
}

function endRound(state: GameState, winnerId: string) {
  for (const p of state.players) {
    if (p.id !== winnerId) {
      p.cumulativeScore += handPenalty(p.hand);
    }
  }
  state.roundOver = true;

  if (state.round >= CONTRACTS.length) {
    state.gameOver = true;
    const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
    state.winnerId = standings[0].id;
  }
}

/** Set up the next round after the current one has ended. Mutates and returns a fresh-ish state. */
export function startNextRound(state: GameState): GameState {
  if (!state.roundOver || state.gameOver) return state;

  const nextRound = state.round + 1;
  const numDecks = Math.ceil(state.players.length / 2);
  const deck = buildDeck(numDecks);
  const { hands, drawPile, discardPile } = deal(deck, state.players.length);

  const players: Player[] = state.players.map((p, i) => ({
    ...p,
    hand: hands[i],
    hasMeldedContract: false,
  }));

  return {
    round: nextRound,
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
