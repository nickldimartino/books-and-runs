"use client";

import { useEffect, useRef, useState } from "react";
import { AchievementProgressState, allAchievements } from "@/achievements";
import { ACHIEVEMENT_TIER_XP } from "@/leveling";
import { GameState } from "@/types";
import { useAuth } from "../AuthContext";
import { AchievementUnlockCard, AchievementUnlockItem } from "./AchievementUnlock";
import { useGame } from "../GameContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { loadAchievementProgressState } from "../lib/loadAchievementProgress";
import { recordAchievementProgress } from "../lib/recordAchievementProgress";
import { playAchievementUnlock, playLevelUp } from "../lib/sound";
import { supabase } from "../lib/supabaseClient";

interface RoundSummaryProps {
  state: GameState;
  roundStartScores: Record<string, number>;
  onNextRound: () => void;
}

export function RoundSummary({ state, roundStartScores, onNextRound }: RoundSummaryProps) {
  const { getSessionCounters, clearSessionCounters, isTutorial, trackStats } = useGame();
  const { user } = useAuth();
  const { level, refresh: refreshLevel } = usePlayerLevel();
  const flushedRef = useRef<number | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementUnlockItem[]>([]);
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);
  const wentOut = state.players.find((p) => p.hasMeldedContract && p.hand.length === 0);
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const lowestTotal = Math.min(...state.players.map((p) => p.cumulativeScore));
  const roundLabel = `Round ${state.round}`;
  // Sum of this round's own newly-unlocked achievement tiers — the only XP
  // source that can possibly change mid-round (games played/won and
  // difficulty-win bonuses only ever move at a whole game's end, so there's
  // no separate "unaccounted for" bucket to fall back on the way
  // GameOverScreen needs one for its own, larger set of XP sources).
  const roundXpGained = unlockedAchievements.reduce((sum, item) => sum + item.xp, 0);

  // Flush this round's meld/discard/turn/etc. progress now rather than
  // waiting for the whole game to finish — the game-ending final round never
  // shows this screen at all (game/page.tsx checks gameOver first), so this
  // only ever covers rounds 1..N-1, and GameOverScreen's own flush at the
  // end picks up whatever's left from the last round.
  //
  // Also snapshots achievement progress (and account level) immediately
  // before and after the flush (same technique GameOverScreen already uses
  // for its own XP breakdown and level-up banner) so any newly-unlocked
  // tier — and any level-up it happens to cross — shows up right here
  // instead of waiting for a whole game to finish. That matters beyond just
  // "sooner is nicer": the level change is already real in the account the
  // instant this flush lands, so without this, a level crossed mid-game
  // would sit uncelebrated until GameOverScreen finally ran — or, for
  // anyone who quits partway through instead of finishing all the way to
  // GameOverScreen, never celebrated at all. Best-effort: these extra reads
  // are purely for this on-screen reveal, so a failure here never blocks or
  // retries the actual counter flush above it.
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
    // Read from render scope rather than added as an effect dependency —
    // same reasoning GameOverScreen's own attemptSave uses for its
    // beforeLevel snapshot: this must reflect the level as of the instant
    // this round's flush started, not re-run every time PlayerLevelProvider
    // updates state later (including from this very effect's own refresh()
    // call below).
    const beforeLevel = level?.level ?? 0;

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

      // Refreshes the shared level context too (not just this component's
      // own local comparison) — otherwise a level crossed here left the
      // header's level badge showing the stale pre-level-up number for the
      // rest of the game, only catching up once GameOverScreen ran its own
      // refresh at the very end.
      const afterLevel = await refreshLevel();
      const didLevelUp = !!afterLevel && afterLevel.level > beforeLevel;
      if (didLevelUp) setLeveledUpTo(afterLevel!.level);

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
          setUnlockedAchievements(newly.map((a) => ({ achievement: a, xp: ACHIEVEMENT_TIER_XP[a.tier] })));
        }
        // Same "don't layer two chimes at once" priority GameOverScreen
        // uses for its own overlapping case — a level up already means real
        // progress happened this round, so it takes priority over the
        // smaller achievement ping rather than both firing together.
        if (didLevelUp) {
          playLevelUp();
        } else if (newly.length > 0) {
          playAchievementUnlock();
        }
      } catch (err) {
        console.error("Failed to determine which achievements this round unlocked:", err);
      }
    })();
    // The flushedRef guard (keyed on the round number, not just a boolean)
    // is the real idempotency check — it's what stops a double-flush if
    // this effect re-runs for unrelated reasons while still showing the
    // same round, so getSessionCounters/clearSessionCounters/refreshLevel
    // don't need to be in the dep array for correctness.
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

      {roundXpGained > 0 && (
        <p className="text-center text-sm font-semibold text-[var(--accent)]">
          +{roundXpGained} XP
          {leveledUpTo !== null && (
            <span className="level-up-pulse ml-1 inline-block font-bold">
              — Level up! Now level {leveledUpTo}
            </span>
          )}
        </p>
      )}

      <AchievementUnlockCard
        items={unlockedAchievements}
        heading={`Achievement${unlockedAchievements.length > 1 ? "s" : ""} unlocked this round`}
      />

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
