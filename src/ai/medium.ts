// Medium: like Easy, plus a single-step read of the table — it won't hand
// over a card an opponent visibly grabbed one of last turn
// (opponentJustPickedUpThisRank), but keeps no running history the way Hard
// does, EXCEPT for whoever's visibly closing in on going out: once someone
// reads as close (isCloseToOut), medium starts checking their whole pickup
// history for this rank, not just their latest one — the same "pay closer
// attention to whoever's about to win" instinct a moderately attentive
// player picks up even without tracking everyone all game. Lays off its own
// wilds too, not just naturals. ~12% mistake rate.

import { Card, GameState, Player } from "../types";
import {
  AIStrategy,
  deadCards,
  handWantsCard,
  highestPenaltyCard,
  isCloseToOut,
  maybeMistakeBool,
  maybeMistakeDiscard,
  MISTAKE_CHANCE,
  Rng,
  selfWildLayOffPlan,
} from "./strategy";

function discardHelpsHand(top: Card, player: Player): boolean {
  if (top.isWild) return true; // wilds always help
  return handWantsCard(player.hand, top);
}

/** Whether any opponent's single most recent pickup shares this card's rank
 * — no accumulated history the way hard's dangerScore tracks, just an
 * obvious "they just grabbed one of these" tell that a moderately attentive
 * player would notice and not immediately hand another one to. */
function opponentJustPickedUpThisRank(state: GameState, player: Player, card: Card): boolean {
  return state.players.some((p) => {
    if (p.id === player.id) return false;
    const lastPickup = [...state.pickupHistory].reverse().find((h) => h.playerId === p.id);
    return lastPickup?.card.rank === card.rank;
  });
}

/** Whether ANY opponent who's visibly closing in on going out has ever
 * picked up this rank, not just most recently — the one bit of accumulated
 * history medium keeps, and only for whoever looks that close. */
function closeOpponentWantedThisRank(state: GameState, player: Player, card: Card): boolean {
  return state.players.some((p) => {
    if (p.id === player.id || !isCloseToOut(p)) return false;
    return state.pickupHistory.some((h) => h.playerId === p.id && h.card.rank === card.rank);
  });
}

export const mediumStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player, rng: Rng = Math.random) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;
    const mistake = maybeMistakeBool(MISTAKE_CHANCE.medium, rng);
    if (mistake !== null) return mistake;
    return discardHelpsHand(top, player);
  },
  chooseDiscard(state: GameState, player: Player, rng: Rng = Math.random): Card {
    const mistake = maybeMistakeDiscard(player.hand, MISTAKE_CHANCE.medium, rng);
    if (mistake) return mistake;
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    const notObviouslyWanted = pool.filter(
      (c) => !opponentJustPickedUpThisRank(state, player, c) && !closeOpponentWantedThisRank(state, player, c)
    );
    return highestPenaltyCard(notObviouslyWanted.length > 0 ? notObviouslyWanted : pool);
  },
  // Lays naturals off onto anyone's meld freely, but only lays a wild off
  // onto its own meld — a little self-interested with its wilds without
  // going as far as the hard/expert tiers' full protectiveness.
  planLayOffs: selfWildLayOffPlan,
};
