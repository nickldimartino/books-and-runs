// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  fetchMyEntitlements,
  invalidateEntitlementsCache,
  pollForEntitlements,
  useEntitlements,
} from "./entitlementsStore";

function fakeSupabase(skusSequence: string[][]) {
  let call = 0;
  const rpc = vi.fn(async () => {
    const skus = skusSequence[Math.min(call, skusSequence.length - 1)];
    call++;
    return { data: skus, error: null };
  });
  return { client: { rpc } as never, rpc };
}

describe("fetchMyEntitlements", () => {
  it("returns [] for a signed-out visitor without calling the RPC", async () => {
    const { client, rpc } = fakeSupabase([["badge:🎩"]]);
    await expect(fetchMyEntitlements(client, null)).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls my_entitlements() and caches the result per user", async () => {
    const { client, rpc } = fakeSupabase([["badge:🎩", "bundle:supporter"]]);
    const first = await fetchMyEntitlements(client, "u1");
    const second = await fetchMyEntitlements(client, "u1");
    expect(first).toEqual(["badge:🎩", "bundle:supporter"]);
    expect(second).toEqual(first);
    expect(rpc).toHaveBeenCalledTimes(1); // second call served from cache
    expect(rpc).toHaveBeenCalledWith("my_entitlements");
  });

  it("force bypasses the cache", async () => {
    const { client, rpc } = fakeSupabase([["a"], ["a", "b"]]);
    await fetchMyEntitlements(client, "u2");
    const forced = await fetchMyEntitlements(client, "u2", { force: true });
    expect(forced).toEqual(["a", "b"]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("invalidateEntitlementsCache drops the cached list for that user", async () => {
    const { client, rpc } = fakeSupabase([["a"], ["a", "b"]]);
    await fetchMyEntitlements(client, "u3");
    invalidateEntitlementsCache("u3");
    const after = await fetchMyEntitlements(client, "u3");
    expect(after).toEqual(["a", "b"]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("throws when the RPC errors", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: new Error("boom") })) } as never;
    await expect(fetchMyEntitlements(client, "u4")).rejects.toThrow("boom");
  });
});

describe("useEntitlements", () => {
  beforeEach(() => {
    invalidateEntitlementsCache("hook-user");
  });

  it("loads owned skus for the signed-in user", async () => {
    const { client } = fakeSupabase([["card_back:aurora"]]);
    const { result } = renderHook(() => useEntitlements(client, "hook-user"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ownedSkus.has("card_back:aurora")).toBe(true);
  });

  it("reads as an empty set for a signed-out visitor", async () => {
    const { result } = renderHook(() => useEntitlements(null, null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ownedSkus.size).toBe(0);
  });

  it("refresh({ force: true }) re-fetches and updates ownedSkus", async () => {
    const { client } = fakeSupabase([[], ["badge:🎩"]]);
    const { result } = renderHook(() => useEntitlements(client, "hook-user"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ownedSkus.size).toBe(0);

    await act(async () => {
      await result.current.refresh({ force: true });
    });
    expect(result.current.ownedSkus.has("badge:🎩")).toBe(true);
  });
});

describe("pollForEntitlements", () => {
  it("stops early once shouldStop is satisfied, without waiting out every delay", async () => {
    const { client, rpc } = fakeSupabase([["badge:🎩"]]);
    const updates: string[][] = [];
    const { resolvedEarly, skus } = await pollForEntitlements(client, "u5", {
      shouldStop: (s) => s.includes("badge:🎩"),
      onUpdate: (s) => updates.push(s),
    });
    expect(resolvedEarly).toBe(true);
    expect(skus).toEqual(["badge:🎩"]);
    expect(rpc).toHaveBeenCalledTimes(1); // resolved on the first (immediate) check
    expect(updates).toEqual([["badge:🎩"]]);
  });

  it("reports not resolved when shouldStop never passes (still processing), and gives up within ~10s", async () => {
    vi.useFakeTimers();
    try {
      const { client, rpc } = fakeSupabase([[]]);
      const resultPromise = pollForEntitlements(client, "u6", {
        shouldStop: (s) => s.includes("never-owned"),
      });
      await vi.advanceTimersByTimeAsync(11000);
      const { resolvedEarly } = await resultPromise;
      expect(resolvedEarly).toBe(false);
      expect(rpc).toHaveBeenCalledTimes(6); // 1 immediate + 5 backoff retries
    } finally {
      vi.useRealTimers();
    }
  });
});
