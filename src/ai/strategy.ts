import { bookCandidates, layOffOptions, rankPositions, runCandidates, splitWildsAndNaturals } from "../meld";
import { cardPenalty } from "../scorer";
import { Card, GameState, Meld, Player, Rank } from "../types";

export interface LayOffMove {
  cardId: string;
  meldId: string;
  // Which end of a run to extend — only meaningful for a wild laid onto a
  // run with room on both ends, where the choice is genuinely ambiguous and
  // a human player would be asked; the AI just needs to pick one.
  position?: "low" | "high";
}

/** Injectable randomness source — defaults to Math.random at every call site,
 * but lets tests pin down exactly when (and how) a tier's mistake chance
 * fires instead of depending on real randomness. */
export type Rng = () => number;

export interface AIStrategy {
  /** Should this AI draw from the discard pile, if possible? */
  wantsDiscardPileDraw(state: GameState, player: Player, rng?: Rng): boolean;
  /** Which card should this AI discard to end its turn? */
  chooseDiscard(state: GameState, player: Player, rng?: Rng): Card;
  /** Which cards (if any) should this AI lay off onto table melds this turn? */
  planLayOffs(state: GameState, player: Player): LayOffMove[];
}

/**
 * Tapering "occasional lapse in judgment" chance for every tier above
 * Beginner (which is already 100% random and needs no help feeling human).
 * Without this, Beginner's total randomness gives way to a fully rational —
 * if simplistic — Easy with zero ramp in between, and every tier from Easy
 * to Expert is otherwise 100% deterministic once its heuristic is known.
 * Each harder tier still slips up less often than the one before it, so the
 * curve feels gradual rather than "solved" the instant you're not Beginner.
 */
export const MISTAKE_CHANCE: Record<"easy" | "medium" | "hard" | "expert", number> = {
  easy: 0.2,
  medium: 0.12,
  hard: 0.05,
  expert: 0.02,
};

/** Rolls a tier's mistake chance for its discard choice; when it fires,
 * returns a uniformly random card from the whole hand — the exact same
 * "no judgment at all" pick Beginner always makes — instead of letting the
 * caller apply its usual heuristic. Returns null when no mistake fires. */
export function maybeMistakeDiscard(hand: Card[], chance: number, rng: Rng): Card | null {
  if (hand.length === 0 || rng() >= chance) return null;
  return hand[Math.floor(rng() * hand.length)];
}

/** Rolls a tier's mistake chance for a yes/no call (wantsDiscardPileDraw);
 * when it fires, flips a coin instead of applying real judgment — mirroring
 * Beginner's actual 50/50 for the same decision. Returns null when no
 * mistake fires. */
export function maybeMistakeBool(chance: number, rng: Rng): boolean | null {
  if (rng() >= chance) return null;
  return rng() < 0.5;
}

/** Shared lay-off search: for each hand card, in hand order, offload it onto
 * the first eligible meld `meldsFor` offers for that card. */
function layOffPlan(state: GameState, player: Player, meldsFor: (card: Card) => Meld[]): LayOffMove[] {
  const moves: LayOffMove[] = [];
  const claimedThisTurn = new Set<string>();
  for (const card of player.hand) {
    if (claimedThisTurn.has(card.id)) continue;
    for (const meld of meldsFor(card)) {
      const options = layOffOptions(card, meld);
      if (options.length > 0) {
        moves.push({ cardId: card.id, meldId: meld.id, position: options[0] });
        claimedThisTurn.add(card.id);
        break;
      }
    }
  }
  return moves;
}

/** Greedy lay-off: offload every card that can legally extend some meld, own or others'. */
export function greedyLayOffPlan(state: GameState, player: Player): LayOffMove[] {
  return layOffPlan(state, player, () => state.melds);
}

/**
 * Like greedyLayOffPlan, but a wild only ever targets a meld the player
 * themself owns — naturals are still offered to anyone's meld. Represents a
 * player who's generous with cards that only ever help their own hand size,
 * but a little protective of a flexible wild's value, without going as far
 * as holding every wild back (see the hard/expert strategies for that).
 */
export function selfWildLayOffPlan(state: GameState, player: Player): LayOffMove[] {
  return layOffPlan(state, player, (card) =>
    card.isWild ? state.melds.filter((m) => m.ownerId === player.id) : state.melds
  );
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

/**
 * How close two ranks could sit within some run window — 0 for the same
 * rank, 1 for neighbors, and so on. Accounts for an Ace's two possible
 * positions (low, before 2, or high, after King): naively comparing
 * `RUN_ORDER.indexOf(rank)` treats Ace as always-low, so it silently never
 * recognizes King-Ace as adjacent for an ace-high run — this checks every
 * position each rank could occupy and returns the closest pairing.
 */
export function minRunDistance(a: Rank, b: Rank): number {
  let min = Infinity;
  for (const pa of rankPositions(a)) {
    for (const pb of rankPositions(b)) {
      min = Math.min(min, Math.abs(pa - pb));
    }
  }
  return min;
}

export function highestPenaltyCard(cards: Card[]): Card {
  return [...cards].sort((a, b) => cardPenalty(b) - cardPenalty(a))[0];
}

/** Rough danger score for a rank/suit: how often opponents have picked up
 * near it. Shared by the hard and expert tiers — deadCards() already keeps
 * a wild out of the *normal* discard pool, so this only ever runs against a
 * wild in the rare fallback where literally everything else in hand is
 * still needed; it doesn't on its own account for a wild being valuable to
 * any opponent regardless of history — see WILD_DISCARD_RISK for that. */
export function dangerScore(state: GameState, player: Player, card: Card): number {
  let score = 0;
  for (const pickup of state.pickupHistory) {
    if (pickup.playerId === player.id) continue;
    if (pickup.card.rank === card.rank) score += 2;
    if (pickup.card.suit === card.suit && minRunDistance(pickup.card.rank, card.rank) <= 2) score += 1;
  }
  return score;
}

/**
 * How much extra "don't discard this" weight a wild card deserves on top of
 * its plain dangerScore/opponentDemand, for the tiers (hard, expert) that
 * otherwise hold wilds back entirely. A wild only reaches either tier's
 * discard-scoring at all in the rare fallback where every natural card is
 * still needed for the contract — large enough that, in that fallback, a
 * wild only actually gets discarded when every non-wild alternative scores
 * comparably badly (e.g. a hand that's nearly all wilds), not just whenever
 * it happens to have the highest raw penalty value in the pool.
 */
export const WILD_DISCARD_RISK = 12;
