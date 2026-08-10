import { bookCandidates, canLayOff, runCandidates, splitWildsAndNaturals } from "../meld";
import { Card, GameState, Player } from "../types";

export interface LayOffMove {
  cardId: string;
  meldId: string;
}

export interface AIStrategy {
  /** Should this AI draw from the discard pile, if possible? */
  wantsDiscardPileDraw(state: GameState, player: Player): boolean;
  /** Which card should this AI discard to end its turn? */
  chooseDiscard(state: GameState, player: Player): Card;
  /** Which cards (if any) should this AI lay off onto table melds this turn? */
  planLayOffs(state: GameState, player: Player): LayOffMove[];
}

/** Greedy lay-off: offload every card that can legally extend some meld, own or others'. */
export function greedyLayOffPlan(state: GameState, player: Player): LayOffMove[] {
  const moves: LayOffMove[] = [];
  const claimedThisTurn = new Set<string>();
  for (const card of player.hand) {
    const meld = state.melds.find(
      (m) => !claimedThisTurn.has(card.id) && canLayOff(card, m)
    );
    if (meld) {
      moves.push({ cardId: card.id, meldId: meld.id });
      claimedThisTurn.add(card.id);
    }
  }
  return moves;
}

/**
 * Cards not currently usable toward *this round's* contract — a contract-aware
 * discard pool. A card counts as "live" if it's part of some book or run
 * candidate that the round actually needs (books only checked when the round
 * needs books, runs only when it needs runs) and is completable with the
 * wilds currently in hand. Everything else is safe-ish to discard.
 */
export function deadCards(player: Player, state: GameState): Card[] {
  const requirement = state.selectedContracts[state.round - 1];
  const { wilds, naturals } = splitWildsAndNaturals(player.hand);

  const liveIds = new Set<string>();

  if (requirement.books > 0) {
    for (const cand of bookCandidates(naturals, requirement.bookSize)) {
      if (cand.wildsNeeded <= wilds.length) {
        cand.naturalCards.forEach((c) => liveIds.add(c.id));
      }
    }
  }
  if (requirement.runs > 0) {
    for (const cand of runCandidates(naturals, requirement.runSize)) {
      if (cand.wildsNeeded <= wilds.length) {
        cand.naturalCards.forEach((c) => liveIds.add(c.id));
      }
    }
  }

  return player.hand.filter((c) => !c.isWild && !liveIds.has(c.id));
}

export function highestPenaltyCard(cards: Card[]): Card {
  const penaltyOf = (c: Card) =>
    c.rank === "JOKER" ? 50 : c.rank === "2" ? 20 : c.rank === "A" ? 15 : ["J", "Q", "K"].includes(c.rank) ? 10 : 5;
  return [...cards].sort((a, b) => penaltyOf(b) - penaltyOf(a))[0];
}
