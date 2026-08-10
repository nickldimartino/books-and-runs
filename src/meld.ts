import { Card, ContractRequirement, Meld, Rank } from "./types";

// Order used for runs. "2" only appears here as a slot that must be filled by
// a wild, since natural 2s are wild cards, not literal rank-2 cards.
const RUN_ORDER: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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
    const idx = RUN_ORDER.indexOf(c.rank);
    if (idx === -1) continue;
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, new Map());
    // if two identical cards exist (multi-deck), keep the first; the other
    // becomes a candidate for a different window/meld
    if (!bySuit.get(c.suit)!.has(idx)) bySuit.get(c.suit)!.set(idx, c);
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
  const cardIdx = RUN_ORDER.indexOf(card.rank);
  return cardIdx === start - 1 || cardIdx === end + 1;
}
