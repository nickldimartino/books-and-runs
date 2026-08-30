import { Card, GameState, Player } from "../types";
import {
  AIStrategy,
  deadCards,
  greedyLayOffPlan,
  highestPenaltyCard,
  maybeMistakeBool,
  maybeMistakeDiscard,
  minRunDistance,
  MISTAKE_CHANCE,
  Rng,
  WILD_DISCARD_RISK,
} from "./strategy";

/**
 * Estimates how much each opponent likely wants this card, using both their
 * pickup history (direct evidence) and how far along they seem to be in
 * building their contract (fewer cards discarded from a rank/suit family =
 * more likely still hunting for it).
 */
function opponentDemand(state: GameState, selfId: string, card: Card): number {
  let demand = 0;
  const opponents = state.players.filter((p) => p.id !== selfId);

  for (const p of opponents) {
    const pickups = state.pickupHistory.filter((h) => h.playerId === p.id);
    const discards = state.discardHistory.filter((h) => h.playerId === p.id);

    for (const pickup of pickups) {
      if (pickup.card.rank === card.rank) demand += 3;
      if (pickup.card.suit === card.suit && minRunDistance(pickup.card.rank, card.rank) <= 2) demand += 1.5;
    }
    // if this opponent has discarded this exact rank before, they likely don't need more of it
    if (discards.some((d) => d.card.rank === card.rank)) demand -= 2;
  }
  return Math.max(0, demand);
}

// Baseline bar for "worth taking even though it doesn't directly help my
// own hand, purely to deny it to opponents." A wild needs meaningfully more
// than this before expert takes the reveal-cost hit of grabbing one off the
// discard pile (see wantsDiscardPileDraw) — holding a wild back is the
// default, same principle as hard, but a card multiple opponents are
// clearly both hunting for is worth denying outright even at that cost.
const DENY_OPPONENT_THRESHOLD = 3;
const DENY_OPPONENT_THRESHOLD_FOR_WILD = DENY_OPPONENT_THRESHOLD + 2;

/**
 * Scores each discard candidate by (opponent demand) vs (how loosely useful
 * it still is to the expert's own hand), picking the cheapest overall cost.
 * There's no hidden information worth actually sampling here, so this used
 * to loop 5 times and average an identical number under a "Monte Carlo"
 * label — simplified to the single deterministic pass it always really was.
 */
function scoreBestDiscard(state: GameState, player: Player, candidates: Card[]): Card {
  let best = candidates[0];
  let bestScore = -Infinity;

  for (const card of candidates) {
    const demand = opponentDemand(state, player.id, card);
    const selfValue = player.hand.some(
      (c) => !c.isWild && c.id !== card.id && c.suit === card.suit && minRunDistance(c.rank, card.rank) <= 1
    )
      ? 2
      : 0; // penalize discarding cards still loosely useful to itself
    // deadCards() already keeps wilds out of the normal pool, so this only
    // matters in the fallback where every natural is still needed — even
    // there, a wild should be close to the last resort.
    const wildCost = card.isWild ? WILD_DISCARD_RISK : 0;
    const score = -(demand * 2) - selfValue - wildCost;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

export const expertStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player, rng: Rng = Math.random) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;
    const mistake = maybeMistakeBool(MISTAKE_CHANCE.expert, rng);
    if (mistake !== null) return mistake;
    const demand = opponentDemand(state, player.id, top);
    if (top.isWild) {
      // Same "don't reveal need" principle as hard — but a flexible card
      // multiple opponents are clearly both hunting for is worth denying
      // outright, even at the cost of showing what it was.
      return demand >= DENY_OPPONENT_THRESHOLD_FOR_WILD;
    }
    const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
    const runAdjacent = player.hand.some(
      (c) => !c.isWild && c.suit === top.suit && minRunDistance(c.rank, top.rank) === 1
    );
    return rankMatch || runAdjacent || demand >= DENY_OPPONENT_THRESHOLD;
  },
  chooseDiscard(state: GameState, player: Player, rng: Rng = Math.random): Card {
    const mistake = maybeMistakeDiscard(player.hand, MISTAKE_CHANCE.expert, rng);
    if (mistake) return mistake;
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    return scoreBestDiscard(state, player, pool.length > 0 ? pool : [highestPenaltyCard(player.hand)]);
  },
  planLayOffs(state: GameState, player: Player) {
    // optimize wild allocation: only lay off wilds if doing so completes a
    // meld outright (i.e. no natural cards of that meld remain in hand to use instead)
    const plan = greedyLayOffPlan(state, player);
    return plan.filter((move) => {
      const card = player.hand.find((c) => c.id === move.cardId);
      if (!card?.isWild) return true;
      const hasNaturalAlternative = player.hand.some((c) => !c.isWild && c.id !== card.id);
      return !hasNaturalAlternative;
    });
  },
};
