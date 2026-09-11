// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildUserDataExport } from "./exportUserData";

vi.mock("./friendsStore", () => ({
  getMyFriendCode: vi.fn(async () => "BR-7K2Q9"),
  getFriends: vi.fn(async () => [{ userId: "friend-1", displayName: "Ari", friendsSince: "2026-01-01" }]),
  getFriendRequests: vi.fn(async () => []),
}));
vi.mock("./mpStore", () => ({
  getMyMpGames: vi.fn(async () => []),
  getMyMpHistory: vi.fn(async () => []),
  getMyMpStats: vi.fn(async () => ({ played: 4, won: 2, lost: 2, currentWinStreak: 0, bestWinStreak: 2, podiums: 3, biggestTableBeaten: 5 })),
}));

const USER = { id: "u-1", email: "player@example.com", created_at: "2026-01-01T00:00:00Z" } as User;

function fakeSupabase(overrides: Partial<Record<string, unknown>> = {}) {
  const from = vi.fn((table: string) => {
    if (overrides[table]) return overrides[table];
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { user_id: USER.id, table }, error: null }),
          // .eq(...) with no further chain (used by `many`) resolves directly
          then: (resolve: (v: { data: unknown; error: null }) => void) =>
            resolve({ data: [{ user_id: USER.id, table }], error: null }),
        }),
      }),
    };
  });
  return { from } as unknown as SupabaseClient;
}

describe("buildUserDataExport", () => {
  it("assembles account info, stats, history, and social sections", async () => {
    const supabase = fakeSupabase();
    const result = await buildUserDataExport(supabase, USER);

    expect(result.account).toMatchObject({ user_id: "u-1", email: "player@example.com", friend_code: "BR-7K2Q9" });
    expect(result.friends).toEqual([{ userId: "friend-1", displayName: "Ari", friendsSince: "2026-01-01" }]);
    expect((result.stats as { multiplayer: { played: number } }).multiplayer.played).toBe(4);
  });

  it("redacts push subscription keys, keeping only a truncated endpoint", async () => {
    const supabase = fakeSupabase({
      push_subscriptions: {
        select: () => ({
          eq: async () => ({
            data: [
              {
                endpoint: "https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP",
                created_at: "2026-02-01T00:00:00Z",
              },
            ],
            error: null,
          }),
        }),
      },
    });

    const result = await buildUserDataExport(supabase, USER);
    const subs = result.push_subscriptions as { endpoint: string; created_at: string }[];

    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint.endsWith("…")).toBe(true);
    expect(subs[0].endpoint.length).toBeLessThan(60);
    expect(JSON.stringify(subs)).not.toMatch(/p256dh|auth_key/);
  });

  it("degrades a single failing table to an { error } entry instead of throwing", async () => {
    const supabase = fakeSupabase({
      player_stats: {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              throw new Error("relation \"player_stats\" does not exist");
            },
          }),
        }),
      },
    });

    const result = await buildUserDataExport(supabase, USER);
    const playerStats = (result.stats as { solo_and_pass_and_play: unknown }).solo_and_pass_and_play;

    expect(playerStats).toMatchObject({ error: expect.stringContaining("does not exist") });
    // The rest of the export still comes through.
    expect(result.account).toMatchObject({ user_id: "u-1" });
  });
});
