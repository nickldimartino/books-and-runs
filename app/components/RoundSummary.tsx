"use client";

import { GameState } from "@/types";

interface RoundSummaryProps {
  state: GameState;
  roundStartScores: Record<string, number>;
  onNextRound: () => void;
}

export function RoundSummary({ state, roundStartScores, onNextRound }: RoundSummaryProps) {
  const wentOut = state.players.find((p) => p.hasMeldedContract && p.hand.length === 0);
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const roundLabel = state.round <= 7 ? `Round ${state.round}` : "Final round";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-emerald-100/60">{roundLabel} complete</p>
        {wentOut && (
          <h1 className="mt-1 text-2xl font-bold text-amber-100">{wentOut.name} went out!</h1>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-100/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-emerald-900/60 text-emerald-100/60">
            <tr>
              <th className="px-4 py-2 font-medium">Player</th>
              <th className="px-4 py-2 font-medium">This round</th>
              <th className="px-4 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((p) => (
              <tr key={p.id} className="border-t border-emerald-100/10">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">
                  +{p.cumulativeScore - (roundStartScores[p.id] ?? 0)}
                </td>
                <td className="px-4 py-2 font-semibold">{p.cumulativeScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={onNextRound}
        className="rounded-lg bg-amber-400 px-6 py-3 text-base font-semibold text-emerald-950 shadow-lg transition hover:bg-amber-300"
      >
        Start next round
      </button>
    </main>
  );
}
