// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { levelProgress } from "@/leveling";

const auth = { configured: true, loading: false, user: { id: "u1", email: "a@b.c" } as { id: string; email: string } | null };
const playerLevel = {
  level: levelProgress(EMPTY_PROGRESS_STATE),
  progress: EMPTY_PROGRESS_STATE,
  loading: false,
};

vi.mock("../AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../PlayerLevelContext", () => ({ usePlayerLevel: () => playerLevel }));
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));

import { RecapContent } from "./RecapContent";

afterEach(cleanup);

describe("RecapContent", () => {
  it("gates on sign-in for a guest", () => {
    auth.user = null;
    render(<RecapContent />);
    expect(screen.getByText("Sign in to see your recap")).toBeTruthy();
    auth.user = { id: "u1", email: "a@b.c" };
  });

  it("shows the empty-state nudge for a brand-new account with nothing played yet", async () => {
    playerLevel.progress = EMPTY_PROGRESS_STATE;
    playerLevel.level = levelProgress(EMPTY_PROGRESS_STATE);
    render(<RecapContent />);
    expect(await screen.findByText("Play your first game to start your recap.")).toBeTruthy();
    // Level/XP headline still shows even with nothing played (level 0).
    expect(screen.getByText("Level 0")).toBeTruthy();
  });

  it("shows overview and fun-fact stats once something's been played", async () => {
    const state = {
      ...EMPTY_PROGRESS_STATE,
      gamesPlayed: 12,
      gamesWon: 6,
      bestScore: 45,
      counters: { books_melded: 30, runs_melded: 18, wilds_drawn: 4, jokers_drawn: 1 },
    };
    playerLevel.progress = state;
    playerLevel.level = levelProgress(state);
    render(<RecapContent />);
    expect(await screen.findByText("12")).toBeTruthy(); // games played
    expect(screen.getByText("45")).toBeTruthy(); // best score
    expect(screen.getByText("30")).toBeTruthy(); // books melded
    expect(screen.queryByText("Play your first game to start your recap.")).toBeNull();
  });

  it("only shows the Multiplayer section once the account has played an MP game", async () => {
    const withoutMp = { ...EMPTY_PROGRESS_STATE, gamesPlayed: 1 };
    playerLevel.progress = withoutMp;
    playerLevel.level = levelProgress(withoutMp);
    const { rerender } = render(<RecapContent />);
    await screen.findByText("Games played");
    expect(screen.queryByText("Multiplayer")).toBeNull();

    const withMp = { ...withoutMp, mpGamesPlayed: 3, mpGamesWon: 2 };
    playerLevel.progress = withMp;
    playerLevel.level = levelProgress(withMp);
    rerender(<RecapContent />);
    expect(await screen.findByText("Multiplayer")).toBeTruthy();
  });
});
