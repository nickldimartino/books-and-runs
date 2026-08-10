import { Card, ContractRequirement, Meld, Rank } from "./types";

// Order used for runs. "2" only appears here as a slot that must be filled by
// a wild, since natural 2s are wild cards, not literal rank-2 cards.
//
// Ace gets two slots: low (index 0, before 2) and high (index 13, after K) —
// so a run can go A-2-3-4 or J-Q-K-A. The two Ace slots are 13 apart, farther
// than any run window, so one run can use one slot or the other but never
// both at once — that's what stops a run from wrapping Q-K-A-2.
const RUN_ORDER: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** Positions a card's rank can occupy in a run window. Every rank has
 * exactly one, except Ace, which can sit at either end (see RUN_ORDER). */
function rankPositions(rank: Rank): number[] {
  if (rank === "A") return [0, RUN_ORDER.length - 1];
  const idx = RUN_ORDER.indexOf(rank);
  return idx === -1 ? [] : [idx];
}

export interface Candidate {
  type: "book" | "run";
  key: string; // rank for books, "suit:startIndex" for runs
  naturalCards: Card[];
  wildsNeeded: number;
}

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
      let wildsNeeded = 0;
      for (let i = start; i < start + runSize; i++) {
        const card = rankMap.get(i);
        if (card) naturalCards.push(card);
        else wildsNeeded++;
      }
      // require at least one natural card so we're not building a meld out of thin air
      if (naturalCards.length > 0) {
        candidates.push({ type: "run", key: `run:${suit}:${start}`, naturalCards, wildsNeeded });
      }
    }
  }
  return candidates;
}

/**
 * Attempts to find a set of melds satisfying the round's full contract from
 * the given hand, using backtracking over candidate books/runs. Prefers
 * solutions that use fewer wild cards. Returns null if the contract cannot
 * currently be met.
 */
export function solveContract(
  hand: Card[],
  requirement: ContractRequirement,
  ownerId: string
): Meld[] | null {
  const { wilds, naturals } = splitWildsAndNaturals(hand);

  const bookCands = bookCandidates(naturals, requirement.bookSize).filter(
    (c) => c.wildsNeeded <= wilds.length
  );
  const runCands = runCandidates(naturals, requirement.runSize).filter(
    (c) => c.wildsNeeded <= wilds.length
  );

  // search books first, then runs, preferring low-wild candidates
  const sortedBooks = [...bookCands].sort((a, b) => a.wildsNeeded - b.wildsNeeded);
  const sortedRuns = [...runCands].sort((a, b) => a.wildsNeeded - b.wildsNeeded);

  const usedCardIds = new Set<string>();
  const chosen: Candidate[] = [];

  function tryPick(pool: Candidate[], countNeeded: number, startFrom: number): boolean {
    if (countNeeded === 0) return true;
    for (let i = startFrom; i < pool.length; i++) {
      const cand = pool[i];
      if (cand.naturalCards.some((c) => usedCardIds.has(c.id))) continue;
      const wildsUsedSoFar = chosen.reduce((sum, c) => sum + c.wildsNeeded, 0);
      if (wildsUsedSoFar + cand.wildsNeeded > wilds.length) continue;

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

  // build final Meld objects, assigning wild cards to fill shortfalls
  const wildPool = [...wilds];
  const melds: Meld[] = chosen.map((cand, idx) => {
    const wildsForThis = wildPool.splice(0, cand.wildsNeeded);
    const runStartIndex =
      cand.type === "run" ? Number(cand.key.split(":")[2]) : undefined;
    return {
      id: `${ownerId}-meld-${idx}-${cand.key}`,
      type: cand.type,
      ownerId,
      cards: [...cand.naturalCards, ...wildsForThis],
      runStartIndex,
    };
  });

  return melds;
}

export interface GroupValidation {
  valid: boolean;
  type?: "book" | "run";
  runStartIndex?: number;
  reason?: string;
}

/**
 * Validates a player-chosen set of cards as a single book or run meld,
 * using the same wild-substitution rules as the automatic solver — this
 * just checks a specific selection instead of searching the hand for one,
 * so a player can build their own melds by hand instead of the engine
 * choosing for them.
 */
export function validateManualGroup(cards: Card[], requirement: ContractRequirement): GroupValidation {
  const { naturals } = splitWildsAndNaturals(cards);

  if (naturals.length === 0) {
    return { valid: false, reason: "Include at least one non-wild card." };
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
    // placements for a non-repeating window; this is what allows A-2-3-4 and
    // J-Q-K-A while still rejecting Q-K-A-2 (the two Ace slots are too far
    // apart to ever land in the same window).
    const options = naturals.map((c) => rankPositions(c.rank));
    function tryAssign(i: number, chosen: number[]): number[] | null {
      if (i === options.length) {
        if (new Set(chosen).size !== chosen.length) return null;
        const minPos = Math.min(...chosen);
        const maxPos = Math.max(...chosen);
        const lowStart = Math.max(0, maxPos - size + 1);
        const highStart = Math.min(minPos, RUN_ORDER.length - size);
        return lowStart <= highStart ? chosen : null;
      }
      for (const pos of options[i]) {
        const result = tryAssign(i + 1, [...chosen, pos]);
        if (result) return result;
      }
      return null;
    }
    const positions = tryAssign(0, []);
    if (!positions) {
      return { valid: false, reason: "These cards aren't close enough together to form a run." };
    }

    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);
    const lowStart = Math.max(0, maxPos - size + 1);
    return { valid: true, type: "run", runStartIndex: lowStart };
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
 * Lay-off check: can this single card extend an existing meld?
 * Books: any card matching the book's rank, or a wild.
 * Runs: a card extending either end of the sequence (or a wild used as the next slot).
 */
export function canLayOff(card: Card, meld: Meld): boolean {
  if (card.isWild) return true; // simplification: wilds can extend any meld
  if (meld.type === "book") {
    const bookRank = meld.cards.find((c) => !c.isWild)?.rank;
    return bookRank === card.rank;
  }
  // run: check suit matches and rank is immediately before or after the occupied range
  const suit = meld.cards.find((c) => !c.isWild)?.suit;
  if (card.suit !== suit) return false;
  if (meld.runStartIndex === undefined) return false;
  const start = meld.runStartIndex;
  const end = start + meld.cards.length - 1;
  return rankPositions(card.rank).some((idx) => idx === start - 1 || idx === end + 1);
}
