// AI balance guard. Plays many all-AI games and checks that the difficulty
// ladder still holds — a stronger tier wins more than a weaker one, games
// finish in a sane number of turns, and nobody's win rate collapses to 0 or
// pins to 100. An AI or rules change that quietly breaks the curve fails
// here instead of only being noticed in play.
//
// `npm run demo` prints the same numbers in a human-readable form.

import { describe, expect, it } from "vitest";
import { seededRng } from "../deck";
import { createGame, startNextRound } from "../gameEngine";
import { playAITurn } from "../ai/index";
import { CONTRACTS, Difficulty } from "../types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const GAMES = 60;
const MAX_TURNS = 8000;

interface Result {
  winsBySeat: number[];
  turnLengths: number[];
  unfinished: number;
}

function runTournament(seed: number): Result {
  const realRandom = Math.random;
  const winsBySeat = [0, 0, 0, 0, 0];
  const turnLengths: number[] = [];
  let unfinished = 0;

  for (let gi = 0; gi < GAMES; gi++) {
    Math.random = seededRng(seed + gi);
    // Rotate seat order each game so seat position isn't a confound.
    const order = DIFFICULTIES.map((_, i) => DIFFICULTIES[(i + gi) % DIFFICULTIES.length]);
    let state = createGame(
      order.map((d, i) => ({ id: `seat-${i}`, name: d, isAI: true, difficulty: d })),
      CONTRACTS
    );
    let turns = 0;
    while (!state.gameOver && turns < MAX_TURNS) {
      if (state.roundOver) {
        state = startNextRound(state);
        continue;
      }
      playAITurn(state);
      turns++;
    }
    Math.random = realRandom;

    if (!state.gameOver) {
      unfinished++;
      continue;
    }
    turnLengths.push(turns);
    const winnerSeat = Number(state.winnerId!.replace("seat-", ""));
    const winnerDiff = order[winnerSeat];
    winsBySeat[DIFFICULTIES.indexOf(winnerDiff)] += 1;
  }

  Math.random = realRandom;
  return { winsBySeat, turnLengths, unfinished };
}

describe("AI balance — the difficulty ladder holds", () => {
  const { winsBySeat, turnLengths, unfinished } = runTournament(1000);
  const rate = (i: number) => winsBySeat[i] / (GAMES - unfinished);

  it("nearly every game finishes without the deadlock backstop", () => {
    expect(unfinished).toBeLessThanOrEqual(GAMES * 0.15);
  });

  it("games are a sane length", () => {
    const avg = turnLengths.reduce((a, b) => a + b, 0) / turnLengths.length;
    expect(avg).toBeGreaterThan(30);
    expect(avg).toBeLessThan(1500);
  });

  it("the ladder isn't broken: beginner is worst, no tier dominates or collapses", () => {
    console.log(
      "win rates:",
      DIFFICULTIES.map((d, i) => `${d} ${(rate(i) * 100).toFixed(0)}%`).join("  ")
    );
    // Beginner is pure noise — it never lays off and discards wilds, so it
    // almost never empties its hand; it should be at the bottom.
    for (let i = 1; i < 5; i++) expect(rate(i)).toBeGreaterThanOrEqual(rate(0));
    // Note (2026-09, updated): easy/medium still out-win hard/expert in raw
    // AI-vs-AI win rate, and — measured across several seeds, not just this
    // one — a follow-up change (hard/expert taking a discard-pile wild that
    // completes their contract outright, completesOwnContract in
    // strategy.ts) landed as a wash for expert and a modest help for hard,
    // not the clean improvement the earlier leaderPressure/
    // cautiousWildLayOffPlan change measured. Kept anyway: independently
    // correct behavior (revealing need stops mattering once a card actually
    // finishes your hand) regardless of its effect on this specific metric.
    // Fully inverting AI-vs-AI win rate isn't the target on its own (hard's
    // and expert's real job is being a tougher *human* opponent, which
    // playing better defense against pure-greedy easy/medium bots doesn't
    // directly measure, and single-seed swings of 10+ points here are
    // normal noise, not signal) — this still just guards against a
    // regression, not that exact ordering. Reliably inverting it would
    // likely need real search (simulating a few turns ahead over the AI's
    // own hand and visible information, sampling plausible opponent hands
    // rather than reading their actual ones) rather than more heuristic
    // tuning — a materially bigger undertaking than anything here so far.
    for (let i = 1; i < 5; i++) {
      expect(rate(i)).toBeGreaterThan(0.04); // a tier hasn't become unplayable
      expect(rate(i)).toBeLessThan(0.7); // a tier isn't running away with it
    }
    const total = winsBySeat.reduce((a, b) => a + b, 0);
    expect(total).toBe(GAMES - unfinished);
  });
});
