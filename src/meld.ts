import { Card, ContractRequirement, Meld, Rank } from "./types";

// Order used for runs. A 2 is dual-purpose (see validateManualGroup) so its
// "2" slot here can be filled either by an actual 2 played as its own rank,
// or — same as any other rank's slot — by a wild standing in for it.
//
// Ace gets two slots: low (index 0, before 2) and high (index 13, after K) —
// so a run can go A-2-3-4 or J-Q-K-A. The two Ace slots are 13 apart, farther
// than any run window, so one run can use one slot or the other but never
// both at once — that's what stops a run from wrapping Q-K-A-2.
export const RUN_ORDER: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** Positions a card's rank can occupy in a run window. Every rank has
 * exactly one, except Ace, which can sit at either end (see RUN_ORDER). */
export function rankPositions(rank: Rank): number[] {
  if (rank === "A") return [0, RUN_ORDER.length - 1];
  const idx = RUN_ORDER.indexOf(rank);
  return idx === -1 ? [] : [idx];
}

/**
 * The rank a run meld's card at `index` logically represents — useful for
 * labeling a wild card standing in for a specific slot, since a run's cards
 * are always kept in sorted positional order (see meldChosenGroups/
 * solveContract/layOffCard), so position alone determines the rank.
 */
export function runCardRank(meld: Meld, index: number): Rank | undefined {
  if (meld.type !== "run" || meld.runStartIndex === undefined) return undefined;
  return RUN_ORDER[meld.runStartIndex + index];
}

export interface Candidate {
  type: "book" | "run";
  key: string; // rank for books, "suit:startIndex" for runs
  naturalCards: Card[];
  wildsNeeded: number;
  // For runs only: the full window in position order, null = gap to fill
  // with a wild — lets callers place wilds into their correct slot instead
  // of just appending them, so runs stay in sorted rank order end to end.
  runSlots?: (Card | null)[];
}

// Base split feeding both the automatic solver below (solveContract/
// solveWholeHandContract, used for AI turns) and validateManualGroup (a
// human player's own melding). Every 2 lands in `wilds` here regardless —
// callers that want to recognize a 2 as its own natural rank reclassify it
// themselves from this starting point (see the "dual-purpose" handling in
// solveContract, solveWholeHandContract, and validateManualGroup), since
// which 2s actually get treated as natural depends on what the rest of the
// selection needs, not on the card alone.
export function splitWildsAndNaturals(hand: Card[]) {
  const wilds = hand.filter((c) => c.isWild);
  const naturals = hand.filter((c) => !c.isWild);
  return { wilds, naturals };
}

export function bookCandidates(naturals: Card[], bookSize: number): Candidate[] {
  const byRank = new Map<string, Card[]>();
  for (const c of naturals) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank)!.push(c);
  }
  const candidates: Candidate[] = [];
  for (const [rank, cards] of byRank) {
    const take = cards.slice(0, bookSize);
    const wildsNeeded = Math.max(0, bookSize - take.length);
    // A meld can't use more wild cards than natural ones.
    if (wildsNeeded > take.length) continue;
    candidates.push({ type: "book", key: `book:${rank}`, naturalCards: take, wildsNeeded });
  }
  return candidates;
}

export function runCandidates(naturals: Card[], runSize: number): Candidate[] {
  const bySuit = new Map<string, Map<number, Card>>();
  for (const c of naturals) {
    if (c.suit === "joker") continue;
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, new Map());
    const rankMap = bySuit.get(c.suit)!;
    for (const idx of rankPositions(c.rank)) {
      // if two identical cards (or an Ace's two possible slots) already have
      // an occupant, keep the first; the other becomes a candidate for a
      // different window/meld
      if (!rankMap.has(idx)) rankMap.set(idx, c);
    }
  }

  const candidates: Candidate[] = [];
  for (const [suit, rankMap] of bySuit) {
    for (let start = 0; start + runSize <= RUN_ORDER.length; start++) {
      const naturalCards: Card[] = [];
      const gaps: number[] = [];
      const runSlots: (Card | null)[] = [];
      for (let i = start; i < start + runSize; i++) {
        const card = rankMap.get(i);
        if (card) {
          naturalCards.push(card);
          runSlots.push(card);
        } else {
          gaps.push(i);
          runSlots.push(null);
        }
      }
      // require at least one natural card so we're not building a meld out of thin air
      if (naturalCards.length === 0) continue;
      // A meld can't use more wild cards than natural ones.
      if (gaps.length > naturalCards.length) continue;
      // A run can't have two wild cards in a row.
      const hasConsecutiveGaps = gaps.some((g, i2) => i2 > 0 && g === gaps[i2 - 1] + 1);
      if (hasConsecutiveGaps) continue;
      candidates.push({
        type: "run",
        key: `run:${suit}:${start}`,
        naturalCards,
        wildsNeeded: gaps.length,
        runSlots,
      });
    }
  }
  return candidates;
}

/**
 * Attempts to find a set of melds satisfying the round's full contract from
 * the given hand, using backtracking over candidate books/runs. Prefers
 * solutions that use fewer wild cards. Returns null if the contract cannot
 * currently be met.
 *
 * 2s are dual-purpose (see validateManualGroup) — they're fed into the
 * candidate pools alongside naturals, so this can recognize a book of 2s or
 * a run's own "2" slot instead of only ever treating a 2 as a generic wild.
 * Each physical 2 can still only serve one role in the final answer: the
 * ceiling check below counts a candidate's own claimed 2s (naturalCards
 * whose rank is "2") against the same wilds.length budget as the generic
 * wildsNeeded gap-fills, and the final wild pool excludes whichever 2s
 * actually ended up claimed, so a 2 spent as a natural never also gets
 * handed out to fill some other gap.
 */
export function solveContract(
  hand: Card[],
  requirement: ContractRequirement,
  ownerId: string
): Meld[] | null {
  const { wilds, naturals } = splitWildsAndNaturals(hand);
  const twos = wilds.filter((c) => c.rank === "2");
  const naturalsPlusTwos = [...naturals, ...twos];

  const bookCands = bookCandidates(naturalsPlusTwos, requirement.bookSize).filter(
    (c) => c.wildsNeeded <= wilds.length
  );
  const runCands = runCandidates(naturalsPlusTwos, requirement.runSize).filter(
    (c) => c.wildsNeeded <= wilds.length
  );

  // search books first, then runs, preferring low-wild candidates
  const sortedBooks = [...bookCands].sort((a, b) => a.wildsNeeded - b.wildsNeeded);
  const sortedRuns = [...runCands].sort((a, b) => a.wildsNeeded - b.wildsNeeded);

  const usedCardIds = new Set<string>();
  const chosen: Candidate[] = [];

  function twosClaimedBy(list: Candidate[]): number {
    return list.reduce((sum, c) => sum + c.naturalCards.filter((nc) => nc.rank === "2").length, 0);
  }

  function tryPick(pool: Candidate[], countNeeded: number, startFrom: number): boolean {
    if (countNeeded === 0) return true;
    for (let i = startFrom; i < pool.length; i++) {
      const cand = pool[i];
      if (cand.naturalCards.some((c) => usedCardIds.has(c.id))) continue;
      const wildsUsedSoFar = chosen.reduce((sum, c) => sum + c.wildsNeeded, 0);
      const twosClaimedIfChosen = twosClaimedBy(chosen) + twosClaimedBy([cand]);
      if (wildsUsedSoFar + cand.wildsNeeded + twosClaimedIfChosen > wilds.length) continue;

      chosen.push(cand);
      cand.naturalCards.forEach((c) => usedCardIds.add(c.id));

      if (tryPick(pool, countNeeded - 1, i + 1)) return true;

      chosen.pop();
      cand.naturalCards.forEach((c) => usedCardIds.delete(c.id));
    }
    return false;
  }

  const booksOk = tryPick(sortedBooks, requirement.books, 0);
  if (!booksOk) return null;
  const runsOk = tryPick(sortedRuns, requirement.runs, 0);
  if (!runsOk) return null;

  // build final Meld objects, assigning wild cards to fill shortfalls — for
  // runs, wilds go into their exact gap slot (via runSlots) so the meld
  // stays in sorted rank order instead of wilds just being tacked on the end.
  // Excludes any 2 already claimed as a natural above — that specific card
  // is spoken for, not free to hand out as a generic filler too.
  const claimedTwoIds = new Set(
    chosen.flatMap((c) => c.naturalCards.filter((nc) => nc.rank === "2").map((nc) => nc.id))
  );
  const wildPool = wilds.filter((c) => !claimedTwoIds.has(c.id));
  const melds: Meld[] = chosen.map((cand, idx) => {
    const wildsForThis = wildPool.splice(0, cand.wildsNeeded);
    if (cand.type === "run" && cand.runSlots) {
      let wi = 0;
      const cards = cand.runSlots.map((slot) => slot ?? wildsForThis[wi++]);
      const runStartIndex = Number(cand.key.split(":")[2]);
      return { id: `${ownerId}-meld-${idx}-${cand.key}`, type: "run", ownerId, cards, runStartIndex };
    }
    return {
      id: `${ownerId}-meld-${idx}-${cand.key}`,
      type: cand.type,
      ownerId,
      cards: [...cand.naturalCards, ...wildsForThis],
    };
  });

  return melds;
}

interface Chain {
  suit: string;
  positions: number[]; // sorted ascending RUN_ORDER indices
  cardsByPosition: Map<number, Card>;
}

/** Every way to assign each ace present to its low (0) or high (13) slot. */
function* aceAssignments(aces: Card[]): Generator<Map<string, number>> {
  const n = aces.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const assignment = new Map<string, number>();
    aces.forEach((card, i) => {
      assignment.set(card.id, mask & (1 << i) ? RUN_ORDER.length - 1 : 0);
    });
    yield assignment;
  }
}

/**
 * Groups each suit's naturals into maximal chains — runs of cards where
 * every consecutive pair is at most one slot apart (bridgeable by a single
 * wild; two consecutive wild-filled slots are never allowed, so a gap of two
 * or more forces a split into separate chains). Returns null if two
 * different cards resolve to the same slot (e.g. a duplicate same-suit,
 * same-rank card from a second deck) — such cards can never share one run.
 */
function buildChains(bySuit: Map<string, Card[]>, aceAssignment: Map<string, number>): Chain[] | null {
  const chains: Chain[] = [];
  for (const [suit, cards] of bySuit) {
    const positioned: { pos: number; card: Card }[] = [];
    const seenPos = new Set<number>();
    for (const card of cards) {
      const pos = card.rank === "A" ? aceAssignment.get(card.id)! : rankPositions(card.rank)[0];
      if (seenPos.has(pos)) return null;
      seenPos.add(pos);
      positioned.push({ pos, card });
    }
    positioned.sort((a, b) => a.pos - b.pos);

    let current: { pos: number; card: Card }[] = [positioned[0]];
    const flush = () => {
      chains.push({
        suit,
        positions: current.map((p) => p.pos),
        cardsByPosition: new Map(current.map((p) => [p.pos, p.card])),
      });
    };
    for (let i = 1; i < positioned.length; i++) {
      if (positioned[i].pos - positioned[i - 1].pos > 2) {
        flush();
        current = [positioned[i]];
      } else {
        current.push(positioned[i]);
      }
    }
    flush();
  }
  return chains;
}

/**
 * Every valid way to lay out a single chain as one run window meeting
 * `runSize`: extending at most one wild-filled slot on the low end and/or
 * the high end beyond the chain's own natural span (extending further would
 * mean two consecutive wild slots, which is never allowed). Extension is
 * tried even when the natural span already meets `runSize`, since absorbing
 * an otherwise-unplaceable wild can require padding past the minimum.
 */
function chainWindowOptions(
  positions: number[],
  runSize: number
): { start: number; end: number; wildsNeeded: number }[] {
  const minPos = positions[0];
  const maxPos = positions[positions.length - 1];
  let internalWilds = 0;
  for (let i = 1; i < positions.length; i++) internalWilds += positions[i] - positions[i - 1] - 1;

  const options: { start: number; end: number; wildsNeeded: number }[] = [];
  for (const lowExt of [0, 1]) {
    for (const highExt of [0, 1]) {
      const start = minPos - lowExt;
      const end = maxPos + highExt;
      if (start < 0 || end > RUN_ORDER.length - 1) continue;
      if (end - start + 1 < runSize) continue;
      options.push({ start, end, wildsNeeded: internalWilds + lowExt + highExt });
    }
  }
  return options;
}

/** Picks one option per chain whose wildsNeeded sum exactly matches the
 * wild count available — every wild must be used, not merely enough. */
function findWildExactCombo(
  perChainOptions: { start: number; end: number; wildsNeeded: number }[][],
  totalWilds: number
): { start: number; end: number; wildsNeeded: number }[] | null {
  const chosen: { start: number; end: number; wildsNeeded: number }[] = [];
  function backtrack(i: number, wildsUsed: number): boolean {
    if (i === perChainOptions.length) return wildsUsed === totalWilds;
    for (const opt of perChainOptions[i]) {
      if (wildsUsed + opt.wildsNeeded > totalWilds) continue;
      chosen.push(opt);
      if (backtrack(i + 1, wildsUsed + opt.wildsNeeded)) return true;
      chosen.pop();
    }
    return false;
  }
  return backtrack(0, 0) ? chosen : null;
}

/**
 * Solves a contract for the game's final "no discard" round: the entire
 * hand — every natural and every wild — must be consumed by the meld, since
 * there's no discard afterward once you've melded. Unlike solveContract,
 * runs here can be longer than runSize, however long it takes to absorb
 * every card in a suit's natural cluster. Only supports runs-only contracts
 * (books: 0) — the only round that currently sets wholeHandMeld.
 *
 * A maximal chain of naturals (see buildChains) always becomes exactly one
 * run — this doesn't search splitting one long natural cluster into two
 * shorter runs, so it can occasionally miss a technically-valid arrangement,
 * but it never proposes an invalid one. The player just keeps playing normal
 * turns until a hand that fits comes up, which is the point of this round
 * being the hardest one.
 *
 * 2s are dual-purpose (see validateManualGroup), but only claimed as a
 * suit's natural "2" here when that suit already has other naturals to
 * chain with — a lone 2 with nothing else in its suit can never reach
 * runSize on its own (extending a single-position chain by at most one slot
 * each end tops out at 3 cards), so claiming it anyway would only invent an
 * unsatisfiable phantom chain and make an otherwise-solvable hand fail. At
 * most one 2 per suit is claimed even when a suit qualifies, matching how
 * buildChains already treats any other duplicate same-suit natural — a
 * second copy stays in the wild pool instead of colliding on the same slot.
 *
 * Returns null if no arrangement uses every single card.
 */
export function solveWholeHandContract(
  hand: Card[],
  requirement: ContractRequirement,
  ownerId: string
): Meld[] | null {
  if (requirement.books > 0) return null; // not needed by any current round; not implemented

  const { wilds, naturals } = splitWildsAndNaturals(hand);

  const suitsWithNaturals = new Set(naturals.filter((c) => c.suit !== "joker").map((c) => c.suit));
  const claimedTwos = new Map<string, Card>();
  for (const c of wilds) {
    if (c.rank !== "2" || !suitsWithNaturals.has(c.suit)) continue;
    if (!claimedTwos.has(c.suit)) claimedTwos.set(c.suit, c);
  }
  const naturalsPlusTwos = [...naturals, ...claimedTwos.values()];
  if (naturalsPlusTwos.length === 0) return null; // a run always needs at least one natural anchor

  const bySuit = new Map<string, Card[]>();
  for (const c of naturalsPlusTwos) {
    if (c.suit === "joker") continue; // jokers are always wild, never a natural
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
    bySuit.get(c.suit)!.push(c);
  }

  const aces = naturals.filter((c) => c.rank === "A");
  const claimedTwoIds = new Set([...claimedTwos.values()].map((c) => c.id));
  const effectiveWilds = wilds.length - claimedTwos.size;

  for (const aceAssignment of aceAssignments(aces)) {
    const chains = buildChains(bySuit, aceAssignment);
    if (!chains || chains.length !== requirement.runs) continue;

    const perChainOptions = chains.map((chain) => chainWindowOptions(chain.positions, requirement.runSize));
    if (perChainOptions.some((opts) => opts.length === 0)) continue;

    const combo = findWildExactCombo(perChainOptions, effectiveWilds);
    if (!combo) continue;

    const wildPool = wilds.filter((c) => !claimedTwoIds.has(c.id));
    return chains.map((chain, idx) => {
      const { start, end } = combo[idx];
      const cards: Card[] = [];
      for (let pos = start; pos <= end; pos++) {
        cards.push(chain.cardsByPosition.get(pos) ?? wildPool.shift()!);
      }
      return {
        id: `${ownerId}-meld-${idx}-run:${chain.suit}:${start}`,
        type: "run" as const,
        ownerId,
        cards,
        runStartIndex: start,
      };
    });
  }

  return null;
}

export interface GroupValidation {
  valid: boolean;
  type?: "book" | "run";
  runStartIndex?: number;
  // For runs: the cards in sorted positional order (wilds placed in their
  // correct gap slot), ready to store directly as a Meld's cards array.
  orderedCards?: Card[];
  reason?: string;
}

/**
 * Validates a player-chosen set of cards as a single book or run meld, using
 * the same wild-substitution rules as the automatic solver — this just
 * checks a specific selection instead of searching the hand for one, so a
 * player can build their own melds by hand instead of the engine choosing
 * for them.
 *
 * Unlike a Joker, a 2 is dual-purpose: it can count as its own natural rank
 * (a "2", playable in a book of 2s or a run's actual "2" slot) or as a
 * generic wild standing in for something else — whichever makes the
 * selection valid. Since one physical 2 can only serve one role in one
 * meld, every way of assigning natural-vs-wild across the 2s in this
 * selection is tried, preferring the fewest treated as wild (so a real "2"
 * slot or a book of 2s wins over needlessly burning a 2 as a substitute),
 * until one produces a valid meld.
 */
export function validateManualGroup(cards: Card[], requirement: ContractRequirement): GroupValidation {
  const twos = cards.filter((c) => c.rank === "2");
  const maskCount = 1 << twos.length;
  const masksByFewestWildTwos = Array.from({ length: maskCount }, (_, m) => m).sort(
    (a, b) => countSetBits(a) - countSetBits(b)
  );

  let lastResult: GroupValidation = { valid: false, reason: "Include at least one non-wild card." };
  for (const mask of masksByFewestWildTwos) {
    const wildTwoIds = new Set(twos.filter((_, i) => (mask >> i) & 1).map((c) => c.id));
    const result = validateClassifiedGroup(cards, requirement, wildTwoIds);
    if (result.valid) return result;
    lastResult = result;
  }
  return lastResult;
}

function countSetBits(n: number): number {
  let count = 0;
  for (; n > 0; n >>= 1) count += n & 1;
  return count;
}

/** validateManualGroup's actual check, for one specific choice of which 2s (by id) count as wild. */
function validateClassifiedGroup(
  cards: Card[],
  requirement: ContractRequirement,
  wildTwoIds: Set<string>
): GroupValidation {
  const isWildHere = (c: Card) => (c.rank === "2" ? wildTwoIds.has(c.id) : c.isWild);
  const wilds = cards.filter(isWildHere);
  const naturals = cards.filter((c) => !isWildHere(c));

  if (naturals.length === 0) {
    return { valid: false, reason: "Include at least one non-wild card." };
  }
  if (wilds.length > naturals.length) {
    return { valid: false, reason: "A meld can't use more wild cards than natural cards." };
  }

  const ranks = new Set(naturals.map((c) => c.rank));
  if (ranks.size === 1) {
    if (cards.length < requirement.bookSize) {
      return { valid: false, reason: `A book needs at least ${requirement.bookSize} cards.` };
    }
    return { valid: true, type: "book" };
  }

  const suits = new Set(naturals.map((c) => c.suit));
  if (suits.size === 1 && !naturals.some((c) => c.suit === "joker")) {
    const size = cards.length;
    if (size < requirement.runSize) {
      return { valid: false, reason: `A run needs at least ${requirement.runSize} cards.` };
    }

    // Every natural has one possible run position, except an Ace, which has
    // two (low or high — see RUN_ORDER). Try every combination of Ace
    // placements, and every valid window start for that combination, to find
    // one with no two wild-filled slots in a row. This is what allows
    // A-2-3-4 and J-Q-K-A while still rejecting Q-K-A-2 (the two Ace slots
    // are too far apart to ever land in the same window) and a run like
    // 6-7-_-_ (two wilds back to back).
    const options = naturals.map((c) => rankPositions(c.rank));
    function tryAssign(i: number, chosen: number[]): { positions: number[]; start: number } | null {
      if (i === options.length) {
        if (new Set(chosen).size !== chosen.length) return null;
        const minPos = Math.min(...chosen);
        const maxPos = Math.max(...chosen);
        const lowStart = Math.max(0, maxPos - size + 1);
        const highStart = Math.min(minPos, RUN_ORDER.length - size);
        const filled = new Set(chosen);
        for (let start = lowStart; start <= highStart; start++) {
          let hasConsecutiveGaps = false;
          for (let k = start; k < start + size - 1; k++) {
            if (!filled.has(k) && !filled.has(k + 1)) {
              hasConsecutiveGaps = true;
              break;
            }
          }
          if (!hasConsecutiveGaps) return { positions: chosen, start };
        }
        return null;
      }
      for (const pos of options[i]) {
        const result = tryAssign(i + 1, [...chosen, pos]);
        if (result) return result;
      }
      return null;
    }
    const assignment = tryAssign(0, []);
    if (!assignment) {
      return {
        valid: false,
        reason:
          "These cards aren't close enough together to form a run, or would need two wild cards in a row.",
      };
    }

    // Arrange the full window in sorted position order: naturals at their
    // resolved position, wilds filling whatever gaps remain (assignment
    // order among wilds doesn't matter — they're interchangeable).
    const naturalByPos = new Map(assignment.positions.map((pos, i) => [pos, naturals[i]]));
    const wildQueue = [...wilds];
    const orderedCards: Card[] = [];
    for (let i = assignment.start; i < assignment.start + size; i++) {
      orderedCards.push(naturalByPos.get(i) ?? wildQueue.shift()!);
    }

    return { valid: true, type: "run", runStartIndex: assignment.start, orderedCards };
  }

  return {
    valid: false,
    reason: "These cards don't share a rank (for a book) or a suit in sequence (for a run).",
  };
}

/** Cards from hand not used in the given melds. */
export function leftoverAfterMelds(hand: Card[], melds: Meld[]): Card[] {
  const used = new Set(melds.flatMap((m) => m.cards.map((c) => c.id)));
  return hand.filter((c) => !used.has(c.id));
}

/**
 * Which end(s) of a meld a card could legally lay off onto. Books have no
 * direction — a single-element array means "yes", empty means "no". Runs
 * return "low"/"high" for whichever end(s) the card's rank fits (a natural
 * card fits at most one end; a wild fits either end that still has room to
 * extend, which is genuinely ambiguous and the caller must ask the player).
 *
 * A 2 is dual-purpose (see validateManualGroup): laying one onto a run
 * checks both whether it fits its own natural "2" slot *and* whether it
 * fits as a generic wild, and returns the union — a 2 isn't restricted to
 * only the interpretation that happens to come first.
 *
 * A run can never end up with two wild-*acting* cards in a row — the same
 * rule validateClassifiedGroup already enforces when a meld is first built
 * (its hasConsecutiveGaps check). Laying off has to enforce it too: a wild
 * card can extend an end only if the card currently there isn't itself
 * standing in as a wild. A natural card (including a 2 sitting in its own
 * "2" slot) is never "wild" for this purpose, so it's always fine next to
 * either a natural or a wild.
 */
export function layOffOptions(card: Card, meld: Meld): ("low" | "high")[] {
  if (meld.type === "book") {
    if (card.isWild) return ["low"];
    const bookRank = meld.cards.find((c) => !c.isWild)?.rank;
    return bookRank === card.rank ? ["low"] : [];
  }

  if (meld.runStartIndex === undefined) return [];
  const start = meld.runStartIndex;
  const end = start + meld.cards.length - 1;
  const lowOpen = start > 0;
  const highOpen = end < RUN_ORDER.length - 1;
  const opts = new Set<"low" | "high">();

  const isActingWild = (positionInMeld: number) => {
    const c = meld.cards[positionInMeld];
    if (!c.isWild) return false;
    if (c.rank !== "2") return true; // Joker: always wild, no natural run slot
    return runCardRank(meld, positionInMeld) !== "2";
  };
  const lowEndIsWild = isActingWild(0);
  const highEndIsWild = isActingWild(meld.cards.length - 1);

  if (!card.isWild || card.rank === "2") {
    const suit = meld.cards.find((c) => !c.isWild)?.suit;
    if (card.suit === suit) {
      const positions = rankPositions(card.rank);
      if (lowOpen && positions.includes(start - 1)) opts.add("low");
      if (highOpen && positions.includes(end + 1)) opts.add("high");
    }
  }

  if (card.isWild) {
    if (lowOpen && !lowEndIsWild) opts.add("low");
    if (highOpen && !highEndIsWild) opts.add("high");
  }

  return [...opts];
}

/**
 * Lay-off check: can this single card extend an existing meld at all (either
 * end, for a run)? For the actual direction — needed to keep a run's cards
 * in sorted order and to know what a wild is standing in for — see
 * layOffOptions.
 */
export function canLayOff(card: Card, meld: Meld): boolean {
  return layOffOptions(card, meld).length > 0;
}
