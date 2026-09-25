// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Card } from "@/types";
import { applyHandOrder, compareByRank, mergeVisibleOrder } from "./handSort";

const c = (id: string, rank: Card["rank"], suit: Card["suit"] = "hearts"): Card => ({ id, rank, suit, isWild: rank === "2" });

describe("mergeVisibleOrder", () => {
  it("keeps hidden cards in their slots while the visible ones reorder", () => {
    // b is staged (hidden). The visible cards a, c, d get reordered to d, a, c.
    expect(mergeVisibleOrder(["a", "b", "c", "d"], ["d", "a", "c"])).toEqual(["d", "b", "a", "c"]);
  });

  it("makes an unstaged card return to its old spot after a sort", () => {
    const hand = [c("a", "9"), c("b", "3"), c("c", "K"), c("d", "5")];
    // Sort whole hand by rank while `b` is staged: full order is the sort of everything.
    const full = [...hand].sort(compareByRank).map((x) => x.id); // b(3) d(5) a(9) c(K)
    const visible = hand.filter((x) => x.id !== "b");
    expect(applyHandOrder(visible, full).map((x) => x.id)).toEqual(["d", "a", "c"]);
    // Unstage b: it lands in its sorted slot, not at its server position.
    expect(applyHandOrder(hand, full).map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
  });
});
