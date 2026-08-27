"use client";

import { useEffect, useRef } from "react";
import { GameState } from "@/types";
import { useAuth } from "../AuthContext";
import { useGame } from "../GameContext";
import { recordAchievementProgress } from "../lib/recordAchievementProgress";
import { supabase } from "../lib/supabaseClient";

interface RoundSummaryProps {
  state: GameState;
  roundStartScores: Record<string, number>;
  onNextRound: () => void;
}

export function RoundSummary({ state, roundStartScores, onNextRound }: RoundSummaryProps) {
  const { getSessionCounters, clearSessionCounters, isTutorial } = useGame();
  const { user } = useAuth();
  const flushedRef = useRef<number | null>(null);
  const wentOut = state.players.find((p) => p.hasMeldedContract && p.hand.length === 0);
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const lowestTotal = Math.min(...state.players.map((p) => p.cumulativeScore));
  const roundLabel = `Round ${state.round}`;

  // Flush this round's meld/discard/turn/etc. progress now rather than
  // waiting for the whole game to finish — the game-ending final round never
  // shows this screen at all (game/page.tsx checks gameOver first), so this
  // only ever covers rounds 1..N-1, and GameOverScreen's own flush at the
  // end picks up whatever's left from the last round.
  useEffect(() => {
    // Tutorial games never touch Supabase — this shouldn't be reachable for
    // the current single-round tutorial (game/page.tsx checks gameOver
    // before roundOver, and a 1-round game sets both at once), but it's
    // cheap insurance against that changing later.
    if (!supabase || !user || isTutorial || flushedRef.current === state.round) return;
    flushedRef.current = state.round;
    const counters = { ...getSessionCounters() };
    recordAchievementProgress(supabase, user.id, counters)
      .then(() => clearSessionCounters())
      .catch(() => {});
    // The flushedRef guard (keyed on the round number, not just a boolean)
    // is the real idempotency check — it's what stops a double-flush if
    // this effect re-runs for unrelated reasons while still showing the
    // same round, so getSessionCounters/clearSessionCounters don't need to
    // be in the dep array for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round, user, isTutorial]);

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
            {standings.map((p) => {
              // Lowest cumulative score is the overall game lead — distinct
              // from `wentOut` (this round's winner) above, which can be a
              // different player entirely. Without this, the only way to
              // tell who's actually ahead in the game was to manually scan
              // Total for the smallest number; the Scorekeeper and
              // GameOverScreen already made their equivalent "who's winning"
              // signal this obvious, this table was the one place that didn't.
              const isLeading = p.cumulativeScore === lowestTotal;
              return (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2">
                    {p.name}
                    {isLeading && (
                      <span className="ml-1.5 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                        Leading
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    +{p.cumulativeScore - (roundStartScores[p.id] ?? 0)}
                  </td>
                  <td
                    className={`px-4 py-2 font-semibold ${isLeading ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}
                  >
                    {p.cumulativeScore}
                  </td>
                </tr>
              );
            })}
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
