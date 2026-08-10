import { Card, GameState, Player } from "../types";
import { AIStrategy, deadCards, greedyLayOffPlan, highestPenaltyCard } from "./strategy";

const RUN_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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
      if (pickup.card.suit === card.suit) {
        const dist = Math.abs(RUN_ORDER.indexOf(pickup.card.rank) - RUN_ORDER.indexOf(card.rank));
        if (dist <= 2) demand += 1.5;
      }
    }
    // if this opponent has discarded this exact rank before, they likely don't need more of it
    if (discards.some((d) => d.card.rank === card.rank)) demand -= 2;
  }
  return Math.max(0, demand);
}

/**
 * Lightweight Monte Carlo: sample a few plausible discard choices and score
 * each by (own hand improvement potential) - (opponent demand), picking the
 * best expected outcome rather than just the single lowest-danger card.
 */
function simulateBestDiscard(state: GameState, player: Player, candidates: Card[]): Card {
  const SAMPLES = 5;
  let best = candidates[0];
  let bestScore = -Infinity;

  for (const card of candidates) {
    let score = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const demand = opponentDemand(state, player.id, card);
      const selfValue = player.hand.some(
        (c) => !c.isWild && c.id !== card.id && c.suit === card.suit &&
          Math.abs(RUN_ORDER.indexOf(c.rank) - RUN_ORDER.indexOf(card.rank)) <= 1
      )
        ? 2
        : 0; // penalize discarding cards still loosely useful to itself
      score += -(demand * 2) - selfValue;
    }
    const avg = score / SAMPLES;
    if (avg > bestScore) {
      bestScore = avg;
      best = card;
    }
  }
  return best;
}

export const expertStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;
    const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
    const runAdjacent = player.hand.some(
      (c) => !c.isWild && c.suit === top.suit && Math.abs(RUN_ORDER.indexOf(c.rank) - RUN_ORDER.indexOf(top.rank)) === 1
    );
    // expert also considers denying a high-demand card to opponents even if it doesn't directly help
    const wouldDenyOpponent = opponentDemand(state, player.id, top) >= 3;
    return rankMatch || runAdjacent || wouldDenyOpponent;
  },
  chooseDiscard(state: GameState, player: Player): Card {
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    return simulateBestDiscard(state, player, pool.length > 0 ? pool : [highestPenaltyCard(player.hand)]);
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
