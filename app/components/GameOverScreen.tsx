"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { allAchievements, tierNumber } from "@/achievements";
import { Difficulty, GameState } from "@/types";
import { ACHIEVEMENT_TIER_XP, DIFFICULTY_WIN_XP, FINISH_GAME_XP, WIN_GAME_XP } from "@/leveling";
import { useAuth } from "../AuthContext";
import { useGame } from "../GameContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { loadAchievementProgressState } from "../lib/loadAchievementProgress";
import { removePendingSave, setActiveForegroundGame, upsertPendingSave } from "../lib/pendingSaveQueue";
import { recordAchievementProgress } from "../lib/recordAchievementProgress";
import { recordGameResult, YOU_PLAYER_ID } from "../lib/recordGameResult";
import { supabase } from "../lib/supabaseClient";

interface XpLineItem {
  label: string;
  amount: number;
}

export function GameOverScreen({ state }: { state: GameState }) {
  const router = useRouter();
  const { quitToHome, roundHistory, getSessionCounters, clearSessionCounters, isTutorial } = useGame();
  const { user } = useAuth();
  const { level, refresh: refreshLevel } = usePlayerLevel();
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const winner = standings[0];
  // Who emptied their hand THIS round (see the identical technique in
  // RoundSummary.tsx) — not necessarily the same person as `winner`, who is
  // whoever has the lowest cumulative score across the whole game. A round
  // can be won by going out while someone else still takes the game on
  // total score, so both need to be shown, even when they're the same
  // player. Undefined in the rare case nobody went out (e.g. the draw pile
  // was exhausted).
  const wentOut = state.players.find((p) => p.hasMeldedContract && p.hand.length === 0);
  const recordedRef = useRef(false);
  // Tracked separately from `saved` so a retry after a partial failure (one
  // write went through, the other didn't) only re-sends the write that
  // actually failed — neither recordGameResult nor recordAchievementProgress
  // is safe to run twice, since each one adds its own deltas on top of
  // whatever's already stored rather than overwriting.
  const gameResultDoneRef = useRef(false);
  const achievementDoneRef = useRef(false);
  // Snapshot of achievement progress from immediately before this game's
  // writes land — captured once (a retry after a partial failure must reuse
  // it, not re-snapshot, or a partially-applied write would look like the
  // pre-game baseline and hide whatever it already unlocked). Used only to
  // name which specific achievements this game unlocked; best-effort — see
  // the fallback in attemptSave if this or the after-snapshot fails.
  const beforeAchievementsRef = useRef<Awaited<ReturnType<typeof loadAchievementProgressState>> | null>(null);
  const [gameId] = useState(() => crypto.randomUUID());
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [xpGained, setXpGained] = useState<number | null>(null);
  const [xpBreakdown, setXpBreakdown] = useState<XpLineItem[]>([]);
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);

  // While this screen is up, it owns retrying its own save — see
  // pendingSaveQueue.ts for why the background sync must not also touch it.
  useEffect(() => {
    setActiveForegroundGame(gameId);
    return () => setActiveForegroundGame(null);
  }, [gameId]);

  const attemptSave = useCallback(async () => {
    if (!supabase || !user) return;
    setSaved("saving");

    // Snapshot pre-game XP/level now — PlayerLevelProvider loads once at
    // sign-in, well before this screen ever mounts, so `level` here is
    // reliably the "before this game" value to diff the refreshed one
    // against once recordGameResult/recordAchievementProgress land.
    const beforeXp = level?.totalXp ?? 0;
    const beforeLevel = level?.level ?? 0;

    if (!beforeAchievementsRef.current) {
      try {
        beforeAchievementsRef.current = await loadAchievementProgressState(supabase, user.id);
      } catch (err) {
        console.error("Failed to snapshot pre-game achievement progress:", err);
      }
    }

    const you = state.players.find((p) => p.id === YOU_PLAYER_ID);
    const counters = { ...getSessionCounters() };
    if (you && you.cumulativeScore === 0) {
      counters.zero_penalty_games = (counters.zero_penalty_games ?? 0) + 1;
    }

    // The per-game XP sources (finishing, winning, difficulty bonus) are
    // fully known from this game alone — matches the exact rule
    // recordGameResult uses for which AI difficulties count toward a win.
    const won = !!you && state.winnerId === you.id;
    const breakdown: XpLineItem[] = [{ label: "Finished the game", amount: FINISH_GAME_XP }];
    if (won) {
      breakdown.push({ label: "Won", amount: WIN_GAME_XP });
      const difficultiesFaced = new Set(
        state.players
          .filter((p) => p.id !== you!.id && p.isAI && p.difficulty)
          .map((p) => p.difficulty as Difficulty)
      );
      for (const d of difficultiesFaced) {
        breakdown.push({ label: `Beat a ${d} AI`, amount: DIFFICULTY_WIN_XP[d] ?? 0 });
      }
    }

    const [gameResult, achievementResult] = await Promise.allSettled([
      gameResultDoneRef.current ? Promise.resolve() : recordGameResult(supabase, user.id, state, roundHistory),
      achievementDoneRef.current ? Promise.resolve() : recordAchievementProgress(supabase, user.id, counters),
    ]);

    // Promise.all's single opaque error made this genuinely undiagnosable
    // from the outside — logging which write failed and why is the only
    // way anyone (developer or a report from a player) can tell a real
    // Supabase/schema problem apart from an actual network blip.
    if (gameResult.status === "fulfilled") {
      gameResultDoneRef.current = true;
    } else {
      console.error("Failed to save game result:", gameResult.reason);
    }
    if (achievementResult.status === "fulfilled") {
      achievementDoneRef.current = true;
    } else {
      console.error("Failed to save achievement progress:", achievementResult.reason);
    }
    if (gameResult.status === "rejected" || achievementResult.status === "rejected") {
      // Not fully saved — queue it so this game's result survives leaving
      // this screen or closing the app. PendingSaveSync retries it once the
      // connection's back, even if this screen never gets revisited.
      upsertPendingSave({
        id: gameId,
        userId: user.id,
        state,
        roundHistory,
        counters,
        gameResultDone: gameResultDoneRef.current,
        achievementDone: achievementDoneRef.current,
      });
      setSaved("error");
      return;
    }

    removePendingSave(gameId);
    setSaved("saved");
    clearSessionCounters();
    const after = await refreshLevel();
    if (after) {
      const gained = Math.max(0, after.totalXp - beforeXp);
      setXpGained(gained);
      // Whatever's left once the known per-game sources are accounted for
      // must be from achievement tiers newly unlocked this game — used as
      // the fallback total if naming them individually below doesn't work
      // out, so the XP is never just silently unaccounted for.
      const knownTotal = breakdown.reduce((sum, item) => sum + item.amount, 0);
      const achievementBonus = Math.max(0, gained - knownTotal);

      let achievementLines: XpLineItem[] = [];
      if (achievementBonus > 0 && beforeAchievementsRef.current) {
        try {
          const afterProgress = await loadAchievementProgressState(supabase, user.id);
          const beforeUnlocked = new Set(
            allAchievements(beforeAchievementsRef.current)
              .filter((a) => a.unlocked)
              .map((a) => `${a.familyId}:${a.tier}`)
          );
          achievementLines = allAchievements(afterProgress)
            .filter((a) => a.unlocked && !beforeUnlocked.has(`${a.familyId}:${a.tier}`))
            .map((a) => ({
              label: `${a.familyTitle} ${tierNumber(a.tier)}`,
              amount: ACHIEVEMENT_TIER_XP[a.tier],
            }));
        } catch (err) {
          console.error("Failed to determine which achievements this game unlocked:", err);
        }
      }

      setXpBreakdown(
        achievementLines.length > 0
          ? [...breakdown, ...achievementLines]
          : achievementBonus > 0
            ? [...breakdown, { label: "Achievements unlocked", amount: achievementBonus }]
            : breakdown
      );
      if (after.level > beforeLevel) setLeveledUpTo(after.level);
    }
    // `level` is only read for the before/after diff — it must not retrigger
    // a fresh save as PlayerLevelProvider's own state updates after refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, roundHistory, user, getSessionCounters, clearSessionCounters, refreshLevel, gameId]);

  useEffect(() => {
    // Tutorial games are scripted practice — never touch Supabase, so they
    // can't inflate stats/achievements or count toward "games played."
    if (recordedRef.current || !supabase || !user || isTutorial) return;
    recordedRef.current = true;
    attemptSave();
  }, [user, isTutorial, attemptSave]);

  function playAgain() {
    quitToHome();
    router.push("/new-game");
  }

  function goHome() {
    quitToHome();
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">
          {isTutorial ? "Tutorial complete" : "Game over"}
        </p>
        {!isTutorial && wentOut && (
          <p className="mt-1 text-base font-semibold text-[var(--muted)]">{wentOut.name} went out!</p>
        )}
        <h1 className="mt-1 text-3xl font-bold text-[var(--heading)]">
          {isTutorial ? "Nice work!" : `${winner.name} won!`}
        </h1>
        {isTutorial && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            You just played a full round — draw, meld, discard, and everything in between. This
            practice round didn&apos;t count toward your stats or achievements. Ready for a real
            game?
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {standings.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-[var(--panel)] px-4 py-3"
          >
            <span className="font-medium">
              {i + 1}. {p.name}
            </span>
            <span className="font-semibold text-[var(--heading)]">{p.cumulativeScore} pts</span>
          </li>
        ))}
      </ol>

      {isTutorial && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
          <p className="font-semibold text-[var(--heading)]">How scoring works</p>
          <p className="mt-1">
            Lower is better. Only cards left in your hand when the round ends count against
            you — anything melded or laid off is free. In a full game, whoever has the lowest
            total score after every round wins.
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <li>3 – 9: 5 pts each</li>
            <li>10, J, Q, K: 10 pts each</li>
            <li>Ace: 15 pts each</li>
            <li>Wild (2): 20 pts each</li>
            <li>Joker: 50 pts each</li>
          </ul>
        </div>
      )}

      {!isTutorial && user && (
        <div className="text-center text-xs text-[var(--faint)]">
          <p>
            {saved === "saving" && "Saving to your stats…"}
            {saved === "saved" && "Saved to your stats."}
            {saved === "error" && "Couldn't save to your stats — check your connection."}
          </p>
          {saved === "error" && (
            <button
              onClick={() => attemptSave()}
              className="mt-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              Try again
            </button>
          )}
          {saved === "saved" && xpGained !== null && (
            <div className="mt-1">
              <p className="text-sm font-semibold text-[var(--accent)]">
                +{xpGained} XP{leveledUpTo !== null && ` — Level up! Now level ${leveledUpTo}`}
              </p>
              {xpBreakdown.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {xpBreakdown.map((item, i) => (
                    <li key={i}>
                      +{item.amount} XP — {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <button
          onClick={playAgain}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
        >
          {isTutorial ? "Play a real game" : "Play again"}
        </button>
        <button
          onClick={goHome}
          className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Home
        </button>
      </div>
    </main>
  );
}
