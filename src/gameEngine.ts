// The turn-by-turn state machine. Every function here takes a GameState and
// mutates it in place (returning a small result — a drawn card, a bool, the
// melds laid), which is what lets the same code drive local play, the
// tutorial, the AI loop, and the multiplayer adapter. A turn is: draw
// (drawFromPile / drawFromDiscard) → optionally meld the contract
// (meldChosenGroups / attemptMeldContract) and lay off cards (layOffCard) →
// discardAndAdvance, which also detects going out and ends the round.
// endRound scores every non-winner's hand; startNextRound re-deals.
//
// All rule validation lives here or in meld.ts — callers (including the
// multiplayer server) are never trusted to have checked a move themselves.

import { buildDeck, deal, decksForPlayerCount, shuffle } from "./deck";
import {
  layOffOptions,
  leftoverAfterMelds,
  RUN_ORDER,
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
 * through whatever was selected, not the original round numbers. `rng`
 * defaults to Math.random for every normal game — Daily Deal is the one
 * caller that passes a seeded one (see deck.ts's seededRng), so the same
 * calendar date always deals the same shuffle.
 */
export function createGame(
  playerConfigs: PlayerConfig[],
  contracts: ContractRequirement[] = CONTRACTS,
  rng: () => number = Math.random
): GameState {
  const numDecks = decksForPlayerCount(playerConfigs.length);
  const deck = buildDeck(numDecks, rng);
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
    stalledTurns: 0,
  };
}

function currentContract(state: GameState) {
  return state.selectedContracts[state.round - 1];
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

// Laying a contract, laying a card off, or going out counts as the round
// making real progress — clears the stall counter. Drawing and discarding
// on its own does not: two players can trade cards through the discard pile
// forever without either ever getting closer to ending the round.
function noteProgress(state: GameState) {
  state.stalledTurns = 0;
}

// The round can't end normally any more. Two shapes, both caught here:
//   • every player has melded but someone's stuck holding cards that fit no
//     meld on the table — with 2 players both stuck, they cycle those cards
//     through the discard pile indefinitely (trips fast, ~4 rotations); or
//   • a deal so bad that nobody can complete the contract at all, so nobody
//     ever melds and the draw/discard churn never resolves (a real game
//     melds within a handful of turns, so this bound is very generous).
// Either way endRound(null) scores every hand, same as a stock-out.
function roundIsDeadlocked(state: GameState): boolean {
  const stalled = state.stalledTurns ?? 0;
  const n = state.players.length;
  if (state.players.every((p) => p.hasMeldedContract) && stalled > n * 4) return true;
  return stalled > n * 60;
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
  noteProgress(state);
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
 *
 * `preferredRunStarts`, if given, is parallel to `groups` (same length/
 * order) — an optional chosen runStartIndex per group, for a run whose wild
 * placement is genuinely ambiguous (see validateManualGroup). The caller
 * (game/page.tsx) is expected to have already resolved any ambiguity with
 * the player before calling this; a group still left ambiguous here just
 * fails validation like any other invalid group, rather than guessing.
 */
export function meldChosenGroups(
  state: GameState,
  groups: string[][],
  preferredRunStarts?: (number | undefined)[]
): Meld[] | null {
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

  const validations = resolvedGroups.map((cards, i) => validateManualGroup(cards, req, preferredRunStarts?.[i]));
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
    wildCardIds: validations[idx].wildCardIds ? [...validations[idx].wildCardIds!] : undefined,
  }));

  player.hand = player.hand.filter((c) => !seen.has(c.id));
  player.hasMeldedContract = true;
  state.melds.push(...melds);
  noteProgress(state);
  return melds;
}

/**
 * Whether a card being laid off is genuinely acting as a generic wild here,
 * for the "as X" display badge (see Meld.wildCardIds) — not derivable from
 * comparing the card's own rank to its slot's rank, since a 2 (whose own
 * rank is always "2") standing in for a *different* suit's own "2" slot has
 * a rank that happens to match its slot anyway.
 */
function isLayOffWild(card: Card, meld: Meld, direction: "low" | "high"): boolean {
  if (!card.isWild) return false;
  // layOffOptions has no "natural 2 joins a book of 2s" path the way
  // meld-time validation does (it unconditionally allows any isWild card
  // onto any book) — so for a lay-off specifically, every isWild card
  // landing on a book really is going through the generic-wild path.
  if (meld.type === "book") return true;
  if (card.rank !== "2") return true; // Joker: always wild, no natural run slot
  const suit = meld.cards.find((c) => !c.isWild)?.suit;
  const start = meld.runStartIndex ?? 0;
  const targetPos = direction === "low" ? start - 1 : start + meld.cards.length;
  return !(card.suit === suit && RUN_ORDER[targetPos] === "2");
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

  if (isLayOffWild(card, meld, direction)) {
    meld.wildCardIds = [...(meld.wildCardIds ?? []), card.id];
  }
  if (meld.type === "run" && direction === "low") {
    meld.cards.unshift(card);
    meld.runStartIndex = (meld.runStartIndex ?? 0) - 1;
  } else {
    meld.cards.push(card);
  }
  player.hand = player.hand.filter((c) => c.id !== cardId);
  noteProgress(state); // a card left a hand for the table — round is progressing
  return true;
}

// A brute-force ordering search (see resolveLayOffOrder below) over N cards is
// worst-case N! branches — bounded here mostly for UI sanity (nobody wants
// to lay off more than a handful of cards in one tap) rather than genuine
// performance need: each branch is a legality check that fails fast for
// almost every wrong order (a run only ever has one card that legally
// extends a given end at a given moment), so real hands prune to a tiny
// fraction of the worst case well before this cap would matter.
const MAX_LAYOFF_BATCH = 6;

/**
 * Every order N given cards could be laid off onto one meld in (and, for a
 * wild with room on both ends, every direction it could go in at each
 * point), tried until one succeeds — a run only accepts one specific rank
 * at a time on a given end, so which card goes on first matters (e.g.
 * laying off 4H before 5H onto a run currently ending at 6H fails; 5H then
 * 4H succeeds), and a wild standing in for a middle rank has to go on
 * before a natural card past it does. A wild's own direction can be
 * genuinely ambiguous in isolation (room on both ends, neither already
 * wild) — laid off alone that's exactly layOffCard's existing "ask the
 * player" case (see GameContext's pendingLayOff), but *within* a batch it's
 * often only ambiguous until you consider what the rest of the batch needs:
 * a wild plus a natural card the wild is meant to bridge to has only one
 * direction that lets the natural card go on next, so both of the wild's
 * options are tried as separate branches here rather than requiring the
 * caller to have already resolved it.
 *
 * Returns the valid order — each step's own resolved direction included,
 * since a wild's direction can depend on what's laid off before it and a
 * caller applying this for real (or crediting per-card achievement deltas
 * the same way GameContext's single-card layOff already does — see
 * wasAmbiguous below) needs that same direction and ambiguity-at-the-time
 * repeated, not re-derived — or null if no order/direction combination
 * lays off every given card. Pure — searches against throwaway clones via
 * layOffCard itself (the exact same legality check a single manual lay-off
 * already goes through), never touches `state`. Exported (not just used
 * internally by canLayOffMultiple/layOffMultiple below) so GameContext.tsx
 * can build one move-log entry and delta bundle per underlying card, the
 * same shape a manual one-at-a-time lay-off of the same cards would have
 * produced.
 */
export interface LayOffStep {
  cardId: string;
  direction: "low" | "high";
  // Whether *this* card had a genuine low-vs-high choice at the moment it
  // was laid off (mirrors GameContext.tsx's own wasAmbiguous, computed the
  // same way — layOffOptions(card, meld).length === 2 right before this
  // step's own layOffCard call) — feeds ambiguous_wild_choices_made the
  // same as a manual lay-off would.
  wasAmbiguous: boolean;
}

export function resolveLayOffOrder(state: GameState, cardIds: string[], meldId: string): LayOffStep[] | null {
  function search(remaining: string[], working: GameState): LayOffStep[] | null {
    if (remaining.length === 0) return [];
    const meld = working.melds.find((m) => m.id === meldId);
    const player = currentPlayer(working);
    if (!meld) return null;
    for (let i = 0; i < remaining.length; i++) {
      const card = player.hand.find((c) => c.id === remaining[i]);
      if (!card) continue;
      const options = layOffOptions(card, meld);
      for (const direction of options) {
        const clone = structuredClone(working);
        if (!layOffCard(clone, remaining[i], meldId, direction)) continue;
        const restOrder = search([...remaining.slice(0, i), ...remaining.slice(i + 1)], clone);
        if (restOrder) {
          return [{ cardId: remaining[i], direction, wasAmbiguous: options.length === 2 }, ...restOrder];
        }
      }
    }
    return null;
  }
  return search(cardIds, structuredClone(state));
}

function layOffBatchGuards(state: GameState, cardIds: string[], meldId: string): boolean {
  const uniqueIds = new Set(cardIds);
  if (uniqueIds.size < 2 || uniqueIds.size !== cardIds.length || uniqueIds.size > MAX_LAYOFF_BATCH) return false;
  const player = currentPlayer(state);
  if (!player.hasMeldedContract) return false;
  if (!cardIds.every((id) => player.hand.some((c) => c.id === id))) return false;
  return state.melds.some((m) => m.id === meldId);
}

/**
 * Read-only — whether layOffMultiple would currently succeed for these
 * exact cards onto this exact meld, for enabling/disabling a "Lay off
 * cards" button without actually laying anything off. See layOffCard for
 * the single-card version this generalizes; 2+ cards only (a batch of one
 * is just layOffCard).
 */
export function canLayOffMultiple(state: GameState, cardIds: string[], meldId: string): boolean {
  return layOffBatchGuards(state, cardIds, meldId) && resolveLayOffOrder(state, cardIds, meldId) !== null;
}

/**
 * Lay off several cards from the current player's hand onto one meld in a
 * single action — e.g. three 8s onto a book of 8s, or two sequential run
 * cards onto one end of a run. All-or-nothing: no order that lays off
 * every given card means no state change at all, same as a single invalid
 * lay-off. Once a valid order is found (see resolveLayOffOrder), applies it
 * for real via ordinary layOffCard calls — every achievement/score delta a
 * lay-off produces already comes from that same per-card path in
 * GameContext.tsx, so a 3-card lay-off credits exactly as if those 3 cards
 * had been laid off one at a time, just without requiring the player to
 * find the right order themselves.
 */
export function layOffMultiple(state: GameState, cardIds: string[], meldId: string): boolean {
  if (!layOffBatchGuards(state, cardIds, meldId)) return false;
  const order = resolveLayOffOrder(state, cardIds, meldId);
  if (!order) return false;
  for (const step of order) layOffCard(state, step.cardId, meldId, step.direction);
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

  // Deadlock backstop: this turn made no real progress (no meld, no lay-off,
  // nobody went out — those call noteProgress, which resets the counter).
  // Past the bounds in roundIsDeadlocked the round can't resolve normally,
  // so end it and score every hand.
  state.stalledTurns = (state.stalledTurns ?? 0) + 1;
  if (roundIsDeadlocked(state)) {
    endRound(state, null);
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

/**
 * Set up the next round after the current one has ended. Mutates and
 * returns a fresh-ish state. `rng` defaults to Math.random, same as
 * createGame — pass the same seeded rng used to start the game so every
 * round of a multi-round game reshuffles reproducibly from one seed, not
 * just round 1.
 */
export function startNextRound(state: GameState, rng: () => number = Math.random): GameState {
  if (!state.roundOver || state.gameOver) return state;

  const nextRound = state.round + 1;
  const numDecks = decksForPlayerCount(state.players.length);
  const deck = buildDeck(numDecks, rng);
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
    stalledTurns: 0,
  };
}
