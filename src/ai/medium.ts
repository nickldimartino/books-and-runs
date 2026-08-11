import { Card, GameState, Player } from "../types";
import { AIStrategy, deadCards, highestPenaltyCard, minRunDistance, selfWildLayOffPlan } from "./strategy";

function discardHelpsHand(top: Card, player: Player): boolean {
  if (top.isWild) return true; // wilds always help
  const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
  if (rankMatch) return true;
  // simple run-adjacency: same suit, and hand already has a card one rank away
  return player.hand.some(
    (c) => !c.isWild && c.suit === top.suit && minRunDistance(c.rank, top.rank) === 1
  );
}

export const mediumStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player) {
    const top = state.discardPile[state.discardPile.length - 1];
    return !!top && discardHelpsHand(top, player);
  },
  chooseDiscard(state: GameState, player: Player): Card {
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    return highestPenaltyCard(pool);
  },
  // Lays naturals off onto anyone's meld freely, but only lays a wild off
  // onto its own meld — a little self-interested with its wilds without
  // going as far as the hard/expert tiers' full protectiveness.
  planLayOffs: selfWildLayOffPlan,
};
