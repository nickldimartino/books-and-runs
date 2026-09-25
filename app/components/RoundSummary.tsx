"use client";

// The panel shown between rounds (dismissable) in the solo/pass-and-play
// game screen: each player's round score and running total, and where
// mid-game achievement/level unlocks are surfaced. player_stats/
// achievement_counters only ever change once, at game-over, via a
// server-verified replay (see GameOverScreen and
// supabase/functions/solo-verify) — nothing here writes anything. This
// instead builds a local *estimate* of that eventual write (the real
// persisted progress, plus this game's own session counters merged on top)
// so an achievement or level crossed mid-game still gets celebrated here
// rather than only once the whole game ends.

import { useEffect, useRef, useState } from "react";
import { AchievementProgressState, allAchievements } from "@/achievements";
import { ACHIEVEMENT_TIER_XP, levelProgress } from "@/leveling";
import { GameState } from "@/types";
import { useAuth } from "../AuthContext";
import { AchievementUnlockCard, AchievementUnlockItem } from "./AchievementUnlock";
import { useGame } from "../GameContext";
import { useT } from "../lib/i18n/LocaleProvider";
import { diffAchievementProgress, estimateProgress } from "../lib/achievementUnlockDiff";
import { loadAchievementProgressState } from "../lib/loadAchievementProgress";
import { playAchievementUnlock, playLevelUp } from "../lib/sound";
import { supabase } from "../lib/supabaseClient";

interface RoundSummaryProps {
  state: GameState;
  roundStartScores: Record<string, number>;
  onNextRound: () => void;
}

export function RoundSummary({ state, roundStartScores, onNextRound }: RoundSummaryProps) {
  const { t, tPlural } = useT();
  const { getSessionCounters, isTutorial, trackStats } = useGame();
  const { user } = useAuth();
  const flushedRef = useRef<number | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementUnlockItem[]>([]);
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);
  const wentOut = state.players.find((p) => p.hasMeldedContract && p.hand.length === 0);
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const lowestTotal = Math.min(...state.players.map((p) => p.cumulativeScore));
  // Sum of this round's own newly-unlocked achievement tiers — the only XP
  // source that can possibly change mid-round (games played/won and
  // difficulty-win bonuses only ever move at a whole game's end, so there's
  // no separate "unaccounted for" bucket to fall back on the way
  // GameOverScreen needs one for its own, larger set of XP sources).
  const roundXpGained = unlockedAchievements.reduce((sum, item) => sum + item.xp, 0);

  // Estimate this round's meld/discard/turn/etc. progress against the real
  // persisted baseline now, rather than waiting for the whole game to
  // finish — the game-ending final round never shows this screen at all
  // (game/page.tsx checks gameOver first), so this only ever covers rounds
  // 1..N-1; the real write happens once, at game-over, from the full game
  // (see GameOverScreen). Session counters are deliberately never cleared
  // here (they still are at the start of a new game) — each round's
  // estimate needs the *cumulative* total across every round played so
  // far, added on top of the same unchanged persisted baseline, since
  // nothing about that baseline moves mid-game any more.
  //
  // That matters beyond just "sooner is nicer": without this, an
  // achievement or level crossed mid-game would sit uncelebrated until
  // GameOverScreen finally ran — or, for anyone who quits partway through
  // instead of finishing all the way to GameOverScreen, never celebrated
  // at all.
  useEffect(() => {
    // Tutorial games never touch Supabase — this shouldn't be reachable for
    // the current single-round tutorial (game/page.tsx checks gameOver
    // before roundOver, and a 1-round game sets both at once), but it's
    // cheap insurance against that changing later. trackStats is New Game's
    // own "Track stats for this game" opt-out (offered for 3+ pass-and-play
    // human players) — same rule as isTutorial: skip the estimate outright
    // rather than name progress the player explicitly asked not to track.
    if (!supabase || !user || isTutorial || !trackStats || flushedRef.current === state.round) return;
    flushedRef.current = state.round;
    const client = supabase;
    const userId = user.id;
    const sessionDeltas = getSessionCounters();
    // Reset before recomputing — otherwise a round that unlocks nothing new
    // still shows the previous round's "unlocked this round" card, since
    // the setters below only ever fire on an actual new unlock/level-up,
    // never on the empty case.
    setUnlockedAchievements([]);
    setLeveledUpTo(null);

    (async () => {
      let before: AchievementProgressState | null = null;
      try {
        before = await loadAchievementProgressState(client, userId);
      } catch (err) {
        console.error("Failed to load achievement progress for this round's estimate:", err);
        return;
      }
      if (!before) return;

      const diff = diffAchievementProgress(before, estimateProgress(before, sessionDeltas));
      if (diff.leveledUpTo !== null) setLeveledUpTo(diff.leveledUpTo);
      const newly = diff.newlyUnlocked;
      if (newly.length > 0) setUnlockedAchievements(newly);
      // Same "don't layer two chimes at once" priority GameOverScreen uses
      // for its own overlapping case — a level up already means real
      // progress happened this round, so it takes priority over the
      // smaller achievement ping rather than both firing together.
      if (diff.leveledUpTo !== null) {
        playLevelUp();
      } else if (newly.length > 0) {
        playAchievementUnlock();
      }
    })();
    // The flushedRef guard (keyed on the round number, not just a boolean)
    // is the real idempotency check — it's what stops this effect running
    // twice for the same round if it re-runs for unrelated reasons while
    // still showing the same round, so getSessionCounters doesn't need to
    // be in the dep array for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round, user, isTutorial, trackStats]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">{t("roundSummary.complete", { round: state.round })}</p>
        {wentOut && (
          <h1 className="mt-1 break-words text-2xl font-bold text-[var(--heading)]">{t("roundSummary.wentOut", { name: wentOut.name })}</h1>
        )}
      </div>

      {roundXpGained > 0 && (
        <p className="text-center text-sm font-semibold text-[var(--accent)]">
          {t("roundSummary.xpGained", { xp: roundXpGained })}
          {leveledUpTo !== null && (
            <span className="level-up-pulse ml-1 inline-block font-bold">
              {t("roundSummary.levelUp", { level: leveledUpTo })}
            </span>
          )}
        </p>
      )}

      <AchievementUnlockCard
        items={unlockedAchievements}
        heading={tPlural("roundSummary.achievementsUnlocked", unlockedAchievements.length)}
      />

      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel)] text-[var(--faint)]">
            <tr>
              <th className="px-4 py-2 font-medium">{t("roundSummary.player")}</th>
              <th className="px-4 py-2 font-medium">{t("roundSummary.thisRound")}</th>
              <th className="px-4 py-2 font-medium">{t("roundSummary.total")}</th>
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
                        {t("roundSummary.leading")}
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
        {t("roundSummary.startNextRound")}
      </button>
    </main>
  );
}
