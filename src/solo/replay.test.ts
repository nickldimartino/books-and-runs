import { describe, expect, it } from "vitest";
import { roundSeed, seededRng } from "../deck";
import { createGame, PlayerConfig, startNextRound } from "../gameEngine";
import { playAITurn } from "../ai/index";
import { MoveLogEntry } from "../moveLog";
import { CONTRACTS, SHORT_GAME_CONTRACTS } from "../types";
import { replaySoloGame } from "./replay";

const MAX_TURNS = 4000;

const TWO_AI: PlayerConfig[] = [
  { id: "human-0", name: "You", isAI: true, difficulty: "medium" },
  { id: "ai-1", name: "Bot", isAI: true, difficulty: "medium" },
];

/** Plays a whole all-AI game the exact way GameContext.tsx does — an
 * explicit per-round seeded rng, not a patched Math.random — recording its
 * own move log along the way, so replaySoloGame can be checked against a
 * real game's actual trajectory. */
function playFullAiGame(seed: number, seats: PlayerConfig[], contracts = SHORT_GAME_CONTRACTS) {
  let state = createGame(seats, contracts, seededRng(roundSeed(seed, 1)));
  const moveLog: MoveLogEntry[] = [];
  for (let i = 0; i < MAX_TURNS && !state.gameOver; i++) {
    if (state.roundOver) {
      state = startNextRound(state, seededRng(roundSeed(seed, state.round + 1)));
      continue;
    }
    moveLog.push(...playAITurn(state));
  }
  if (!state.gameOver) throw new Error(`playFullAiGame: didn't finish within ${MAX_TURNS} turns for seed ${seed}`);
  return { finalState: state, moveLog };
}

describe("replaySoloGame", () => {
  it("reproduces the exact same final state as the real game it replays, across several seeds", () => {
    for (const seed of [1, 2, 3, 100, 999]) {
      const { finalState, moveLog } = playFullAiGame(seed, TWO_AI);

      const result = replaySoloGame(seed, TWO_AI, SHORT_GAME_CONTRACTS, moveLog);

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.state.gameOver).toBe(true);
      expect(result.state.winnerId).toBe(finalState.winnerId);
      expect(result.state.players.map((p) => p.cumulativeScore)).toEqual(
        finalState.players.map((p) => p.cumulativeScore)
      );
      expect(result.state.round).toBe(finalState.round);
    }
  });

  it("reproduces a full 7-round game too, not just the short game", () => {
    const seed = 55;
    const { finalState, moveLog } = playFullAiGame(seed, TWO_AI, CONTRACTS);
    const result = replaySoloGame(seed, TWO_AI, CONTRACTS, moveLog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.map((p) => p.cumulativeScore)).toEqual(
      finalState.players.map((p) => p.cumulativeScore)
    );
  });

  it("derives sensible counter deltas for the tracked seat (human-0), gated the same way GameContext.tsx bumps live", () => {
    const seed = 9;
    const { moveLog } = playFullAiGame(seed, TWO_AI);
    const result = replaySoloGame(seed, TWO_AI, SHORT_GAME_CONTRACTS, moveLog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // turns_taken always equals seat 0's own draw-entry count exactly —
    // the one counter every completed game is guaranteed to credit at
    // least once, so this stays a real (non-vacuous) check regardless of
    // which branches this particular seed's AI-vs-AI play happened to hit.
    const yourDrawCount = moveLog.filter((e) => e.seat === 0 && e.type === "draw").length;
    expect(yourDrawCount).toBeGreaterThan(0);
    expect(result.counterDeltas.turns_taken).toBe(yourDrawCount);
  });

  it("credits nothing when human-0 isn't seated at all (an all-non-tracked game)", () => {
    const untracked: PlayerConfig[] = [
      { id: "ai-0", name: "Bot A", isAI: true, difficulty: "medium" },
      { id: "ai-1", name: "Bot B", isAI: true, difficulty: "medium" },
    ];
    const seed = 9;
    const { moveLog } = playFullAiGame(seed, untracked);
    const result = replaySoloGame(seed, untracked, SHORT_GAME_CONTRACTS, moveLog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counterDeltas).toEqual({});
  });

  it("handles a meld or lay-off that empties the hand mid-game (going out with no discard, not just round 7)", () => {
    // AI strategies (src/ai/*.ts) take no rng argument and fall back to
    // real Math.random for their own decisions — only the deal itself is
    // seeded here — so whether any given seed's game happens to include a
    // mid-game "discard, cardId: null" auto-out (the finishIfWentOut path;
    // see GameContext.tsx's confirmMeld/layOff) isn't itself deterministic
    // run to run. This loop just confirms replay stays correct across many
    // games regardless of which branches they happen to hit; the
    // finishIfWentOut behavior itself has its own deterministic,
    // hand-crafted regression test in app/GameContext.test.tsx.
    for (let seed = 0; seed < 40; seed++) {
      const { finalState, moveLog } = playFullAiGame(seed, TWO_AI);
      const result = replaySoloGame(seed, TWO_AI, SHORT_GAME_CONTRACTS, moveLog);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state.players.map((p) => p.cumulativeScore)).toEqual(
          finalState.players.map((p) => p.cumulativeScore)
        );
      }
    }
  });

  it("rejects a move log with a tampered lay-off target", () => {
    const seed = 42;
    const { moveLog } = playFullAiGame(seed, TWO_AI);
    const layOffIdx = moveLog.findIndex((e) => e.type === "layOff");
    expect(layOffIdx).toBeGreaterThanOrEqual(0);
    const corrupted = moveLog.map((e, i) =>
      i === layOffIdx && e.type === "layOff" ? { ...e, cardId: "not-a-real-card-id" } : e
    );

    expect(replaySoloGame(seed, TWO_AI, SHORT_GAME_CONTRACTS, corrupted).ok).toBe(false);
  });

  it("rejects a fabricated extra draw before the real discard (double-draw exploit)", () => {
    const seed = 7;
    const { moveLog } = playFullAiGame(seed, TWO_AI);
    const firstDrawIdx = moveLog.findIndex((e) => e.type === "draw");
    const injected: MoveLogEntry[] = [
      ...moveLog.slice(0, firstDrawIdx + 1),
      { seat: moveLog[firstDrawIdx].seat, type: "draw", fromDiscard: false },
      ...moveLog.slice(firstDrawIdx + 1),
    ];

    const result = replaySoloGame(seed, TWO_AI, SHORT_GAME_CONTRACTS, injected);
    expect(result.ok).toBe(false);
  });

  it("rejects a seed that doesn't match the one the log was actually played from", () => {
    const seed = 321;
    const { moveLog } = playFullAiGame(seed, TWO_AI);
    expect(replaySoloGame(seed + 1, TWO_AI, SHORT_GAME_CONTRACTS, moveLog).ok).toBe(false);
  });

  it("rejects an empty move log", () => {
    expect(replaySoloGame(1, TWO_AI, SHORT_GAME_CONTRACTS, []).ok).toBe(false);
  });

  it("rejects malformed input defensively", () => {
    expect(replaySoloGame(NaN, TWO_AI, SHORT_GAME_CONTRACTS, []).ok).toBe(false);
    expect(replaySoloGame(1, [TWO_AI[0]], SHORT_GAME_CONTRACTS, []).ok).toBe(false);
    expect(replaySoloGame(1, TWO_AI, [], []).ok).toBe(false);
    expect(replaySoloGame(1, TWO_AI, SHORT_GAME_CONTRACTS, "not an array" as unknown as MoveLogEntry[]).ok).toBe(
      false
    );
  });
});
