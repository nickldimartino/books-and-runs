// @vitest-environment jsdom

// The three hub pages the app nav points at (Progress / Social / Profile) and
// Home's Play zone.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { ProgressContent } from "./progress/ProgressContent";
import { SocialContent } from "./social/SocialContent";
import { ProfileContent } from "./profile/ProfileContent";
import { PlayZone } from "./components/home/PlayZone";
import type { MpGameSummary } from "./lib/mpStore";

let auth: { configured: boolean; user: { id: string } | null; signOut: () => void } = {
  configured: true,
  user: null,
  signOut: () => {},
};
let favorite: unknown = null;
let counts = { friendRequests: 0, gameRequests: 0, yourTurn: 0 };

vi.mock("./AuthContext", () => ({ useAuth: () => auth }));
vi.mock("./PlayerLevelContext", () => ({
  usePlayerLevel: () => ({ level: null, progress: null, loading: false, refresh: async () => {} }),
}));
vi.mock("./GameContext", () => ({ useGame: () => ({ startNewGame: () => {} }) }));
vi.mock("./lib/NotificationsContext", () => ({
  useSharedNotifications: () => ({ ...counts, total: 0, mpGames: [], loading: false, refresh: () => {} }),
}));
vi.mock("./lib/supabaseClient", () => ({ supabase: null, loadSupabase: async () => null }));
vi.mock("./lib/favoriteGameConfig", async (orig) => ({
  ...(await orig<typeof import("./lib/favoriteGameConfig")>()),
  loadFavoriteGameConfigWithCloud: async () => favorite,
}));

afterEach(() => {
  cleanup();
  auth = { configured: true, user: null, signOut: () => {} };
  favorite = null;
  counts = { friendRequests: 0, gameRequests: 0, yourTurn: 0 };
});

describe("Progress hub", () => {
  it("links to Achievements, Leaderboard and Stats & history; guests get a sign-in card", () => {
    render(<ProgressContent />);
    expect(screen.getByRole("heading", { level: 1, name: "Progress" })).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/achievements", "/leaderboard", "/player", "/sign-in"]));
  });
  it("signed in: stats & history open the account's own profile", () => {
    auth = { ...auth, user: { id: "u1" } };
    render(<ProgressContent />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/player") && h.includes("u1"))).toBe(true);
    expect(hrefs).not.toContain("/sign-in");
  });
});

describe("Social hub", () => {
  it("lists Friends (with the request badge), Play with friends, Clubs and Tournaments", () => {
    counts = { friendRequests: 2, gameRequests: 0, yourTurn: 0 };
    auth = { ...auth, user: { id: "u1" } };
    render(<SocialContent />);
    const friends = screen.getByRole("link", { name: /^Friends/ });
    expect(friends.getAttribute("href")).toBe("/friends");
    expect(friends.textContent).toContain("2");
    expect(screen.getByRole("link", { name: /^Clubs/ }).getAttribute("href")).toBe("/clubs");
    expect(screen.getByRole("link", { name: /^Tournaments/ }).getAttribute("href")).toBe("/tournaments");
    expect(screen.queryByText(/sign in to add friends/i)).toBeNull();
  });
  it("guests see a sign-in nudge", () => {
    render(<SocialContent />);
    expect(screen.getByText(/sign in to add friends/i)).toBeTruthy();
  });
});

describe("Profile hub", () => {
  it("holds Settings and the Help & about links (moved out of Home's More menu)", () => {
    render(<ProfileContent />);
    expect(screen.getByRole("link", { name: /^Settings/ }).getAttribute("href")).toBe("/settings");
    expect(screen.queryByRole("link", { name: /^Account/ })).toBeNull();
    const help = screen.getByRole("region", { name: "Help & about" });
    const hrefs = Array.from(help.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/how-to-play", "/scorecard", "/history", "/privacy", "/terms", "/support"]);
  });
  it("signed in: Account, My profile and Sign out appear", () => {
    const signOut = vi.fn();
    auth = { configured: true, user: { id: "u1" }, signOut };
    render(<ProfileContent />);
    expect(screen.getByRole("link", { name: /^Account/ }).getAttribute("href")).toBe("/account");
    expect(screen.getByRole("link", { name: /^My profile/ })).toBeTruthy();
    screen.getByRole("button", { name: "Sign out" }).click();
    expect(signOut).toHaveBeenCalled();
  });
});

describe("PlayZone", () => {
  const base = {
    hasSavedGame: false,
    savedSummary: null,
    savedMode: null,
    resuming: false,
    onContinue: () => {},
    waitingGame: null,
    isFirstSession: false,
    onStarted: () => {},
  };
  const mp: MpGameSummary = {
    game_id: "g1", status: "active", round: 2, total_rounds: 7, your_seat: 0, invite_status: "accepted",
    turn_seat: 0, turn_user_id: "me", seats: [{ seat: 1, kind: "human", name: "Ana" }], hand_counts: {},
    cumulative_scores: {}, host_id: "x", updated_at: "2026-09-25T00:00:00Z",
  };

  it("defaults to a single New Game button", () => {
    render(<PlayZone {...base} />);
    expect(screen.getByTestId("play-primary").textContent).toBe("New Game");
    expect(screen.getAllByRole("link", { name: "New Game" })).toHaveLength(1);
  });

  it("Continue beats everything when a solo game is in progress, with New Game beside it", () => {
    favorite = { humanCount: 1, humanNames: ["T"], aiDifficulties: ["easy"], roundMode: "short", customRounds: [] };
    render(<PlayZone {...base} hasSavedGame savedMode="Solo" savedSummary="Round 3 of 7" />);
    expect(screen.getByTestId("play-primary").textContent).toBe("Continue");
    expect(screen.getByText("Solo · Round 3 of 7")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New Game" })).toBeTruthy();
  });

  it("Continue also resumes the multiplayer game waiting on you", () => {
    render(<PlayZone {...base} waitingGame={mp} />);
    const primary = screen.getByTestId("play-primary");
    expect(primary.textContent).toBe("Continue");
    expect(primary.getAttribute("href")).toBe("/multiplayer/play?g=g1");
    expect(screen.getByText(/Ana · Your turn/)).toBeTruthy();
  });

  it("Quick Deal appears with a saved lineup once a first game has been started, not before", async () => {
    favorite = { humanCount: 1, humanNames: ["T"], aiDifficulties: ["easy"], roundMode: "short", customRounds: [] };
    const first = render(<PlayZone {...base} isFirstSession />);
    await act(async () => {});
    expect(screen.getByTestId("play-primary").textContent).toBe("New Game");
    first.unmount();
    render(<PlayZone {...base} />);
    await waitFor(() => expect(screen.getByTestId("play-primary").textContent).toBe("Quick Deal"));
    expect(screen.getByRole("link", { name: "New Game" })).toBeTruthy();
  });
});
