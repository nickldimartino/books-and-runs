// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationBell } from "./NotificationBell";
import type { MpGameSummary } from "../lib/mpStore";
import { notifiableReleases } from "../lib/releases";

// Derived from the real data, not hardcoded — this file used to assume
// exactly one release was ever notifiable (true only because releases.ts
// had gone unmaintained for weeks; see its own history), so it broke the
// moment a backfill — or even just the next single real release — changed
// that count. Reading notifiableReleases() directly here means this can't
// happen again: whatever RELEASES actually contains right now is what
// these assertions check against.
const RELEASE_COUNT = notifiableReleases().length;
const NEWEST_RELEASE = notifiableReleases()[0];
// Mirrors NotificationBell's own Row rendering exactly (a "fix" release
// shows the generic translated badge label, never its own — mostly
// identical, "Bug fixes and improvements" — title) rather than assuming
// the newest entry happens to be a "feature", which won't always be true.
const NEWEST_RELEASE_LABEL = NEWEST_RELEASE.kind === "feature" ? NEWEST_RELEASE.title : "Bug fixes and improvements";

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
  // Signed-in users also always carry the newest release(s) as a low-priority
  // informational item (see releases.ts) — RELEASE_COUNT more than the raw
  // game/friend count these tests would otherwise total.
  it("shows a capped badge, opens a dialog, clears the badge but keeps the item; Esc closes", () => {
    render(<NotificationBell userId="me" notifications={{ friendRequests: 12, mpGames: [game], gifts: [], refresh }} />);
    expect(screen.getByTestId("notification-badge").textContent).toBe("9+");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Notifications, ${12 + 1 + RELEASE_COUNT} new`) }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.queryByTestId("notification-badge")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });
  it("falls back to just the newest release(s) when there's nothing else — releases mean a signed-in user is never truly 'all caught up'", () => {
    render(<NotificationBell userId="me" notifications={{ friendRequests: 0, mpGames: [], gifts: [], refresh }} />);
    fireEvent.click(screen.getByRole("button", { name: `Notifications, ${RELEASE_COUNT} new` }));
    expect(screen.queryByText("You're all caught up")).toBeNull();
    // getAllByText, not getByText: several notifiable releases can share the
    // same generic "fix" label, so more than one match is expected, not an
    // ambiguity bug.
    expect(screen.getAllByText(new RegExp(NEWEST_RELEASE_LABEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).length).toBeGreaterThan(0);
  });
  it("renders nothing for a guest with nothing to show (releases don't count for a signed-out visitor)", () => {
    const { container } = render(<NotificationBell userId={null} notifications={{ friendRequests: 0, mpGames: [], gifts: [], refresh }} />);
    expect(container.firstChild).toBeNull();
  });
  it("shows a received gift, named when the sender's display name is known", () => {
    render(
      <NotificationBell
        userId="me"
        notifications={{
          friendRequests: 0,
          mpGames: [],
          gifts: [{ id: "e1", sku: "badge:🎩", itemName: "Top Hat badge", fromName: "Ana", createdAt: "2026-09-25T00:00:00Z" }],
          refresh,
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Notifications, ${1 + RELEASE_COUNT} new`) }));
    expect(screen.getByText(/Ana sent you Top Hat badge!/)).toBeTruthy();
  });
});
