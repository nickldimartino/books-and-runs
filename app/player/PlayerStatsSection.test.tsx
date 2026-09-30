// @vitest-environment jsdom

// PlayerStatsSection is pure presentation over usePlayerPrivateData's
// output (no fetching of its own) — this codebase's own live verification
// of the profile-page split covered the real data flow end to end via a
// throwaway signed-in account; this file exists so a FUTURE regression in
// this specific rendering (which had zero test coverage before the split)
// shows up without needing a live Supabase session again.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_MP_STATS } from "../lib/mpStore";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { PlayerStatsSection } from "./PlayerStatsSection";
import type { PlayerPrivateData } from "./usePlayerPrivateData";

afterEach(cleanup);

function basePrivateData(overrides: Partial<PlayerPrivateData> = {}): PlayerPrivateData {
  return {
    privateStats: null,
    history: [],
    progress: EMPTY_PROGRESS_STATE,
    dailyDealBestStreak: 0,
    isSupporter: false,
    mpStats: null,
    mpHistory: [],
    privateLoading: false,
    privateStatsError: false,
    // Not exercised by this component directly, but part of the hook's
    // return shape — a minimal but structurally valid stand-in.
    unlockCtx: {
      level: 0,
      progress: EMPTY_PROGRESS_STATE,
      gamesPlayed: 0,
      dailyDealBestStreak: 0,
      weeklyChallengeBestStreak: 0,
      isCreator: false,
      isSupporter: false,
      ownedSkus: new Set(),
      worstScore: null,
      averageScore: null,
      gamesTied: 0,
      mpBestWinStreak: 0,
    },
    achievements: [],
    unlocked: [],
    closestAchievement: null,
    masteredFamilies: 0,
    rarest: null,
    toughestBeaten: null,
    unlockedByTier: { beginner: 0, easy: 0, medium: 0, hard: 0, expert: 0 },
    pickableTrophies: [],
    showcaseSelection: [],
    showcaseSaveState: "idle",
    toggleShowcaseItem: () => {},
    saveShowcase: async () => {},
    ...overrides,
  };
}

describe("PlayerStatsSection", () => {
  it("shows a loading spinner while private stats are loading", () => {
    const { container } = render(
      <PlayerStatsSection privateData={basePrivateData({ privateLoading: true })} level={null} user={null} mpRating={1200} mpRatedGames={0} />
    );
    expect(container.querySelector(".card-flip")).toBeTruthy();
  });

  it("shows the load-error message on a query failure", () => {
    render(
      <PlayerStatsSection privateData={basePrivateData({ privateStatsError: true })} level={null} user={null} mpRating={1200} mpRatedGames={0} />
    );
    expect(screen.getByText(/Couldn't load your stats/)).toBeTruthy();
  });

  it("shows the empty state for a brand-new account with no games yet", () => {
    render(<PlayerStatsSection privateData={basePrivateData()} level={null} user={null} mpRating={1200} mpRatedGames={0} />);
    expect(screen.getByText(/No games recorded yet/)).toBeTruthy();
    expect(screen.queryByText("Wins by AI difficulty faced")).toBeNull();
  });

  it("renders the full stats breakdown once a game has been played", () => {
    const privateData = basePrivateData({
      privateStats: {
        games_played: 5,
        games_won: 2,
        games_tied: 0,
        best_score: 45,
        worst_score: 120,
        average_score: 80,
        wins_by_difficulty: { beginner: 0, easy: 1, medium: 1, hard: 0, expert: 0 },
      },
    });
    render(<PlayerStatsSection privateData={privateData} level={null} user={null} mpRating={1200} mpRatedGames={0} />);
    expect(screen.getByText("Wins by AI difficulty faced")).toBeTruthy();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0); // games_won stat tile
  });

  it("only shows the Multiplayer section once the account has an MP game", () => {
    const withoutMp = basePrivateData({
      privateStats: {
        games_played: 1,
        games_won: 0,
        games_tied: 0,
        best_score: 100,
        worst_score: 100,
        average_score: 100,
        wins_by_difficulty: {},
      },
    });
    const { rerender } = render(
      <PlayerStatsSection privateData={withoutMp} level={null} user={null} mpRating={1200} mpRatedGames={0} />
    );
    expect(screen.queryByText(/Multiplayer/)).toBeNull();

    const withMp = basePrivateData({
      privateStats: withoutMp.privateStats,
      mpStats: { ...EMPTY_MP_STATS, played: 3, won: 1 },
    });
    rerender(<PlayerStatsSection privateData={withMp} level={null} user={null} mpRating={1200} mpRatedGames={0} />);
    expect(screen.getByText(/Multiplayer/)).toBeTruthy();
  });

  it("only shows the Rating tile once the account has enough rated games", () => {
    const privateData = basePrivateData({
      privateStats: {
        games_played: 1,
        games_won: 0,
        games_tied: 0,
        best_score: 100,
        worst_score: 100,
        average_score: 100,
        wins_by_difficulty: {},
      },
      mpStats: { ...EMPTY_MP_STATS, played: 6, won: 3 },
    });
    const { rerender } = render(
      <PlayerStatsSection privateData={privateData} level={null} user={null} mpRating={1340} mpRatedGames={5} />
    );
    expect(screen.queryByText("1340")).toBeNull();

    rerender(<PlayerStatsSection privateData={privateData} level={null} user={null} mpRating={1340} mpRatedGames={6} />);
    expect(screen.getByText("1340")).toBeTruthy();
  });
});
