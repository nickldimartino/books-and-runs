// Property / fuzz test: play a few hundred random full games end to end and
// assert the engine's invariants hold after *every* move. The unit tests
// pin down specific rules; this catches the combinations they didn't think
// of — a rare reshuffle path, an unusual going-out order, a contract set
// that exposes an off-by-one.
//
// Each iteration seeds Math.random (via mulberry32) so a failure prints a
// seed you can replay: `SEED=123 npx vitest run engine.fuzz`.

import { afterEach, describe, expect, it } from "vitest";
import { buildDeck, decksForPlayerCount, seededRng } from "./deck";
import { createGame, startNextRound } from "./gameEngine";
import { playAITurn } from "./ai/index";
import { CONTRACTS, SHORT_GAME_CONTRACTS, Card, Difficulty, GameState } from "./types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const CONTRACT_SETS = [CONTRACTS, SHORT_GAME_CONTRACTS, CONTRACTS.slice(0, 3), CONTRACTS.slice(2)];
// A round can't end until *someone* melds their contract (with melds on the
// table, cards leave circulation and the draw/discard piles eventually
// deplete; with zero melds a draw is always matched by a discard and the
// round would churn forever). The greedy AI always melds the moment it can,
// so real games finish in well under this — but a table of pure-random
// `beginner` seats is the one config that can genuinely stall, so the fuzz
// always seats at least one seat that actually plays toward the contract.
const MAX_TURNS_PER_GAME = 8000;

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});

/** Every card the game was dealt from, by id — the conservation baseline. */
function expectedDeckIds(playerCount: number): Set<string> {
  const deck = buildDeck(decksForPlayerCount(playerCount), () => 0.5);
  return new Set(deck.map((c) => c.id));
}

function allCardsInPlay(s: GameState): Card[] {
  return [
    ...s.players.flatMap((p) => p.hand),
    ...s.drawPile,
    ...s.discardPile,
    ...s.melds.flatMap((m) => m.cards),
  ];
}

function checkInvariants(s: GameState, deckSize: number, prevScores: number[]): void {
  const cards = allCardsInPlay(s);

  // 1. Card conservation — same count as the deck, and every id unique.
  expect(cards.length).toBe(deckSize);
  const ids = new Set(cards.map((c) => c.id));
  expect(ids.size).toBe(deckSize);

  // 2. Structural sanity.
  expect(s.currentPlayerIndex).toBeGreaterThanOrEqual(0);
  expect(s.currentPlayerIndex).toBeLessThan(s.players.length);
  expect(s.round).toBeGreaterThanOrEqual(1);
  expect(s.round).toBeLessThanOrEqual(s.selectedContracts.length);

  // 3. Scores only ever go up (a round adds hand penalties; nothing subtracts).
  s.players.forEach((p, i) => {
    expect(p.cumulativeScore).toBeGreaterThanOrEqual(prevScores[i]);
    expect(Number.isFinite(p.cumulativeScore)).toBe(true);
  });

  // 4. Melds are structurally legal: 3+ cards, a real type, and the cards
  //    *not* functioning as a generic wild (see Meld.wildCardIds — a natural
  //    2 in a book of 2s is isWild but not a stand-in) agree on rank/suit.
  for (const meld of s.melds) {
    expect(meld.cards.length).toBeGreaterThanOrEqual(3);
    expect(meld.type === "book" || meld.type === "run").toBe(true);
    const wildIds = new Set(meld.wildCardIds ?? []);
    const real = meld.cards.filter((c) => !wildIds.has(c.id));
    expect(real.length).toBeGreaterThan(0);
    if (meld.type === "book") {
      expect(new Set(real.map((c) => c.rank)).size).toBeLessThanOrEqual(1);
    } else {
      expect(new Set(real.map((c) => c.suit)).size).toBeLessThanOrEqual(1);
    }
  }

  // 5. Terminal state is coherent.
  if (s.gameOver) {
    expect(s.roundOver).toBe(true);
    expect(s.winnerId).toBeDefined();
    const winner = s.players.find((p) => p.id === s.winnerId);
    expect(winner).toBeDefined();
    const min = Math.min(...s.players.map((p) => p.cumulativeScore));
    expect(winner!.cumulativeScore).toBe(min);
  }
}

function playRandomGame(seed: number): void {
  Math.random = seededRng(seed);

  const playerCount = 2 + Math.floor(Math.random() * 4); // 2..5
  const contracts = CONTRACT_SETS[Math.floor(Math.random() * CONTRACT_SETS.length)];
  const configs = Array.from({ length: playerCount }, (_, i) => ({
    id: `seat-${i}`,
    name: `Seat ${i}`,
    isAI: true,
    // Seat 0 is always easy+ (see MAX_TURNS_PER_GAME); the rest are any tier.
    difficulty:
      i === 0
        ? DIFFICULTIES[1 + Math.floor(Math.random() * 4)]
        : DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)],
  }));

  let state = createGame(configs, contracts);
  const deckSize = expectedDeckIds(playerCount).size;
  let prevScores = state.players.map((p) => p.cumulativeScore);

  checkInvariants(state, deckSize, prevScores);

  let turns = 0;
  while (!state.gameOver) {
    if (turns++ > MAX_TURNS_PER_GAME) {
      throw new Error(`seed ${seed}: game did not finish within ${MAX_TURNS_PER_GAME} turns`);
    }

    if (state.roundOver) {
      prevScores = state.players.map((p) => p.cumulativeScore);
      state = startNextRound(state);
      checkInvariants(state, deckSize, prevScores);
      continue;
    }

    const before = state.players.map((p) => p.cumulativeScore);
    playAITurn(state);
    checkInvariants(state, deckSize, before);
    prevScores = before;
  }

  // Someone finished the game; every round was scored.
  expect(state.round).toBe(state.selectedContracts.length);
}

describe("engine fuzz — random full games keep every invariant", () => {
  const base = Number(process.env.SEED) || 1;
  const RUNS = 150;

  it(
    `plays ${RUNS} random games with no invariant violation`,
    () => {
      for (let i = 0; i < RUNS; i++) {
        playRandomGame(base + i);
      }
    },
    // A handful of seeds deal a contract nobody can complete; the engine's
    // deadlock backstop ends those rounds, but only after its (deliberately
    // generous) stall bound, so give the whole sweep room.
    30_000
  );
});
