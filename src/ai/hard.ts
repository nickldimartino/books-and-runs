import { Card, GameState, Player } from "../types";
import {
  AIStrategy,
  dangerScore,
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

/** dangerScore plus a large penalty for a wild — deadCards() already keeps
 * wilds out of the normal pool, so this only matters in the fallback where
 * every natural is still needed; even there, a wild should be close to the
 * last resort rather than picked purely for its penalty value. */
function riskScore(state: GameState, player: Player, card: Card): number {
  return dangerScore(state, player, card) + (card.isWild ? WILD_DISCARD_RISK : 0);
}

export const hardStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player, rng: Rng = Math.random) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;
    const mistake = maybeMistakeBool(MISTAKE_CHANCE.hard, rng);
    if (mistake !== null) return mistake;
    if (top.isWild) return false; // hold discard-pile wilds back for itself only if drawn blind; don't reveal need
    const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
    const runAdjacent = player.hand.some(
      (c) => !c.isWild && c.suit === top.suit && minRunDistance(c.rank, top.rank) === 1
    );
    return rankMatch || runAdjacent;
  },
  chooseDiscard(state: GameState, player: Player, rng: Rng = Math.random): Card {
    const mistake = maybeMistakeDiscard(player.hand, MISTAKE_CHANCE.hard, rng);
    if (mistake) return mistake;
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    // among viable discards, avoid feeding opponents: prefer low risk, break ties by penalty value
    const ranked = [...pool].sort((a, b) => riskScore(state, player, a) - riskScore(state, player, b));
    const safest = ranked.filter((c) => riskScore(state, player, c) === riskScore(state, player, ranked[0]));
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
