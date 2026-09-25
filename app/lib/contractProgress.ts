// "How close is my hand to this round's contract?" — the Show legal moves
// assist's progress line ("Book of 9s: 2 of 3") and the soft highlight on the
// cards that contribute. A quick greedy estimate for display only: it never
// decides a move (the real solver is src/meld.ts's solveContract, and every
// meld is re-validated by the engine), so it may occasionally be a card off
// where two melds compete for the same card — it errs toward optimistic.

import { rankPositions, RUN_ORDER } from "@/meld";
import type { Card, ContractRequirement } from "@/types";

export interface ContractProgress {
  booksNeeded: number;
  runsNeeded: number;
  /** Books / runs the hand could lay down right now (capped at what's needed). */
  booksReady: number;
  runsReady: number;
  /** The closest not-yet-complete book, if any is still needed. */
  nextBook: { rank: string; have: number; need: number } | null;
  /** The closest not-yet-complete run, if any is still needed. */
  nextRun: { suit: string; have: number; need: number } | null;
  /** Natural cards in the ready melds and in the closest partial ones. */
  hintCardIds: Set<string>;
}

export function contractProgress(hand: Card[], req: ContractRequirement): ContractProgress {
  const wilds = hand.filter((c) => c.isWild);
  const naturals = hand.filter((c) => !c.isWild && c.suit !== "joker");
  let budget = wilds.length;
  const hint = new Set<string>();

  // ----- books: same rank -----
  const byRank = new Map<string, Card[]>();
  for (const c of naturals) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  const rankGroups = [...byRank.entries()].sort((a, b) => b[1].length - a[1].length);
  let booksReady = 0;
  let nextBook: ContractProgress["nextBook"] = null;
  for (const [rank, cards] of rankGroups) {
    if (req.books === 0) break;
    const missing = Math.max(0, req.bookSize - cards.length);
    const canFill = missing <= Math.min(budget, cards.length);
    if (booksReady < req.books && canFill) {
      booksReady++;
      budget -= missing;
      cards.forEach((c) => hint.add(c.id));
    } else if (booksReady < req.books && !nextBook && cards.length >= 1) {
      nextBook = { rank, have: Math.min(req.bookSize, cards.length + Math.min(budget, cards.length)), need: req.bookSize };
      cards.forEach((c) => hint.add(c.id));
    }
  }

  // ----- runs: same suit, consecutive ranks -----
  const bySuit = new Map<string, Map<number, Card>>();
  for (const c of naturals) {
    const m = bySuit.get(c.suit) ?? new Map<number, Card>();
    for (const p of rankPositions(c.rank)) if (!m.has(p)) m.set(p, c);
    bySuit.set(c.suit, m);
  }
  interface Window {
    suit: string;
    filled: number;
    cards: Card[];
    hasDoubleGap: boolean;
  }
  const best: Window[] = [];
  for (const [suit, positions] of bySuit) {
    let top: Window | null = null;
    for (let start = 0; start + req.runSize <= RUN_ORDER.length; start++) {
      const cards: Card[] = [];
      let doubleGap = false;
      for (let i = start; i < start + req.runSize; i++) {
        const c = positions.get(i);
        if (c) cards.push(c);
        else if (i > start && !positions.get(i - 1)) doubleGap = true;
      }
      const w: Window = { suit, filled: new Set(cards.map((c) => c.id)).size, cards, hasDoubleGap: doubleGap };
      if (!top || w.filled > top.filled) top = w;
    }
    if (top && top.filled > 0) best.push(top);
  }
  best.sort((a, b) => b.filled - a.filled);
  let runsReady = 0;
  let nextRun: ContractProgress["nextRun"] = null;
  for (const w of best) {
    if (req.runs === 0) break;
    const missing = req.runSize - w.filled;
    const canFill = missing <= Math.min(budget, w.filled) && !w.hasDoubleGap;
    if (runsReady < req.runs && canFill) {
      runsReady++;
      budget -= missing;
      w.cards.forEach((c) => hint.add(c.id));
    } else if (runsReady < req.runs && !nextRun && w.filled >= 2) {
      nextRun = { suit: w.suit, have: Math.min(req.runSize, w.filled + Math.min(budget, w.filled)), need: req.runSize };
      w.cards.forEach((c) => hint.add(c.id));
    }
  }

  return {
    booksNeeded: req.books,
    runsNeeded: req.runs,
    booksReady: Math.min(booksReady, req.books),
    runsReady: Math.min(runsReady, req.runs),
    nextBook,
    nextRun,
    hintCardIds: hint,
  };
}
