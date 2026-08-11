import { Card, GameState, Player } from "../types";
import { AIStrategy, deadCards, greedyLayOffPlan, highestPenaltyCard, minRunDistance } from "./strategy";

/** Rough danger score for a rank/suit: how often opponents have picked up near it. */
function dangerScore(state: GameState, player: Player, card: Card): number {
  let score = 0;
  for (const pickup of state.pickupHistory) {
    if (pickup.playerId === player.id) continue;
    if (pickup.card.rank === card.rank) score += 2;
    if (pickup.card.suit === card.suit && minRunDistance(pickup.card.rank, card.rank) <= 2) score += 1;
  }
  return score;
}

export const hardStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;
    if (top.isWild) return false; // hold discard-pile wilds back for itself only if drawn blind; don't reveal need
    const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
    const runAdjacent = player.hand.some(
      (c) => !c.isWild && c.suit === top.suit && minRunDistance(c.rank, top.rank) === 1
    );
    return rankMatch || runAdjacent;
  },
  chooseDiscard(state: GameState, player: Player): Card {
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    // among viable discards, avoid feeding opponents: prefer low danger, break ties by penalty value
    const ranked = [...pool].sort((a, b) => {
      const dangerDiff = dangerScore(state, player, a) - dangerScore(state, player, b);
      if (dangerDiff !== 0) return dangerDiff;
      return 0;
    });
    const safest = ranked.filter((c) => dangerScore(state, player, c) === dangerScore(state, player, ranked[0]));
    return highestPenaltyCard(safest);
  },
  planLayOffs(state: GameState, player: Player) {
    // hold wild cards back rather than laying them off early, unless hand is otherwise empty of options
    const plan = greedyLayOffPlan(state, player);
    return plan.filter((move) => {
      const card = player.hand.find((c) => c.id === move.cardId);
      return !card?.isWild;
    });
  },
};
