import { Card, GameState, Player } from "../types";
import {
  AIStrategy,
  deadCards,
  highestPenaltyCard,
  maybeMistakeBool,
  maybeMistakeDiscard,
  minRunDistance,
  MISTAKE_CHANCE,
  Rng,
  selfWildLayOffPlan,
} from "./strategy";

function discardHelpsHand(top: Card, player: Player): boolean {
  if (top.isWild) return true; // wilds always help
  const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
  if (rankMatch) return true;
  // simple run-adjacency: same suit, and hand already has a card one rank away
  return player.hand.some(
    (c) => !c.isWild && c.suit === top.suit && minRunDistance(c.rank, top.rank) === 1
  );
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
    const notObviouslyWanted = pool.filter((c) => !opponentJustPickedUpThisRank(state, player, c));
    return highestPenaltyCard(notObviouslyWanted.length > 0 ? notObviouslyWanted : pool);
  },
  // Lays naturals off onto anyone's meld freely, but only lays a wild off
  // onto its own meld — a little self-interested with its wilds without
  // going as far as the hard/expert tiers' full protectiveness.
  planLayOffs: selfWildLayOffPlan,
};
