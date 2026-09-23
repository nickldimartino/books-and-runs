// Easy: the first tier that actually thinks, but only about its own hand —
// takes the discard if it obviously pairs or extends something, dumps its
// highest-penalty dead card, lays off greedily whenever it can. No notion
// of what opponents are collecting. 20% of decisions still fall back to a
// Beginner-style random pick (MISTAKE_CHANCE.easy).

import { Card, GameState, Player } from "../types";
import {
  AIStrategy,
  deadCards,
  greedyLayOffPlan,
  handWantsCard,
  highestPenaltyCard,
  maybeMistakeBool,
  maybeMistakeDiscard,
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
    return handWantsCard(player.hand, top);
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
