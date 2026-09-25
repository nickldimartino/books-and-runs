// @vitest-environment jsdom

// The XP/recording half of the game-over screen: a Daily Deal / Weekly
// Challenge completion is verified server-side (which credits the fixed
// XP), and the streak card shows exactly what THAT response says was newly
// credited — "+25 XP", a streak-milestone bonus, a level-up — and nothing
// on a replay. A regular game lists the quests it just completed in its XP
// breakdown.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { levelProgress } from "@/leveling";
import { makeGameState, makePlayer } from "@/testHelpers";
import { YOU_PLAYER_ID } from "../lib/recordGameResult";

const state = makeGameState({
  gameOver: true,
  roundOver: true,
  winnerId: YOU_PLAYER_ID,
  players: [
    makePlayer({ id: YOU_PLAYER_ID, name: "You", cumulativeScore: 5 }),
    makePlayer({ id: "ai-0", name: "Bot", isAI: true, difficulty: "easy", cumulativeScore: 20 }),
  ],
});

const flags = { daily: false, weekly: false };
const verify = vi.fn();
const refresh = vi.fn();
let levelBefore = levelProgress(EMPTY_PROGRESS_STATE);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../GameContext", () => ({
  useGame: () => ({
    quitToHome: vi.fn(),
    roundHistory: [],
    getSeed: () => 123,
    getMoveLog: () => [{ type: "draw" }],
    clearSessionCounters: vi.fn(),
    isTutorial: false,
    isDailyDeal: flags.daily,
    isWeeklyChallenge: flags.weekly,
    trackStats: true,
  }),
}));
vi.mock("../AuthContext", () => ({ useAuth: () => ({ configured: true, user: { id: "u1", email: "a@b.c" } }) }));
vi.mock("../PlayerLevelContext", () => ({ usePlayerLevel: () => ({ level: levelBefore, refresh }) }));
vi.mock("../lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("../lib/verifySoloGame", async (orig) => ({
  ...(await orig<typeof import("../lib/verifySoloGame")>()),
  verifySoloGame: (...args: unknown[]) => verify(...args),
}));
vi.mock("../lib/loadAchievementProgress", () => ({ loadAchievementProgressState: async () => EMPTY_PROGRESS_STATE }));
vi.mock("../lib/leaderboardStore", async (orig) => ({
  ...(await orig<typeof import("../lib/leaderboardStore")>()),
  pullDailyDealStreak: async () => null,
  pullWeeklyChallengeStreak: async () => null,
  syncDailyDealStreak: async () => {},
  syncWeeklyChallengeStreak: async () => {},
  syncLeaderboardStats: async () => {},
}));
vi.mock("../lib/dailyDealLeaderboard", () => ({
  submitDailyDealScore: async () => {},
  fetchDailyDealFriendScores: async () => [],
}));
vi.mock("../lib/sound", () => ({ playAchievementUnlock: vi.fn(), playLevelUp: vi.fn() }));
vi.mock("../lib/shareCard", () => ({ renderShareCard: async () => null }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("./Confetti", () => ({ Confetti: () => null }));

import { GameOverScreen } from "./GameOverScreen";

beforeEach(() => {
  window.localStorage.clear();
  verify.mockReset();
  refresh.mockReset();
  levelBefore = levelProgress(EMPTY_PROGRESS_STATE);
  refresh.mockResolvedValue(levelBefore);
  flags.daily = false;
  flags.weekly = false;
});
afterEach(cleanup);

describe("GameOverScreen — Daily Deal XP", () => {
  it("shows the fixed completion XP and a streak-milestone bonus the server just credited", async () => {
    flags.daily = true;
    verify.mockResolvedValue({ ok: true, dailyDeal: true, xp: 25, streakBonuses: [{ days: 7, xp: 50 }] });
    render(<GameOverScreen state={state} />);
    expect(await screen.findByText("+25 XP for today's deal")).toBeTruthy();
    expect(screen.getByText("+50 XP streak bonus · 7 days")).toBeTruthy();
    // Sent as a Daily Deal completion, not a regular game.
    const payload = verify.mock.calls[0][1];
    expect(payload.isDailyDeal).toBe(true);
    expect(payload.dailyDealDateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shows nothing extra on a replay (server credited 0)", async () => {
    flags.daily = true;
    verify.mockResolvedValue({ ok: true, dailyDeal: true, xp: 0, streakBonuses: [] });
    render(<GameOverScreen state={state} />);
    await waitFor(() => expect(verify).toHaveBeenCalled());
    await screen.findByText("1-day streak");
    expect(screen.queryByText(/XP for today's deal/)).toBeNull();
  });

  it("shows nothing extra from a server that predates the XP ledger (no xp field)", async () => {
    flags.daily = true;
    verify.mockResolvedValue({ ok: true, dailyDeal: true });
    render(<GameOverScreen state={state} />);
    await waitFor(() => expect(verify).toHaveBeenCalled());
    await screen.findByText("1-day streak");
    expect(screen.queryByText(/XP for today's deal/)).toBeNull();
  });

  it("announces a level-up caused by the completion XP", async () => {
    flags.daily = true;
    verify.mockResolvedValue({ ok: true, dailyDeal: true, xp: 25 });
    refresh.mockResolvedValue(levelProgress({ ...EMPTY_PROGRESS_STATE, bonusXp: 60 })); // level 1
    render(<GameOverScreen state={state} />);
    expect(await screen.findByText("Level up! Now level 1")).toBeTruthy();
  });

  it("queues a transient failure for retry but not a rejection", async () => {
    flags.daily = true;
    const { SoloVerifyError } = await import("../lib/verifySoloGame");
    verify.mockRejectedValue(new SoloVerifyError("boom", 503));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GameOverScreen state={state} />);
    await waitFor(() => expect(window.localStorage.getItem("booksAndRuns:pendingSaves")).toContain("isDailyDeal"));
    spy.mockRestore();
  });

  it("does not queue a permanent rejection", async () => {
    flags.daily = true;
    const { SoloVerifyError } = await import("../lib/verifySoloGame");
    verify.mockRejectedValue(new SoloVerifyError("nope", 400));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GameOverScreen state={state} />);
    await waitFor(() => expect(verify).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(window.localStorage.getItem("booksAndRuns:pendingSaves") ?? "[]").not.toContain("isDailyDeal");
    spy.mockRestore();
  });
});

describe("GameOverScreen — Weekly Challenge XP", () => {
  it("shows the weekly completion XP", async () => {
    flags.weekly = true;
    verify.mockResolvedValue({ ok: true, weeklyChallenge: true, xp: 100, streakBonuses: [] });
    render(<GameOverScreen state={state} />);
    expect(await screen.findByText("+100 XP for this week's challenge")).toBeTruthy();
    expect(verify.mock.calls[0][1].isWeeklyChallenge).toBe(true);
  });
});

describe("GameOverScreen — regular game quests", () => {
  it("lists the quests the game just completed in the XP breakdown", async () => {
    verify.mockResolvedValue({
      ok: true,
      tracked: true,
      quests: [{ id: "d_win", period: "daily", xp: 30 }],
    });
    refresh.mockResolvedValue(levelProgress({ ...EMPTY_PROGRESS_STATE, gamesPlayed: 1, gamesWon: 1, bonusXp: 30 }));
    render(<GameOverScreen state={state} />);
    expect(await screen.findByText("+30 XP — Quest: Win games")).toBeTruthy();
  });
});
