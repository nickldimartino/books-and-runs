"use client";

import { useEffect, useRef, useState } from "react";
import { AchievementInstance, AchievementProgressState, allAchievements, tierNumber } from "@/achievements";
import { GameState } from "@/types";
import { useAuth } from "../AuthContext";
import { AchievementIcon } from "./AchievementIcons";
import { useGame } from "../GameContext";
import { formatAchievementProgress } from "../lib/achievementFormat";
import { loadAchievementProgressState } from "../lib/loadAchievementProgress";
import { recordAchievementProgress } from "../lib/recordAchievementProgress";
import { playAchievementUnlock } from "../lib/sound";
import { supabase } from "../lib/supabaseClient";

interface RoundSummaryProps {
  state: GameState;
  roundStartScores: Record<string, number>;
  onNextRound: () => void;
}

export function RoundSummary({ state, roundStartScores, onNextRound }: RoundSummaryProps) {
  const { getSessionCounters, clearSessionCounters, isTutorial, trackStats } = useGame();
  const { user } = useAuth();
  const flushedRef = useRef<number | null>(null);
  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementInstance[]>([]);
  const wentOut = state.players.find((p) => p.hasMeldedContract && p.hand.length === 0);
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const lowestTotal = Math.min(...state.players.map((p) => p.cumulativeScore));
  const roundLabel = `Round ${state.round}`;

  // Flush this round's meld/discard/turn/etc. progress now rather than
  // waiting for the whole game to finish — the game-ending final round never
  // shows this screen at all (game/page.tsx checks gameOver first), so this
  // only ever covers rounds 1..N-1, and GameOverScreen's own flush at the
  // end picks up whatever's left from the last round.
  //
  // Also snapshots achievement progress immediately before and after the
  // flush (same technique GameOverScreen already uses for its own XP
  // breakdown) so any newly-unlocked tier can be shown right here — a
  // player used to only finding out what they'd unlocked at the very end of
  // a whole game now sees it after every round instead. Best-effort: these
  // two extra reads are purely for this on-screen reveal, so a failure here
  // never blocks or retries the actual counter flush above it.
  useEffect(() => {
    // Tutorial games never touch Supabase — this shouldn't be reachable for
    // the current single-round tutorial (game/page.tsx checks gameOver
    // before roundOver, and a 1-round game sets both at once), but it's
    // cheap insurance against that changing later. trackStats is New Game's
    // own "Track stats for this game" opt-out (offered for 3+ pass-and-play
    // human players) — same rule as isTutorial: skip the write outright
    // rather than record something the player explicitly asked not to.
    if (!supabase || !user || isTutorial || !trackStats || flushedRef.current === state.round) return;
    flushedRef.current = state.round;
    const client = supabase;
    const userId = user.id;
    const counters = { ...getSessionCounters() };

    (async () => {
      let before: AchievementProgressState | null = null;
      try {
        before = await loadAchievementProgressState(client, userId);
      } catch (err) {
        console.error("Failed to snapshot achievement progress before this round's flush:", err);
      }

      try {
        await recordAchievementProgress(client, userId, counters);
        clearSessionCounters();
      } catch {
        // recordAchievementProgress's own errors are already surfaced
        // elsewhere (it's re-attempted at game-over) — nothing new to do
        // with one here, and definitely nothing to name as "unlocked" from
        // a flush that never actually landed.
        return;
      }

      if (!before) return;
      try {
        const after = await loadAchievementProgressState(client, userId);
        const beforeUnlocked = new Set(
          allAchievements(before)
            .filter((a) => a.unlocked)
            .map((a) => `${a.familyId}:${a.tier}`)
        );
        const newly = allAchievements(after).filter(
          (a) => a.unlocked && !beforeUnlocked.has(`${a.familyId}:${a.tier}`)
        );
        if (newly.length > 0) {
          setNewlyUnlocked(newly);
          playAchievementUnlock();
        }
      } catch (err) {
        console.error("Failed to determine which achievements this round unlocked:", err);
      }
    })();
    // The flushedRef guard (keyed on the round number, not just a boolean)
    // is the real idempotency check — it's what stops a double-flush if
    // this effect re-runs for unrelated reasons while still showing the
    // same round, so getSessionCounters/clearSessionCounters don't need to
    // be in the dep array for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round, user, isTutorial, trackStats]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">{roundLabel} complete</p>
        {wentOut && (
          <h1 className="mt-1 text-2xl font-bold text-[var(--heading)]">{wentOut.name} went out!</h1>
        )}
      </div>

      {newlyUnlocked.length > 0 && (
        <div className="rounded-xl bg-[var(--accent)]/10 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Achievement{newlyUnlocked.length > 1 ? "s" : ""} unlocked this round
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {newlyUnlocked.map((a) => (
              // A native <details> per achievement — same tap-to-expand
              // disclosure pattern used everywhere else in this app (Home's
              // "More" section, Settings' InfoDetails) — so tapping one
              // reveals what it actually took to unlock it (the same
              // "X / threshold unit" phrasing the Achievements page itself
              // uses — see formatAchievementProgress) without navigating
              // away from this screen.
              <li key={`${a.familyId}-${a.tier}`}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-[var(--heading)] [&::-webkit-details-marker]:hidden">
                    <AchievementIcon category={a.category} className="h-5 w-5 shrink-0 text-[var(--accent)]" />
                    <span className="flex-1">
                      {a.familyTitle} {tierNumber(a.tier)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-xs text-[var(--faint)] transition group-open:rotate-180"
                    >
                      ▼
                    </span>
                  </summary>
                  <p className="mt-1 pl-7 text-xs text-[var(--faint)]">{formatAchievementProgress(a)}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

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
