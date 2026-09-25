import { describe, expect, it } from "vitest";
import { contractProgress } from "./contractProgress";
import { CONTRACTS, type Card } from "@/types";

let n = 0;
const c = (rank: string, suit: Card["suit"], wild = false): Card =>
  ({ id: `t${n++}`, rank, suit, isWild: wild }) as Card;

describe("contractProgress", () => {
  it("counts complete books and finds the closest partial one", () => {
    const hand = [c("9", "hearts"), c("9", "clubs"), c("9", "spades"), c("5", "hearts"), c("5", "clubs"), c("K", "clubs")];
    const p = contractProgress(hand, CONTRACTS[0]); // 2 books
    expect(p.booksNeeded).toBe(2);
    expect(p.booksReady).toBe(1);
    expect(p.nextBook).toEqual({ rank: "5", have: 2, need: 3 });
    expect(p.hintCardIds.size).toBe(5);
  });

  it("lets a wild complete a pair into a book", () => {
    const hand = [c("7", "hearts"), c("7", "clubs"), c("2", "spades", true)];
    const p = contractProgress(hand, CONTRACTS[5]); // 3 books
    expect(p.booksReady).toBe(1);
  });

  it("finds the closest run", () => {
    const hand = [c("5", "hearts"), c("6", "hearts"), c("8", "hearts"), c("K", "clubs")];
    const p = contractProgress(hand, CONTRACTS[2]); // 2 runs, no wilds
    expect(p.runsReady).toBe(0);
    expect(p.nextRun).toMatchObject({ suit: "hearts", have: 3, need: 4 });
  });

  it("reports a ready run when a wild fills the gap", () => {
    const hand = [c("5", "hearts"), c("6", "hearts"), c("8", "hearts"), c("2", "clubs", true)];
    expect(contractProgress(hand, CONTRACTS[2]).runsReady).toBe(1);
  });
});
