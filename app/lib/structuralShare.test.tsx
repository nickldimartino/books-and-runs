import { describe, expect, it } from "vitest";
import { shareStructure } from "./structuralShare";

describe("shareStructure", () => {
  it("returns the previous reference when deeply equal", () => {
    const prev = { hand: [{ id: "a" }, { id: "b" }], n: 1 };
    const next = JSON.parse(JSON.stringify(prev));
    expect(shareStructure(prev, next)).toBe(prev);
  });

  it("keeps unchanged subtrees when something else changed", () => {
    const prev = { hand: [{ id: "a" }, { id: "b" }], pile: [{ id: "x" }], n: 1 };
    const next = { hand: [{ id: "a" }, { id: "b" }], pile: [{ id: "x" }, { id: "y" }], n: 1 };
    const out = shareStructure(prev, next);
    expect(out).not.toBe(prev);
    expect(out.hand).toBe(prev.hand);
    expect(out.pile[0]).toBe(prev.pile[0]);
    expect(out.pile).toHaveLength(2);
  });

  it("reflects removed/added keys and length changes", () => {
    expect(shareStructure({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(shareStructure({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
    expect(shareStructure([1, 2, 3], [1, 2])).toEqual([1, 2]);
  });

  it("handles null / type changes", () => {
    expect(shareStructure(null, { a: 1 })).toEqual({ a: 1 });
    expect(shareStructure({ a: 1 }, null)).toBeNull();
    expect(shareStructure([1], { a: 1 })).toEqual({ a: 1 });
  });
});
