// @vitest-environment jsdom

// Covers the bio functions added in migration 0021 — sanitization (via what
// actually gets upserted), read/write for the signed-in account's own bio,
// and the bulk multi-user lookup used to show an opponent's bio in
// OpponentStrip's popover. Exercised against a small chainable fake
// SupabaseClient rather than a real one.

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBiosFor, fetchOwnBio, MAX_BIO_LENGTH, updateLeaderboardBio } from "./leaderboardStore";

function fakeSupabase(overrides: {
  upsert?: (payload: unknown) => { error: null | { message: string } };
  selectSingle?: unknown;
  selectMany?: unknown[];
}) {
  const upsert = vi.fn(overrides.upsert ?? (() => ({ error: null })));
  const from = vi.fn(() => ({
    upsert,
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: overrides.selectSingle ?? null, error: null })),
      })),
      in: vi.fn(async () => ({ data: overrides.selectMany ?? [], error: null })),
    })),
  }));
  return { client: { from } as unknown as SupabaseClient, upsert };
}

describe("updateLeaderboardBio", () => {
  it("trims and stores a normal bio", async () => {
    const { client, upsert } = fakeSupabase({});
    await updateLeaderboardBio(client, "u1", "  Loves a good run.  ");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", bio: "Loves a good run." })
    );
  });

  it("truncates to MAX_BIO_LENGTH", async () => {
    const { client, upsert } = fakeSupabase({});
    const long = "x".repeat(MAX_BIO_LENGTH + 50);
    await updateLeaderboardBio(client, "u1", long);
    const sentBio = (upsert.mock.calls[0][0] as { bio: string }).bio;
    expect(sentBio).toHaveLength(MAX_BIO_LENGTH);
  });

  it("strips control characters (e.g. newlines/tabs)", async () => {
    const { client, upsert } = fakeSupabase({});
    await updateLeaderboardBio(client, "u1", "Line one\nLine\ttwo");
    expect((upsert.mock.calls[0][0] as { bio: string }).bio).toBe("Line oneLinetwo");
  });

  it("stores null for an empty or whitespace-only bio (clears it)", async () => {
    const { client, upsert } = fakeSupabase({});
    await updateLeaderboardBio(client, "u1", "   ");
    expect((upsert.mock.calls[0][0] as { bio: string | null }).bio).toBeNull();
  });

  it("propagates a Supabase error", async () => {
    const { client } = fakeSupabase({ upsert: () => ({ error: { message: "nope" } }) });
    await expect(updateLeaderboardBio(client, "u1", "hi")).rejects.toEqual({ message: "nope" });
  });
});

describe("fetchOwnBio", () => {
  it("returns the trimmed bio when set", async () => {
    const { client } = fakeSupabase({ selectSingle: { bio: "  Card shark.  " } });
    expect(await fetchOwnBio(client, "u1")).toBe("Card shark.");
  });

  it("returns null when no row or no bio set", async () => {
    const { client } = fakeSupabase({ selectSingle: null });
    expect(await fetchOwnBio(client, "u1")).toBeNull();
  });
});

describe("fetchBiosFor", () => {
  it("returns a map keyed by user_id, skipping empty bios", async () => {
    const { client } = fakeSupabase({
      selectMany: [
        { user_id: "u1", bio: "Plays every Sunday." },
        { user_id: "u2", bio: null },
        { user_id: "u3", bio: "   " },
      ],
    });
    expect(await fetchBiosFor(client, ["u1", "u2", "u3"])).toEqual({ u1: "Plays every Sunday." });
  });

  it("short-circuits to {} for an empty id list without querying", async () => {
    const { client, upsert: _unused } = fakeSupabase({});
    const from = client.from as ReturnType<typeof vi.fn>;
    expect(await fetchBiosFor(client, [])).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });
});
