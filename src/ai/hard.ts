// Hard: scores every candidate discard by dangerScore — accumulated
// evidence across the whole round of what each opponent wants, weighted up
// sharply for an opponent who's themself closing in on going out — and
// keeps its wilds well back (WILD_DISCARD_RISK) unless it's the one closing
// in, at which point it stops hoarding and lays them off like anything else
// (cautiousWildLayOffPlan). Also breaks its own "don't reveal need for a
// wild" rule the instant doing so would complete its contract outright
// (completesOwnContract) — finishing ends the round before that information
// could ever be used against it. Only ~5% mistake rate, so its heuristic is
// on show almost every turn.

import { Card, GameState, Player } from "../types";
import {
  AIStrategy,
  cautiousWildLayOffPlan,
  completesOwnContract,
  dangerScore,
  deadCards,
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
    if (top.isWild) {
      // Still won't reveal need for a wild just because it's generically
      // useful — but one that completes the contract outright is worth
      // taking regardless of what it tips off, since going out ends the
      // round before that information could matter.
      return completesOwnContract(state, player, top);
    }
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
  planLayOffs: cautiousWildLayOffPlan,
};
