// Real search over hidden information, for the tiers that use it (expert
// only, for now). The AI can only ever see its own hand plus whatever's
// already publicly played — never another player's actual cards, in solo
// or multiplayer alike. "Search" without cheating means sampling a
// *plausible* arrangement of what's hidden (a "determinization") that's
// consistent only with public facts — total deck composition, how many
// cards remain unseen, and each opponent's known hand size — then reasoning
// about that sample. That's the same inference a skilled human makes
// ("there's a good chance they're sitting on that run"), just computed
// instead of guessed. Drawing several independent samples and averaging
// (estimateCompletionChance) is what turns "maybe" into an actual
// probability rather than a single lucky or unlucky guess.
//
// Every function here takes an explicit Rng (see strategy.ts) rather than
// defaulting to Math.random internally — real play always passes
// Math.random (see expert.ts), but tests can pass a fixed value and get a
// fully deterministic, checkable result instead of asserting on
// probabilities. pickWithoutReplacement is written to be safe even for a
// degenerate rng that returns exactly 1 (e.g. this file's own test suite's
// NEVER_MISTAKE) rather than assuming rng() is always < 1.

import { decksForPlayerCount } from "../deck";
import { canLayOff, solveContract } from "../meld";
import { Card, GameState, Player, Rank, Suit } from "../types";
import { Rng } from "./strategy";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

interface CardType {
  rank: Rank;
  suit: Suit;
}

function isWildRank(rank: Rank): boolean {
  return rank === "2" || rank === "JOKER";
}

/** Every (rank, suit) pair that exists in this game, however many decks
 * that is — mirrors deck.ts's buildDeck exactly, just without ids or
 * shuffling: sampling only needs to know how many of each kind of card
 * exist in total, not which specific physical card is which. */
function fullComposition(numDecks: number): CardType[] {
  const out: CardType[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) out.push({ rank, suit });
    out.push({ rank: "JOKER", suit: "joker" });
    out.push({ rank: "JOKER", suit: "joker" });
  }
  return out;
}

/** Every card the AI can currently see anywhere: its own hand, the discard
 * pile, and every card already laid down in a table meld. What's left after
 * subtracting this from fullComposition is exactly the multiset of cards
 * that are genuinely still hidden — in the closed stock or in some
 * opponent's hand — since a card is always exactly one of those five
 * places. */
function visibleCards(state: GameState, self: Player): Card[] {
  return [...self.hand, ...state.discardPile, ...state.melds.flatMap((m) => m.cards)];
}

/** Picks `count` items out of `pool` without replacement, order-independent
 * for the caller (a Set-like sample, returned as an array) — a minimal
 * partial shuffle rather than deck.ts's full Fisher-Yates, specifically so
 * it stays well-defined for any rng() in [0, 1], the closed interval:
 * clamping the index defensively means an edge-case rng that returns
 * exactly 1 (out of the [0, 1) range every *real* Rng promises) still picks
 * the pool's last remaining item instead of indexing out of bounds. */
function pickWithoutReplacement<T>(pool: T[], count: number, rng: Rng): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = Math.min(Math.floor(rng() * remaining.length), remaining.length - 1);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

/**
 * One random sample of what a specific opponent's hand could plausibly be,
 * given only public information: their known hand size, and the multiset
 * of cards not accounted for anywhere visible. Independent per call — draw
 * several (estimateCompletionChance) to get a genuine probability estimate
 * rather than a single guess. Never reads the opponent's actual hand.
 */
export function sampleOpponentHand(state: GameState, self: Player, opponent: Player, rng: Rng): Card[] {
  const numDecks = decksForPlayerCount(state.players.length);
  const pool = fullComposition(numDecks);
  for (const seen of visibleCards(state, self)) {
    const idx = pool.findIndex((c) => c.rank === seen.rank && c.suit === seen.suit);
    if (idx >= 0) pool.splice(idx, 1);
  }
  const picked = pickWithoutReplacement(pool, opponent.hand.length, rng);
  return picked.map((t, i) => ({
    id: `sample-${opponent.id}-${i}`,
    rank: t.rank,
    suit: t.suit,
    isWild: isWildRank(t.rank),
  }));
}

/**
 * Real, not probabilistic, risk for the common "close to out" case: an
 * opponent who's already melded their contract, now just shedding whatever
 * remains via lay-offs and discards. Whether a card is eligible to lay off
 * onto some current table meld — lay-off targets aren't restricted to
 * melds the layer-off themself owns — is entirely public information, no
 * sampling needed at all. Distinct from estimateCompletionChance, which
 * covers the rarer case of someone who *hasn't* melded yet: this game's
 * smallest contract needs 6 cards, so an unmelded hand realistically never
 * shrinks small enough (hand size only changes by melding or laying off,
 * neither of which has happened yet) for that simulation to matter in
 * practice — this is the check that actually fires in real games.
 */
export function layOffRisk(state: GameState, opponent: Player, card: Card): number {
  if (!opponent.hasMeldedContract) return 0;
  if (!state.melds.some((m) => canLayOff(card, m))) return 0;
  // Certain to end the round for them if it's their very last card; still a
  // real, if smaller, risk otherwise — same taper leaderPressure uses.
  return opponent.hand.length <= 1 ? 1 : 0.6;
}

/**
 * Monte Carlo estimate, in [0, 1], of "if I hand this exact card to this
 * opponent, what's the chance it completes their contract outright" —
 * draws `samples` independent sampled hands (sampleOpponentHand) and checks
 * the real meld solver against each one plus the candidate card, returning
 * the fraction that succeed. Cheap enough to call often because it's only
 * ever worth calling at all for an opponent with a small hand (see
 * strategy.ts's isCloseToOut) — solveContract on a couple of sampled cards
 * is fast, and a large hand makes this uninformative anyway (a big random
 * hand can complete almost any contract by sheer luck, telling you nothing
 * about the real one).
 */
export function estimateCompletionChance(
  state: GameState,
  self: Player,
  opponent: Player,
  card: Card,
  samples: number,
  rng: Rng
): number {
  const requirement = state.selectedContracts[state.round - 1];
  let hits = 0;
  for (let i = 0; i < samples; i++) {
    const sample = sampleOpponentHand(state, self, opponent, rng);
    if (solveContract([...sample, card], requirement, opponent.id) !== null) hits++;
  }
  return hits / samples;
}
