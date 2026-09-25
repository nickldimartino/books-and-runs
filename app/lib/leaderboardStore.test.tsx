// @vitest-environment jsdom

// Covers the bio functions added in migration 0021 — sanitization (via what
// actually gets upserted), read/write for the signed-in account's own bio,
// and the bulk multi-user lookup used to show an opponent's bio in
// OpponentStrip's popover. Exercised against a small chainable fake
// SupabaseClient rather than a real one.

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchBiosFor,
  fetchDisplayNamesFor,
  fetchOwnBio,
  MAX_BIO_LENGTH,
  pullDailyDealStreak,
  pullWeeklyChallengeStreak,
  updateLeaderboardBio,
} from "./leaderboardStore";

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

describe("fetchDisplayNamesFor", () => {
  it("returns a name for every requested id — the account's own name when set, a generated placeholder otherwise", async () => {
    // displayNameFor's placeholder is derived from the id's own trailing hex
    // digits, so these need to actually look like real UUIDs (fetchBiosFor's
    // "u1"/"u2" shorthand above doesn't parse as hex) for the fallback to
    // come out as "Player <number>" instead of "Player NaN".
    const named = "11111111-1111-1111-1111-111111111111";
    const unnamed = "22222222-2222-2222-2222-222222222222";
    const missing = "33333333-3333-3333-3333-333333333333";
    const { client } = fakeSupabase({
      selectMany: [
        { user_id: named, display_name: "Nick" },
        { user_id: unnamed, display_name: null },
      ],
    });
    // `missing` isn't in the query result at all (no leaderboard_entries
    // row) — every multiplayer seat still needs *some* name shown regardless.
    const names = await fetchDisplayNamesFor(client, [named, unnamed, missing]);
    expect(names[named]).toBe("Nick");
    expect(names[unnamed]).toMatch(/^Player \d+$/);
    expect(names[missing]).toMatch(/^Player \d+$/);
  });

  it("short-circuits to {} for an empty id list without querying", async () => {
    const { client } = fakeSupabase({});
    const from = client.from as ReturnType<typeof vi.fn>;
    expect(await fetchDisplayNamesFor(client, [])).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });
});

// A fake with a leaderboard row plus a completions table, for the streak pulls.
function streakSupabase(row: Record<string, unknown> | null, table: string, completions: Record<string, string>[] | "error") {
  const from = vi.fn((name: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() =>
        name === "leaderboard_entries"
          ? { maybeSingle: vi.fn(async () => ({ data: row, error: null })) }
          : {
              order: vi.fn(() => ({
                limit: vi.fn(async () =>
                  name === table && completions !== "error"
                    ? { data: completions, error: null }
                    : { data: null, error: { message: "boom" } }
                ),
              })),
            }
      ),
    })),
  }));
  return { from } as unknown as SupabaseClient;
}

describe("pullDailyDealStreak (completions are the ground truth)", () => {
  const staleRow = { daily_deal_streak: 0, daily_deal_best_streak: 0, daily_deal_last_played: null };

  it("reports today as played from daily_deal_completions even when the leaderboard row lags (the reported bug)", async () => {
    const client = streakSupabase(staleRow, "daily_deal_completions", [{ date: "2026-09-25" }, { date: "2026-09-24" }, { date: "2026-09-22" }]);
    expect(await pullDailyDealStreak(client, "u1")).toMatchObject({ streak: 2, bestStreak: 2, lastPlayedDate: "2026-09-25" });
  });

  it("works with no leaderboard row at all", async () => {
    const client = streakSupabase(null, "daily_deal_completions", [{ date: "2026-09-25" }]);
    expect(await pullDailyDealStreak(client, "u1")).toMatchObject({ streak: 1, bestStreak: 1, lastPlayedDate: "2026-09-25" });
  });

  it("keeps the row when it is newer than the completions, and falls back to it on a read error", async () => {
    const row = { daily_deal_streak: 5, daily_deal_best_streak: 9, daily_deal_last_played: "2026-09-25" };
    expect(await pullDailyDealStreak(streakSupabase(row, "daily_deal_completions", [{ date: "2026-09-20" }]), "u1")).toMatchObject({
      streak: 5, bestStreak: 9, lastPlayedDate: "2026-09-25",
    });
    expect(await pullDailyDealStreak(streakSupabase(row, "daily_deal_completions", "error"), "u1")).toMatchObject({
      streak: 5, bestStreak: 9, lastPlayedDate: "2026-09-25",
    });
  });
});

describe("pullWeeklyChallengeStreak (completions are the ground truth)", () => {
  it("derives the streak from weekly_challenge_completions when the row lags", async () => {
    const row = { weekly_challenge_streak: 0, weekly_challenge_best_streak: 0, weekly_challenge_last_played: null };
    const client = streakSupabase(row, "weekly_challenge_completions", [{ week: "2026-W39" }, { week: "2026-W38" }]);
    expect(await pullWeeklyChallengeStreak(client, "u1")).toMatchObject({ streak: 2, bestStreak: 2, lastPlayedWeek: "2026-W39" });
  });
});

describe("streak shields in the cloud pulls (migration 0081)", () => {
  const dayKeys = (from: number, len: number) =>
    Array.from({ length: len }, (_, i) => ({ date: `2026-09-${String(from + i).padStart(2, "0")}` }));

  it("derives shields and covered days from the completion history", async () => {
    // Sept 1-7 played (shield earned), 8 missed, 9-10 played -> covered 8, streak 9.
    const rows = [...dayKeys(9, 2), ...dayKeys(1, 7)];
    const client = streakSupabase(null, "daily_deal_completions", rows.sort((a, b) => b.date.localeCompare(a.date)));
    expect(await pullDailyDealStreak(client, "u1")).toMatchObject({
      streak: 9,
      bestStreak: 9,
      lastPlayedDate: "2026-09-10",
      shields: 0,
      shieldsEarned: 1,
      covered: ["2026-09-08"],
    });
  });

  it("reads the shield columns off the row when the completions can't be read", async () => {
    const row = {
      daily_deal_streak: 9,
      daily_deal_best_streak: 9,
      daily_deal_last_played: "2026-09-10",
      daily_deal_shields: 1,
      daily_deal_shields_earned: 2,
      daily_deal_covered_days: ["2026-09-08"],
    };
    expect(await pullDailyDealStreak(streakSupabase(row, "daily_deal_completions", "error"), "u1")).toMatchObject({
      shields: 1,
      shieldsEarned: 2,
      covered: ["2026-09-08"],
    });
  });

  it("falls back to the original columns on a project that hasn't run 0081", async () => {
    const legacy = { daily_deal_streak: 4, daily_deal_best_streak: 6, daily_deal_last_played: "2026-09-10" };
    const selects: string[] = [];
    const from = vi.fn((name: string) => ({
      select: vi.fn((cols: string) => ({
        eq: vi.fn(() =>
          name === "leaderboard_entries"
            ? {
                maybeSingle: vi.fn(async () => {
                  selects.push(cols);
                  return cols.includes("shields")
                    ? { data: null, error: { message: "column does not exist" } }
                    : { data: legacy, error: null };
                }),
              }
            : { order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: null, error: { message: "boom" } })) })) }
        ),
      })),
    }));
    const result = await pullDailyDealStreak({ from } as unknown as SupabaseClient, "u1");
    expect(selects).toHaveLength(2);
    expect(result).toMatchObject({ streak: 4, bestStreak: 6, shields: 0, covered: [] });
  });

  it("weekly: derives a covered week and holds at most one shield", async () => {
    const weeks = ["2026-W40", "2026-W38", "2026-W37", "2026-W36", "2026-W35"].map((week) => ({ week }));
    const client = streakSupabase(null, "weekly_challenge_completions", weeks);
    expect(await pullWeeklyChallengeStreak(client, "u1")).toMatchObject({
      streak: 5,
      lastPlayedWeek: "2026-W40",
      covered: ["2026-W39"],
      shields: 0,
      shieldsEarned: 1,
    });
  });
});
