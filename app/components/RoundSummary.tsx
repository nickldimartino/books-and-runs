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
  const roundLabel = `Round ${state.round}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">{roundLabel} complete</p>
        {wentOut && (
          <h1 className="mt-1 text-2xl font-bold text-[var(--heading)]">{wentOut.name} went out!</h1>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel)] text-[var(--faint)]">
            <tr>
              <th className="px-4 py-2 font-medium">Player</th>
              <th className="px-4 py-2 font-medium">This round</th>
              <th className="px-4 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)]">
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
        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
      >
        Start next round
      </button>
    </main>
  );
}
