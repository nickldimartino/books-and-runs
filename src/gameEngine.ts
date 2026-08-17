import { buildDeck, deal, decksForPlayerCount, shuffle } from "./deck";
import {
  layOffOptions,
  leftoverAfterMelds,
  solveContract,
  solveWholeHandContract,
  validateManualGroup,
} from "./meld";
import { handPenalty } from "./scorer";
import { CONTRACTS, Card, ContractRequirement, Difficulty, GameState, Meld, Player } from "./types";

export interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty;
}

/**
 * Starts a new game. `contracts` is the ordered set of rounds this game will
 * play — defaults to the full standard 7-round sequence. Pass a filtered or
 * reordered subset (see SHORT_GAME_CONTRACTS, or a custom selection) to play
 * a shorter or custom-picked game; `state.round` always just counts 1..N
 * through whatever was selected, not the original round numbers.
 */
export function createGame(playerConfigs: PlayerConfig[], contracts: ContractRequirement[] = CONTRACTS): GameState {
  const numDecks = decksForPlayerCount(playerConfigs.length);
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
    selectedContracts: contracts,
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
  return state.selectedContracts[state.round - 1];
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

/**
 * Draw one card from the draw pile, reshuffling the discard pile in if
 * needed. Returns null (and ends the round instead, everyone scoring their
 * current hand) if there's truly nothing left to draw anywhere — every
 * remaining card is either in a hand or already melded on the table. Only
 * possible with a small deck and enough of it already played out; without
 * this check, reshuffling an empty discard pile would silently hand out an
 * undefined "card" instead.
 */
export function drawFromPile(state: GameState): Card | null {
  if (state.drawPile.length === 0) {
    if (state.discardPile.length <= 1) {
      endRound(state, null);
      return null;
    }
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
 * Players (other than the discarder and the current player, who has normal
 * free priority via their own upcoming turn) who could buy the current top
 * discard, in turn order starting right after the current player. Turn order
 * here reflects the house rule that a player farther down the line can only
 * buy once everyone nearer has passed — the caller is expected to offer the
 * buy in this order and stop at the first taker.
 *
 * This engine logic is intact but currently unused in the app: see
 * BUY_DISCARD_ENABLED in app/GameContext.tsx for why it's switched off (it
 * needs a player to be watching for a discard worth buying, which doesn't
 * work on a single shared pass-and-play screen) and how to re-enable it.
 */
export function eligibleBuyers(state: GameState): Player[] {
  if (state.players.length < 3 || state.discardPile.length === 0) return [];
  const discarderId = state.discardHistory[state.discardHistory.length - 1]?.playerId;
  const currentId = currentPlayer(state).id;
  const n = state.players.length;
  const buyers: Player[] = [];
  for (let offset = 1; offset < n; offset++) {
    const p = state.players[(state.currentPlayerIndex + offset) % n];
    if (p.id !== discarderId && p.id !== currentId) buyers.push(p);
  }
  return buyers;
}

/**
 * A player other than the discarder or current player buys the top discard
 * card: it goes straight into their hand, plus one penalty card off the draw
 * pile, without giving them a turn — normal turn order is untouched. Returns
 * false (no state change) if the buy isn't currently valid.
 */
export function buyDiscard(state: GameState, buyerId: string): boolean {
  if (!eligibleBuyers(state).some((p) => p.id === buyerId)) return false;
  const buyer = state.players.find((p) => p.id === buyerId)!;

  const boughtCard = state.discardPile.pop()!;
  buyer.hand.push(boughtCard);
  state.pickupHistory.push({ playerId: buyer.id, card: boughtCard });

  if (state.drawPile.length === 0) {
    if (state.discardPile.length === 0) return true; // nothing left to draw as a penalty
    const top = state.discardPile.pop()!;
    state.drawPile = shuffle(state.discardPile);
    state.discardPile = [top];
  }
  const penaltyCard = state.drawPile.pop();
  if (penaltyCard) buyer.hand.push(penaltyCard);

  return true;
}

/**
 * Attempt to meld the player's full contract for this round, all at once.
 * Returns the melds laid if successful, or null if the contract can't
 * currently be completed from hand. In a wholeHandMeld round (the final,
 * "no discard" round), this only succeeds when every card in hand — natural
 * and wild — fits into the melds; a partial meld with cards left over isn't
 * allowed, since there'd be nothing to end the round with (see
 * solveWholeHandContract).
 */
export function attemptMeldContract(state: GameState): Meld[] | null {
  const player = currentPlayer(state);
  if (player.hasMeldedContract) return null; // already melded this round
  const req = currentContract(state);
  const melds = req.wholeHandMeld
    ? solveWholeHandContract(player.hand, req, player.id)
    : solveContract(player.hand, req, player.id);
  if (!melds) return null;

  player.hand = leftoverAfterMelds(player.hand, melds);
  player.hasMeldedContract = true;
  state.melds.push(...melds);
  return melds;
}

/**
 * Melds the player's contract using groups of cards they've explicitly
 * chosen (one array of card ids per book/run), instead of the automatic
 * solver picking for them. Re-validates every group and the overall shape
 * against the round's requirement server-side — never trusts the caller.
 * Returns the melds laid if successful, or null (no state changes) if
 * anything doesn't check out: an unknown/reused card id, an invalid group,
 * or a set of groups that doesn't exactly match what the round requires.
 */
export function meldChosenGroups(state: GameState, groups: string[][]): Meld[] | null {
  const player = currentPlayer(state);
  if (player.hasMeldedContract) return null;
  const req = currentContract(state);

  const seen = new Set<string>();
  const resolvedGroups: Card[][] = [];
  for (const ids of groups) {
    if (ids.length === 0) return null;
    const cards: Card[] = [];
    for (const id of ids) {
      if (seen.has(id)) return null;
      const card = player.hand.find((c) => c.id === id);
      if (!card) return null;
      seen.add(id);
      cards.push(card);
    }
    resolvedGroups.push(cards);
  }

  const validations = resolvedGroups.map((cards) => validateManualGroup(cards, req));
  if (validations.some((v) => !v.valid)) return null;

  const bookCount = validations.filter((v) => v.type === "book").length;
  const runCount = validations.filter((v) => v.type === "run").length;
  if (bookCount !== req.books || runCount !== req.runs) return null;
  // Whole-hand-meld round: no discard follows, so every card in hand must be
  // part of some group — a partial meld with leftovers isn't allowed.
  if (req.wholeHandMeld && seen.size !== player.hand.length) return null;

  const melds: Meld[] = resolvedGroups.map((cards, idx) => ({
    id: `${player.id}-meld-${idx}-${validations[idx].type}`,
    type: validations[idx].type!,
    ownerId: player.id,
    // For runs, use the sorted arrangement (wilds in their correct gap
    // slot) rather than whatever order the player happened to tap cards in.
    cards: validations[idx].orderedCards ?? cards,
    runStartIndex: validations[idx].runStartIndex,
  }));

  player.hand = player.hand.filter((c) => !seen.has(c.id));
  player.hasMeldedContract = true;
  state.melds.push(...melds);
  return melds;
}

/**
 * Lay a single card off onto any existing meld on the table (own or another
 * player's). For a run, `position` picks which end to extend when the card
 * could legally go on either (always true for a wild with room on both
 * sides — the engine can't guess which rank the player means it to stand in
 * for, so it's required in that case; a natural card only ever fits one end,
 * so `position` is ignored for those). Returns false, with no state change,
 * if the lay-off isn't valid or (for an ambiguous wild) no position was given.
 */
export function layOffCard(
  state: GameState,
  cardId: string,
  meldId: string,
  position?: "low" | "high"
): boolean {
  const player = currentPlayer(state);
  if (!player.hasMeldedContract) return false; // must meld own contract first
  const card = player.hand.find((c) => c.id === cardId);
  const meld = state.melds.find((m) => m.id === meldId);
  if (!card || !meld) return false;

  const options = layOffOptions(card, meld);
  if (options.length === 0) return false;
  const direction = options.length === 1 ? options[0] : position;
  if (!direction || !options.includes(direction)) return false;

  if (meld.type === "run" && direction === "low") {
    meld.cards.unshift(card);
    meld.runStartIndex = (meld.runStartIndex ?? 0) - 1;
  } else {
    meld.cards.push(card);
  }
  player.hand = player.hand.filter((c) => c.id !== cardId);
  return true;
}

/**
 * Discard a card, ending the turn. If the player has already melded their
 * contract and their hand is already empty (melding and/or laying off used
 * every card), they've gone out — the round ends immediately with no
 * discard needed, since there's nothing left to discard. This applies in
 * every round, not just one with a big enough contract to make it likely.
 * Returns true if the round ended as a result of this action.
 */
export function discardAndAdvance(state: GameState, cardId: string): boolean {
  const player = currentPlayer(state);

  if (player.hasMeldedContract && player.hand.length === 0) {
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

/** winnerId null means nobody's exempted — everyone scores their current
 * hand's penalty, for the rare case a round ends with no one going out
 * (see drawFromPile). */
function endRound(state: GameState, winnerId: string | null) {
  for (const p of state.players) {
    if (p.id !== winnerId) {
      p.cumulativeScore += handPenalty(p.hand);
    }
  }
  state.roundOver = true;

  if (state.round >= state.selectedContracts.length) {
    state.gameOver = true;
    const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
    state.winnerId = standings[0].id;
  }
}

/** Set up the next round after the current one has ended. Mutates and returns a fresh-ish state. */
export function startNextRound(state: GameState): GameState {
  if (!state.roundOver || state.gameOver) return state;

  const nextRound = state.round + 1;
  const numDecks = decksForPlayerCount(state.players.length);
  const deck = buildDeck(numDecks);
  const { hands, drawPile, discardPile } = deal(deck, state.players.length);

  const players: Player[] = state.players.map((p, i) => ({
    ...p,
    hand: hands[i],
    hasMeldedContract: false,
  }));

  return {
    round: nextRound,
    selectedContracts: state.selectedContracts,
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
