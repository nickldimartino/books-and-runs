// AI benchmark: plays a batch of all-AI games (one seat per difficulty) and
// prints win rates, average game length, and final-score spread. Run with
// `npm run demo` (compiles src/ via tsconfig.engine.json, then node). The
// assertions live in src/ai/balance.test.ts; this is the readable view.

import { playAITurn } from "./ai/index";
import { createGame, startNextRound } from "./gameEngine";
import { CONTRACTS, Difficulty } from "./types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const GAMES = Number(process.env.GAMES) || 200;
const MAX_TURNS = 20000;

const wins = new Map<Difficulty, number>(DIFFICULTIES.map((d) => [d, 0]));
const finalScores = new Map<Difficulty, number[]>(DIFFICULTIES.map((d) => [d, []]));
const lengths: number[] = [];
let unfinished = 0;

for (let g = 0; g < GAMES; g++) {
  // Rotate seat order so seat position isn't a confound.
  const order = DIFFICULTIES.map((_, i) => DIFFICULTIES[(i + g) % DIFFICULTIES.length]);
  let state = createGame(
    order.map((d, i) => ({ id: `p${i}`, name: d, isAI: true, difficulty: d })),
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

  if (!state.gameOver) {
    unfinished++;
    continue;
  }
  lengths.push(turns);
  state.players.forEach((p, i) => finalScores.get(order[i])!.push(p.cumulativeScore));
  const winnerSeat = Number(state.winnerId!.replace("p", ""));
  wins.set(order[winnerSeat], wins.get(order[winnerSeat])! + 1);
}

const played = GAMES - unfinished;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`\nBooks & Runs — AI benchmark (${played} games, ${unfinished} unfinished)\n`);
console.log("  tier      wins   win%   avg final score");
console.log("  --------  -----  -----  ---------------");
for (const d of DIFFICULTIES) {
  const w = wins.get(d)!;
  console.log(
    `  ${d.padEnd(8)}  ${String(w).padStart(5)}  ${((w / played) * 100).toFixed(0).padStart(4)}%  ` +
      `${avg(finalScores.get(d)!).toFixed(0).padStart(6)}`
  );
}
console.log(`\n  avg game length: ${avg(lengths).toFixed(0)} turns\n`);
