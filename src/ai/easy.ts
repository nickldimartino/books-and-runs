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
} from "./strategy";

export const easyStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player, rng: Rng = Math.random) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;
    const mistake = maybeMistakeBool(MISTAKE_CHANCE.easy, rng);
    if (mistake !== null) return mistake;
    // An obviously flexible card looks good to a player who isn't thinking
    // about what taking it reveals — unlike hard/expert, easy doesn't hold
    // wilds back.
    if (top.isWild) return true;
    const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
    const runAdjacent = player.hand.some(
      (c) => !c.isWild && c.suit === top.suit && minRunDistance(c.rank, top.rank) === 1
    );
    return rankMatch || runAdjacent;
  },
  chooseDiscard(state: GameState, player: Player, rng: Rng = Math.random): Card {
    const mistake = maybeMistakeDiscard(player.hand, MISTAKE_CHANCE.easy, rng);
    if (mistake) return mistake;
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    return highestPenaltyCard(pool);
  },
  planLayOffs: greedyLayOffPlan,
};
