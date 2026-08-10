import { Card, GameState, Player } from "../types";
import { AIStrategy, deadCards, greedyLayOffPlan, highestPenaltyCard } from "./strategy";

export const easyStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top || top.isWild) return false;
    // only take the discard if it obviously helps: matches a rank already in hand
    return player.hand.some((c) => !c.isWild && c.rank === top.rank);
  },
  chooseDiscard(state: GameState, player: Player): Card {
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    return highestPenaltyCard(pool);
  },
  planLayOffs: greedyLayOffPlan,
};
