import { describe, expect, it } from "vitest";
import { computeEloUpdates, RatedParticipant } from "../supabase/functions/_shared/eloRating";

const p = (userId: string, rating: number, score: number, ratedGames = 0): RatedParticipant => ({
  userId,
  rating,
  score,
  ratedGames,
});

describe("computeEloUpdates", () => {
  it("returns [] for fewer than 2 participants (not a rated game)", () => {
    expect(computeEloUpdates([])).toEqual([]);
    expect(computeEloUpdates([p("a", 1200, 50)])).toEqual([]);
  });

  it("equal ratings, one wins: winner gains, loser loses the same amount (zero-sum for a pair)", () => {
    const [winner, loser] = computeEloUpdates([p("a", 1200, 10), p("b", 1200, 90)]);
    expect(winner.rating).toBeGreaterThan(1200);
    expect(loser.rating).toBeLessThan(1200);
    expect(winner.rating - 1200).toBe(1200 - loser.rating);
    expect(winner.rating).toBe(1216); // K=32, 1v1, expected 0.5 each -> +/-16
  });

  it("a tie moves nobody's rating when ratings started equal", () => {
    const [a, b] = computeEloUpdates([p("a", 1200, 50), p("b", 1200, 50)]);
    expect(a.rating).toBe(1200);
    expect(b.rating).toBe(1200);
  });

  it("an underdog beating a much higher-rated player gains more than a even match would", () => {
    const [underdog] = computeEloUpdates([p("underdog", 1000, 10), p("favorite", 1600, 90)]);
    const [evenWinner] = computeEloUpdates([p("a", 1200, 10), p("b", 1200, 90)]);
    expect(underdog.rating - 1000).toBeGreaterThan(evenWinner.rating - 1200);
  });

  it("a favorite beating a much lower-rated underdog gains only a little", () => {
    const [favorite] = computeEloUpdates([p("favorite", 1600, 10), p("underdog", 1000, 90)]);
    expect(favorite.rating - 1600).toBeGreaterThan(0);
    expect(favorite.rating - 1600).toBeLessThan(5);
  });

  it("increments ratedGames for every participant", () => {
    const updates = computeEloUpdates([p("a", 1200, 10, 3), p("b", 1200, 20, 7)]);
    expect(updates.find((u) => u.userId === "a")?.ratedGames).toBe(4);
    expect(updates.find((u) => u.userId === "b")?.ratedGames).toBe(8);
  });

  it("never drops a rating below the floor even after a big underdog loss", () => {
    const [tiny] = computeEloUpdates([p("tiny", 105, 90), p("giant", 2400, 10)]);
    expect(tiny.rating).toBeGreaterThanOrEqual(100);
  });

  it("a 4-player table: winner gains, last place loses the most, total delta sums to ~zero", () => {
    const updates = computeEloUpdates([
      p("first", 1200, 10),
      p("second", 1200, 30),
      p("third", 1200, 50),
      p("last", 1200, 90),
    ]);
    const byId = Object.fromEntries(updates.map((u) => [u.userId, u.rating]));
    expect(byId.first).toBeGreaterThan(byId.second);
    expect(byId.second).toBeGreaterThan(byId.third);
    expect(byId.third).toBeGreaterThan(byId.last);
    const total = updates.reduce((sum, u) => sum + (u.rating - 1200), 0);
    expect(Math.abs(total)).toBeLessThanOrEqual(1); // rounding slack only
  });

  it("scales the K-factor by table size so a 4-player game's total swing matches a 2-player game's", () => {
    const twoPlayer = computeEloUpdates([p("a", 1200, 10), p("b", 1200, 90)]);
    const fourPlayerWinnerDelta = computeEloUpdates([
      p("a", 1200, 10),
      p("b", 1200, 30),
      p("c", 1200, 50),
      p("d", 1200, 90),
    ]).find((u) => u.userId === "a")!.rating - 1200;
    const twoPlayerWinnerDelta = twoPlayer.find((u) => u.userId === "a")!.rating - 1200;
    // Not identical (a 4-player field has 3 comparisons of varying margin,
    // not 1), but the same order of magnitude, not 3x larger.
    expect(fourPlayerWinnerDelta).toBeGreaterThan(0);
    expect(fourPlayerWinnerDelta).toBeLessThan(twoPlayerWinnerDelta * 2);
  });
});
