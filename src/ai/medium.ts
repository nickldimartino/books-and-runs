import { Card, GameState, Player } from "../types";
import { AIStrategy, deadCards, greedyLayOffPlan, highestPenaltyCard } from "./strategy";

function discardHelpsHand(top: Card, player: Player): boolean {
  if (top.isWild) return true; // wilds always help
  const rankMatch = player.hand.some((c) => !c.isWild && c.rank === top.rank);
  if (rankMatch) return true;
  // simple run-adjacency: same suit, and hand already has a card one rank away
  const RUN_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const topIdx = RUN_ORDER.indexOf(top.rank);
  return player.hand.some((c) => {
    if (c.isWild || c.suit !== top.suit) return false;
    const idx = RUN_ORDER.indexOf(c.rank);
    return Math.abs(idx - topIdx) === 1;
  });
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
  planLayOffs: greedyLayOffPlan,
};
