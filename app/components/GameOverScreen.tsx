"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GameState } from "@/types";
import { useAuth } from "../AuthContext";
import { useGame } from "../GameContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { recordAchievementProgress } from "../lib/recordAchievementProgress";
import { recordGameResult, YOU_PLAYER_ID } from "../lib/recordGameResult";
import { supabase } from "../lib/supabaseClient";

export function GameOverScreen({ state }: { state: GameState }) {
  const router = useRouter();
  const { quitToHome, roundHistory, getSessionCounters } = useGame();
  const { user } = useAuth();
  const { level, refresh: refreshLevel } = usePlayerLevel();
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const winner = standings[0];
  const recordedRef = useRef(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [xpGained, setXpGained] = useState<number | null>(null);
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);

  useEffect(() => {
    if (recordedRef.current || !supabase || !user) return;
    recordedRef.current = true;
    setSaved("saving");

    // Snapshot pre-game XP/level now — PlayerLevelProvider loads once at
    // sign-in, well before this screen ever mounts, so `level` here is
    // reliably the "before this game" value to diff the refreshed one
    // against once recordGameResult/recordAchievementProgress land.
    const beforeXp = level?.totalXp ?? 0;
    const beforeLevel = level?.level ?? 0;

    const you = state.players.find((p) => p.id === YOU_PLAYER_ID);
    const counters = { ...getSessionCounters() };
    if (you && you.cumulativeScore === 0) {
      counters.zero_penalty_games = (counters.zero_penalty_games ?? 0) + 1;
    }

    Promise.all([
      recordGameResult(supabase, user.id, state, roundHistory),
      recordAchievementProgress(supabase, user.id, counters),
    ])
      .then(async () => {
        setSaved("saved");
        const after = await refreshLevel();
        if (after) {
          setXpGained(Math.max(0, after.totalXp - beforeXp));
          if (after.level > beforeLevel) setLeveledUpTo(after.level);
        }
      })
      .catch(() => setSaved("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `level` is only
    // read once, at mount, for the before/after diff — it must not retrigger
    // this effect as PlayerLevelProvider's own state updates after refresh().
  }, [state, roundHistory, user, getSessionCounters, refreshLevel]);

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
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">Game over</p>
        <h1 className="mt-1 text-3xl font-bold text-[var(--heading)]">{winner.name} won!</h1>
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

      {user && (
        <div className="text-center text-xs text-[var(--faint)]">
          <p>
            {saved === "saving" && "Saving to your stats…"}
            {saved === "saved" && "Saved to your stats."}
            {saved === "error" && "Couldn't save to your stats — check your connection."}
          </p>
          {saved === "saved" && xpGained !== null && (
            <p className="mt-1 text-sm font-semibold text-[var(--accent)]">
              +{xpGained} XP{leveledUpTo !== null && ` — Level up! Now level ${leveledUpTo}`}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <button
          onClick={playAgain}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
        >
          Play again
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
