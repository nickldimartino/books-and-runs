// Expert: weighs each discard as (opponent demand) vs (residual usefulness
// to its own hand) and takes the cheapest, will grab a card purely to deny
// it when multiple opponents clearly want it (DENY_OPPONENT_THRESHOLD) or
// one opponent both wants it and is closing in on going out, and only
// spends a wild on a lay-off when no natural could do the job instead —
// unless it's the one closing in, at which point it stops hoarding
// (cautiousWildLayOffPlan). ~2% mistake rate. opponentDemand is a heuristic
// read of the table; on top of it, expert is the one tier that runs a real
// search when it matters most (closeOpponentCompletionRisk, see
// determinize.ts) — Monte Carlo sampling plausible hands for whoever's
// visibly closing in on going out, rather than only reading their history.
// (An much earlier version wrapped the deterministic scoring in a
// pointless 5-iteration "Monte Carlo" average that didn't actually sample
// anything — since removed; this is the real thing.)

import { estimateCompletionChance, layOffRisk } from "./determinize";
import { Card, GameState, Player } from "../types";
import {
  AIStrategy,
  cautiousWildLayOffPlan,
  completesOwnContract,
  deadCards,
  handWantsCard,
  highestPenaltyCard,
  isCloseToOut,
  leaderPressure,
  maybeMistakeBool,
  maybeMistakeDiscard,
  minRunDistance,
  MISTAKE_CHANCE,
  Rng,
  WILD_DISCARD_RISK,
} from "./strategy";

// How many hidden-hand samples to average per completion-risk check — high
// enough to not be dominated by one lucky/unlucky draw, low enough to stay
// fast (only ever runs at all when there's an opponent worth checking).
const SIMULATION_SAMPLES = 10;
// Estimated chance (0-1) of directly handing a close opponent the round,
// above which it's worth denying the card outright.
const SIMULATION_DENY_THRESHOLD = 0.3;
// How heavily a discard's own completion-risk score weighs against handing
// it to a close opponent — large enough to swing a choice on its own even
// with sparse pickup-history evidence (opponentDemand's blind spot: a
// close opponent's tiny remaining hand is risky by construction, whether or
// not they've tipped their hand with visible pickups yet).
const COMPLETION_RISK_WEIGHT = 40;

/** Real search, not a heuristic: the worst-case (max, not summed — the
 * question is "could ANY of them go out with this," not an additive tally)
 * risk across every opponent visibly closing in on going out
 * (isCloseToOut). Combines two genuinely different checks per opponent —
 * layOffRisk (deterministic, public: already melded, can this exact card
 * be shed right now) for the common case, and estimateCompletionChance
 * (Monte Carlo over a sampled hand) for the rarer one where they haven't
 * melded yet — see determinize.ts's own doc for why each matters where it
 * does. Skips both entirely (returns 0) when no opponent is close enough
 * for either to be worth running at all. */
function closeOpponentCompletionRisk(state: GameState, player: Player, card: Card, rng: Rng): number {
  const closeOpponents = state.players.filter((p) => p.id !== player.id && isCloseToOut(p));
  if (closeOpponents.length === 0) return 0;
  return Math.max(
    ...closeOpponents.map((p) =>
      Math.max(
        layOffRisk(state, p, card),
        p.hasMeldedContract ? 0 : estimateCompletionChance(state, player, p, card, SIMULATION_SAMPLES, rng)
      )
    )
  );
}

/**
 * Estimates how much each opponent likely wants this card, using both their
 * pickup history (direct evidence) and how far along they seem to be in
 * building their contract (fewer cards discarded from a rank/suit family =
 * more likely still hunting for it) — scaled up sharply for an opponent
 * who's themself closing in on going out (leaderPressure): the same
 * evidence should read as far more urgent to deny coming from someone one
 * card from winning than from someone just starting.
 */
function opponentDemand(state: GameState, selfId: string, card: Card): number {
  let demand = 0;
  const opponents = state.players.filter((p) => p.id !== selfId);

  for (const p of opponents) {
    const pickups = state.pickupHistory.filter((h) => h.playerId === p.id);
    const discards = state.discardHistory.filter((h) => h.playerId === p.id);
    const weight = 1 + leaderPressure(p);

    for (const pickup of pickups) {
      if (pickup.card.rank === card.rank) demand += 3 * weight;
      if (pickup.card.suit === card.suit && minRunDistance(pickup.card.rank, card.rank) <= 2) demand += 1.5 * weight;
    }
    // if this opponent has discarded this exact rank before, they likely don't need more of it
    if (discards.some((d) => d.card.rank === card.rank)) demand -= 2;
  }
  return Math.max(0, demand);
}

// Baseline bar for "worth taking even though it doesn't directly help my
// own hand, purely to deny it to opponents." A wild needs meaningfully more
// than this before expert takes the reveal-cost hit of grabbing one off the
// discard pile (see wantsDiscardPileDraw) — holding a wild back is the
// default, same principle as hard, but a card multiple opponents are
// clearly both hunting for is worth denying outright even at that cost.
const DENY_OPPONENT_THRESHOLD = 3;
const DENY_OPPONENT_THRESHOLD_FOR_WILD = DENY_OPPONENT_THRESHOLD + 2;

/**
 * Scores each discard candidate by (opponent demand) vs (how loosely useful
 * it still is to the expert's own hand) vs (real simulated completion risk
 * for whoever's closest to going out), picking the cheapest overall cost.
 */
function scoreBestDiscard(state: GameState, player: Player, candidates: Card[], rng: Rng): Card {
  let best = candidates[0];
  let bestScore = -Infinity;

  for (const card of candidates) {
    const demand = opponentDemand(state, player.id, card);
    const selfValue = player.hand.some(
      (c) => !c.isWild && c.id !== card.id && c.suit === card.suit && minRunDistance(c.rank, card.rank) <= 1
    )
      ? 2
      : 0; // penalize discarding cards still loosely useful to itself
    // deadCards() already keeps wilds out of the normal pool, so this only
    // matters in the fallback where every natural is still needed — even
    // there, a wild should be close to the last resort.
    const wildCost = card.isWild ? WILD_DISCARD_RISK : 0;
    const completionRisk = closeOpponentCompletionRisk(state, player, card, rng);
    const score = -(demand * 2) - selfValue - wildCost - completionRisk * COMPLETION_RISK_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

export const expertStrategy: AIStrategy = {
  wantsDiscardPileDraw(state: GameState, player: Player, rng: Rng = Math.random) {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) return false;
    const mistake = maybeMistakeBool(MISTAKE_CHANCE.expert, rng);
    if (mistake !== null) return mistake;
    if (top.isWild) {
      // A wild that completes the contract outright is worth taking no
      // matter what it reveals — same reasoning as hard, going out ends the
      // round before that information could matter. Otherwise, same
      // "don't reveal need" principle as hard — but a flexible card
      // multiple opponents are clearly both hunting for is worth denying
      // outright too, even at the cost of showing what it was.
      if (completesOwnContract(state, player, top)) return true;
      if (opponentDemand(state, player.id, top) >= DENY_OPPONENT_THRESHOLD_FOR_WILD) return true;
      // No strong heuristic evidence either way — run the real check for
      // whoever's closest to going out rather than assuming a quiet
      // pickup history means it's safe.
      return closeOpponentCompletionRisk(state, player, top, rng) >= SIMULATION_DENY_THRESHOLD;
    }
    const demand = opponentDemand(state, player.id, top);
    if (handWantsCard(player.hand, top) || demand >= DENY_OPPONENT_THRESHOLD) return true;
    return closeOpponentCompletionRisk(state, player, top, rng) >= SIMULATION_DENY_THRESHOLD;
  },
  chooseDiscard(state: GameState, player: Player, rng: Rng = Math.random): Card {
    const mistake = maybeMistakeDiscard(player.hand, MISTAKE_CHANCE.expert, rng);
    if (mistake) return mistake;
    const dead = deadCards(player, state);
    const pool = dead.length > 0 ? dead : player.hand;
    return scoreBestDiscard(state, player, pool.length > 0 ? pool : [highestPenaltyCard(player.hand)], rng);
  },
  planLayOffs: cautiousWildLayOffPlan,
};
