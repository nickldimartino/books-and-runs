// The AIStrategy interface every tier implements, plus the shared building
// blocks the tiers compose differently:
//   - MISTAKE_CHANCE + maybeMistake* — the tapering "human lapse" roll that
//     keeps Easy→Expert from playing perfectly once their heuristic is known.
//   - deadCards / highestPenaltyCard / minRunDistance — reading a hand.
//   - dangerScore / WILD_DISCARD_RISK — reading what opponents want, from
//     discard and pickup history.
//   - isCloseToOut / leaderPressure — reading how close a player (opponent
//     or self) is to going out, so a tier can weight danger toward whoever
//     that's most urgent for, and stop playing defense on itself once
//     there's no more "future" worth hoarding for.
//   - greedyLayOffPlan / selfWildLayOffPlan / cautiousWildLayOffPlan —
//     choosing lay-offs.
// The per-tier files decide which of these to use and how cautiously; this
// file holds no strategy of its own.

import { bookCandidates, layOffOptions, rankPositions, runCandidates, solveContract, splitWildsAndNaturals } from "../meld";
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
 * as holding every wild back (see cautiousWildLayOffPlan below).
 */
export function selfWildLayOffPlan(state: GameState, player: Player): LayOffMove[] {
  return layOffPlan(state, player, (card) =>
    card.isWild ? state.melds.filter((m) => m.ownerId === player.id) : state.melds
  );
}

/**
 * Lays off every eligible natural, but a wild only when doing so completes a
 * lay-off outright — no natural card remains in hand that could do the same
 * job instead — UNLESS the player is themself closing in on going out
 * (isCloseToOut), in which case every wild goes too, no restriction. Hard
 * and expert both use this: hoarding a wild for hypothetical future
 * flexibility only makes sense when there's a future turn actually worth
 * planning for. A hand's own AI-balance test caught this the hard way —
 * holding every wild back unconditionally (the tiers' original behavior)
 * measurably slowed both tiers down in a race-to-empty-your-hand game,
 * enough that easy/medium were out-winning them on pace despite playing
 * worse defense.
 */
export function cautiousWildLayOffPlan(state: GameState, player: Player): LayOffMove[] {
  const plan = greedyLayOffPlan(state, player);
  if (isCloseToOut(player)) return plan;
  return plan.filter((move) => {
    const card = player.hand.find((c) => c.id === move.cardId);
    if (!card?.isWild) return true;
    const hasNaturalAlternative = player.hand.some((c) => !c.isWild && c.id !== card.id);
    return !hasNaturalAlternative;
  });
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

/** Hand size at/below which a player reads as "closing in on going out" —
 * the single biggest tell a real player watches the table for, and (via
 * leaderPressure below) the thing every tier from medium up increasingly
 * avoids feeding. Guarded against hand.length === 0 on its own: a player
 * genuinely down to zero cards mid-decision either just ended the round (not
 * a state anyone's still choosing a discard against) or, in a hand-built
 * test fixture, simply never had a hand set at all — neither should read as
 * "about to win." */
export const CLOSE_TO_OUT_HAND_SIZE = 3;

export function isCloseToOut(p: Player): boolean {
  return p.hasMeldedContract || (p.hand.length > 0 && p.hand.length <= CLOSE_TO_OUT_HAND_SIZE);
}

/**
 * How urgently a specific player should be read as "don't feed them" (an
 * opponent) or "stop playing defense, just finish" (yourself) — 0 for
 * anyone not yet close, scaling up sharply as their hand shrinks from
 * CLOSE_TO_OUT_HAND_SIZE toward empty, with a further jump once they've
 * already melded their contract (all that's left for them is emptying
 * whatever remains via lay-offs/discards).
 */
export function leaderPressure(p: Player): number {
  if (!isCloseToOut(p)) return 0;
  const handUrgency = Math.max(0, CLOSE_TO_OUT_HAND_SIZE + 1 - p.hand.length);
  return handUrgency + (p.hasMeldedContract ? 3 : 0);
}

/** Rough danger score for a rank/suit: how often opponents have picked up
 * near it, weighted up sharply for whichever specific opponent contributed
 * that evidence is themself closing in on going out (leaderPressure) — the
 * same card reads as far riskier to hand to someone one card from winning
 * than to someone just starting. Used by the hard tier; deadCards() already
 * keeps a wild out of the *normal* discard pool, so this only ever runs
 * against a wild in the rare fallback where literally everything else in
 * hand is still needed; it doesn't on its own account for a wild being
 * valuable to any opponent regardless of history — see WILD_DISCARD_RISK for
 * that. */
export function dangerScore(state: GameState, player: Player, card: Card): number {
  let score = 0;
  for (const pickup of state.pickupHistory) {
    if (pickup.playerId === player.id) continue;
    const opponent = state.players.find((p) => p.id === pickup.playerId);
    const weight = 1 + (opponent ? leaderPressure(opponent) : 0);
    if (pickup.card.rank === card.rank) score += 2 * weight;
    if (pickup.card.suit === card.suit && minRunDistance(pickup.card.rank, card.rank) <= 2) score += 1 * weight;
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

/**
 * Would adding this card to the player's own hand let them complete this
 * round's contract outright, right now? Used by hard/expert to override
 * their usual "hold a wild back, don't reveal need" caution when drawing
 * from the discard pile — a real strong player takes a card that finishes
 * their hand no matter what it tips off, since going out ends the round
 * before that information could ever be used against them. Only ever
 * reasons about the player's own hand plus the one candidate card — no
 * opponent hand contents involved, so this stays exactly as fair as every
 * other read here (see also isCloseToOut/leaderPressure above).
 */
export function completesOwnContract(state: GameState, player: Player, card: Card): boolean {
  const requirement = state.selectedContracts[state.round - 1];
  return solveContract([...player.hand, card], requirement, player.id) !== null;
}
