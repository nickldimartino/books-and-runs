// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationBell } from "./NotificationBell";
import type { MpGameSummary } from "../lib/mpStore";

vi.mock("../lib/supabaseClient", () => ({ loadSupabase: async () => null, supabase: null }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const game: MpGameSummary = {
  game_id: "g1", status: "active", round: 2, total_rounds: 7, your_seat: 0, invite_status: "accepted",
  turn_seat: 0, turn_user_id: "me", seats: [{ seat: 1, kind: "human", name: "Ana" }], hand_counts: {},
  cumulative_scores: {}, host_id: "x", updated_at: "2026-09-25T00:00:00Z",
};
const refresh = () => {};

describe("NotificationBell", () => {
  it("shows a capped badge, opens a dialog, clears the badge but keeps the item; Esc closes", () => {
    render(<NotificationBell userId="me" notifications={{ friendRequests: 12, mpGames: [game], refresh }} />);
    expect(screen.getByTestId("notification-badge").textContent).toBe("9+");
    fireEvent.click(screen.getByRole("button", { name: /Notifications, 13 new/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.queryByTestId("notification-badge")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });
  it("shows the friendly empty state", () => {
    render(<NotificationBell userId="me" notifications={{ friendRequests: 0, mpGames: [], refresh }} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("You're all caught up")).toBeTruthy();
  });
  it("renders nothing for a guest with nothing to show", () => {
    const { container } = render(<NotificationBell userId={null} notifications={{ friendRequests: 0, mpGames: [], refresh }} />);
    expect(container.firstChild).toBeNull();
  });
});
