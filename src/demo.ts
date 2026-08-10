import { playAITurn } from "./ai/index";
import { createGame, startNextRound } from "./gameEngine";
import { CONTRACTS, Difficulty } from "./types";

const difficulties: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];

let state = createGame(
  difficulties.map((d, i) => ({ id: `p${i}`, name: d, isAI: true, difficulty: d }))
);

let safety = 0;
const MAX_TURNS = 20000;

while (!state.gameOver && safety < MAX_TURNS) {
  playAITurn(state);
  safety++;
  if (safety % 1000 === 0) {
    console.log(
      `  ...turn ${safety}, round ${state.round}, draw pile ${state.drawPile.length}, discard pile ${state.discardPile.length}, melded: ${state.players.map((p) => p.hasMeldedContract).join(",")}`
    );
  }

  if (state.roundOver && !state.gameOver) {
    console.log(
      `Round ${state.round} (${CONTRACTS[state.round - 1].label}) ended after ${safety} total turns.`
    );
    for (const p of state.players) {
      console.log(`  ${p.name}: ${p.cumulativeScore} pts`);
    }
    state = startNextRound(state);
  }
}

if (state.gameOver) {
  console.log(`\nGame over after ${safety} turns.`);
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  standings.forEach((p, i) => console.log(`${i + 1}. ${p.name} — ${p.cumulativeScore} pts`));
  console.log(`\nWinner: ${state.players.find((p) => p.id === state.winnerId)?.name}`);
} else {
  console.log(`Did not finish within ${MAX_TURNS} turns — likely a stuck loop, needs debugging.`);
}
