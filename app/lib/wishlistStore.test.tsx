// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { addToWishlist, fetchMyWishlist, removeFromWishlist, useWishlist } from "./wishlistStore";

/** A minimal stand-in for the query-builder chain wishlistStore.ts uses:
 * .from(...).select(...).eq(...) resolves; .upsert(...) and
 * .delete().eq().eq() resolve too. Each call is recorded on `calls`. */
function fakeSupabase(rows: { sku: string }[], opts?: { selectError?: Error; writeError?: Error }) {
  const calls: { op: string; args: unknown[] }[] = [];
  function chain(op: string, terminal: () => { data: unknown; error: Error | null }) {
    const obj: Record<string, unknown> = {
      eq: (...args: unknown[]) => {
        calls.push({ op: `${op}.eq`, args });
        return obj;
      },
      then: (resolve: (v: { data: unknown; error: Error | null }) => void) => resolve(terminal()),
    };
    return obj;
  }
  const client = {
    from: (table: string) => {
      calls.push({ op: `from`, args: [table] });
      return {
        select: () => {
          calls.push({ op: "select", args: [] });
          return chain("select", () => ({ data: opts?.selectError ? null : rows, error: opts?.selectError ?? null }));
        },
        upsert: (row: unknown) => {
          calls.push({ op: "upsert", args: [row] });
          return Promise.resolve({ data: null, error: opts?.writeError ?? null });
        },
        delete: () => {
          calls.push({ op: "delete", args: [] });
          return chain("delete", () => ({ data: null, error: opts?.writeError ?? null }));
        },
      };
    },
  };
  return { client: client as never, calls };
}

describe("fetchMyWishlist", () => {
  it("returns [] for a signed-out visitor without querying", async () => {
    const { client, calls } = fakeSupabase([{ sku: "badge:🎩" }]);
    await expect(fetchMyWishlist(client, null)).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("returns the account's saved skus", async () => {
    const { client } = fakeSupabase([{ sku: "card_back:aurora" }, { sku: "theme:frost" }]);
    await expect(fetchMyWishlist(client, "u1")).resolves.toEqual(["card_back:aurora", "theme:frost"]);
  });

  it("throws when the query errors", async () => {
    const { client } = fakeSupabase([], { selectError: new Error("boom") });
    await expect(fetchMyWishlist(client, "u1")).rejects.toThrow("boom");
  });
});

describe("addToWishlist / removeFromWishlist", () => {
  it("upserts the row on add", async () => {
    const { client, calls } = fakeSupabase([]);
    await addToWishlist(client, "u1", "badge:🎩");
    expect(calls.some((c) => c.op === "upsert" && (c.args[0] as { sku: string }).sku === "badge:🎩")).toBe(true);
  });

  it("deletes the row on remove", async () => {
    const { client, calls } = fakeSupabase([]);
    await removeFromWishlist(client, "u1", "badge:🎩");
    expect(calls.some((c) => c.op === "delete")).toBe(true);
  });
});

describe("useWishlist", () => {
  it("loads the saved wishlist for the signed-in user", async () => {
    const { client } = fakeSupabase([{ sku: "theme:frost" }]);
    const { result } = renderHook(() => useWishlist(client, "u1"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.wishlistSkus.has("theme:frost")).toBe(true);
  });

  it("reads as an empty set for a signed-out visitor", async () => {
    const { result } = renderHook(() => useWishlist(null, null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.wishlistSkus.size).toBe(0);
  });

  it("toggle adds optimistically and keeps it on success", async () => {
    const { client } = fakeSupabase([]);
    const { result } = renderHook(() => useWishlist(client, "u1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle("badge:🎩");
    });
    expect(result.current.wishlistSkus.has("badge:🎩")).toBe(true);
  });

  it("toggle removes an already-wishlisted sku", async () => {
    const { client } = fakeSupabase([{ sku: "badge:🎩" }]);
    const { result } = renderHook(() => useWishlist(client, "u1"));
    await waitFor(() => expect(result.current.wishlistSkus.has("badge:🎩")).toBe(true));

    await act(async () => {
      await result.current.toggle("badge:🎩");
    });
    expect(result.current.wishlistSkus.has("badge:🎩")).toBe(false);
  });

  it("reverts the optimistic add when the write fails", async () => {
    const { client } = fakeSupabase([], { writeError: new Error("network") });
    const { result } = renderHook(() => useWishlist(client, "u1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle("badge:🎩");
    });
    expect(result.current.wishlistSkus.has("badge:🎩")).toBe(false);
  });
});
