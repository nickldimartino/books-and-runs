// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { countPendingTurns } from "./appBadge";
import type { MpGameSummary } from "./mpStore";

function game(over: Partial<MpGameSummary>): MpGameSummary {
  return {
    game_id: "g", status: "active", round: 1, total_rounds: 7, your_seat: 0, invite_status: "accepted",
    turn_seat: 0, turn_user_id: "me", seats: [], hand_counts: {}, cumulative_scores: {}, host_id: "h", updated_at: "",
    ...over,
  };
}

describe("countPendingTurns", () => {
  it("counts your-move games and unanswered invites, not waiting-on-others", () => {
    const games = [
      game({ game_id: "a" }), // my turn
      game({ game_id: "b", turn_user_id: "them" }), // waiting on them
      game({ game_id: "c", invite_status: "invited", status: "pending", turn_user_id: null }), // invite
      game({ game_id: "d", status: "pending", turn_user_id: "me" }), // accepted but not started
    ];
    expect(countPendingTurns(games, "me")).toBe(2);
  });
});
