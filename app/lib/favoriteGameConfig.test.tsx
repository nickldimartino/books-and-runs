// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearFavoriteGameConfig,
  contractsFor,
  describeFavoriteGameConfig,
  FavoriteGameConfig,
  loadFavoriteGameConfig,
  loadFavoriteGameConfigWithCloud,
  playerConfigsFor,
  saveFavoriteGameConfig,
} from "./favoriteGameConfig";
import { CONTRACTS, SHORT_GAME_CONTRACTS } from "@/types";

const SOLO_VS_3_HARD: FavoriteGameConfig = {
  humanCount: 1,
  humanNames: ["You"],
  aiDifficulties: ["hard", "hard", "hard"],
  roundMode: "short",
  customRounds: [],
};

afterEach(() => {
  clearFavoriteGameConfig();
});

describe("favoriteGameConfig persistence", () => {
  it("round-trips a saved config", () => {
    saveFavoriteGameConfig(SOLO_VS_3_HARD);
    expect(loadFavoriteGameConfig()).toEqual(SOLO_VS_3_HARD);
  });

  it("returns null when nothing is saved", () => {
    expect(loadFavoriteGameConfig()).toBeNull();
  });

  it("clear removes it", () => {
    saveFavoriteGameConfig(SOLO_VS_3_HARD);
    clearFavoriteGameConfig();
    expect(loadFavoriteGameConfig()).toBeNull();
  });

  it("treats a malformed stored value as no favorite", () => {
    window.localStorage.setItem("booksAndRuns:favoriteGame", '{"humanCount":"lots"}');
    expect(loadFavoriteGameConfig()).toBeNull();
  });

  it("rejects a lineup that can't seat a game", () => {
    window.localStorage.setItem(
      "booksAndRuns:favoriteGame",
      JSON.stringify({ ...SOLO_VS_3_HARD, aiDifficulties: [] })
    );
    expect(loadFavoriteGameConfig()).toBeNull();
  });

  it("rejects an unknown difficulty", () => {
    window.localStorage.setItem(
      "booksAndRuns:favoriteGame",
      JSON.stringify({ ...SOLO_VS_3_HARD, aiDifficulties: ["nightmare"] })
    );
    expect(loadFavoriteGameConfig()).toBeNull();
  });
});

describe("describeFavoriteGameConfig", () => {
  it("summarises a solo game with grouped AI", () => {
    expect(describeFavoriteGameConfig(SOLO_VS_3_HARD)).toBe("You + 3 Hard AI · Short game");
  });

  it("uses the first player's name", () => {
    expect(
      describeFavoriteGameConfig({ ...SOLO_VS_3_HARD, humanNames: ["Nick"], roundMode: "all" })
    ).toBe("Nick + 3 Hard AI · All 7 rounds");
  });

  it("counts multiple humans and mixed difficulties", () => {
    expect(
      describeFavoriteGameConfig({
        humanCount: 2,
        humanNames: ["A", "B"],
        aiDifficulties: ["easy", "hard"],
        roundMode: "custom",
        customRounds: [1, 3, 5],
      })
    ).toBe("2 players + 1 Easy + 1 Hard AI · 3 rounds");
  });
});

describe("contractsFor", () => {
  it("maps round modes to contract lists", () => {
    expect(contractsFor("all", [])).toBe(CONTRACTS);
    expect(contractsFor("short", [])).toBe(SHORT_GAME_CONTRACTS);
    expect(contractsFor("custom", [1, 2]).map((c) => c.round)).toEqual([1, 2]);
  });
});

describe("playerConfigsFor", () => {
  it("builds humans then AI with fresh personas", () => {
    const configs = playerConfigsFor(["You"], ["hard", "hard"]);
    expect(configs).toHaveLength(3);
    expect(configs[0]).toMatchObject({ isAI: false, name: "You" });
    expect(configs[1]).toMatchObject({ isAI: true, difficulty: "hard" });
    expect(configs[2]).toMatchObject({ isAI: true, difficulty: "hard" });
    // Personas are distinct names, not "AI 1"/"AI 2".
    expect(configs[1].name).not.toBe(configs[2].name);
  });

  it("falls back to a default name for a blank human slot", () => {
    expect(playerConfigsFor(["  "], []).map((c) => c.name)).toEqual(["You"]);
  });
});

const SOLO_VS_2_EASY: FavoriteGameConfig = {
  humanCount: 1,
  humanNames: ["Nick"],
  aiDifficulties: ["easy", "easy"],
  roundMode: "all",
  customRounds: [],
};

/** A minimal SupabaseClient stub covering exactly the chain
 * pull/pushFavoriteGameConfig use, recording every upsert it sees. */
function fakeSupabase(pullResult: { data: unknown; error: unknown }) {
  const upserts: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => pullResult,
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        upserts.push(row);
        return { error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  };
  return { client: client as unknown as SupabaseClient, upserts };
}

describe("loadFavoriteGameConfigWithCloud", () => {
  it("returns the local copy untouched when signed out", async () => {
    saveFavoriteGameConfig(SOLO_VS_3_HARD);
    const result = await loadFavoriteGameConfigWithCloud(null, null);
    expect(result).toEqual(SOLO_VS_3_HARD);
  });

  it("prefers the cloud copy and caches it locally", async () => {
    saveFavoriteGameConfig(SOLO_VS_3_HARD); // stale local copy
    const { client } = fakeSupabase({ data: { config: SOLO_VS_2_EASY }, error: null });

    const result = await loadFavoriteGameConfigWithCloud(client, "u1");

    expect(result).toEqual(SOLO_VS_2_EASY);
    expect(loadFavoriteGameConfig()).toEqual(SOLO_VS_2_EASY); // cached for offline use
  });

  it("pushes the local copy up when the cloud has none yet", async () => {
    saveFavoriteGameConfig(SOLO_VS_3_HARD);
    const { client, upserts } = fakeSupabase({ data: null, error: null });

    const result = await loadFavoriteGameConfigWithCloud(client, "u1");

    expect(result).toEqual(SOLO_VS_3_HARD);
    await Promise.resolve(); // let the fire-and-forget push settle
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ user_id: "u1", config: SOLO_VS_3_HARD });
  });

  it("returns null when neither side has anything saved", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await loadFavoriteGameConfigWithCloud(client, "u1")).toBeNull();
  });
});
