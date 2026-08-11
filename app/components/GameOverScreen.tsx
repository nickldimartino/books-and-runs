"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GameState } from "@/types";
import { useAuth } from "../AuthContext";
import { useGame } from "../GameContext";
import { recordGameResult } from "../lib/recordGameResult";
import { supabase } from "../lib/supabaseClient";

export function GameOverScreen({ state }: { state: GameState }) {
  const router = useRouter();
  const { quitToHome, roundHistory } = useGame();
  const { user } = useAuth();
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const winner = standings[0];
  const recordedRef = useRef(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (recordedRef.current || !supabase || !user) return;
    recordedRef.current = true;
    setSaved("saving");
    recordGameResult(supabase, user.id, state, roundHistory)
      .then(() => setSaved("saved"))
      .catch(() => setSaved("error"));
  }, [state, roundHistory, user]);

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
        <p className="text-center text-xs text-[var(--faint)]">
          {saved === "saving" && "Saving to your stats…"}
          {saved === "saved" && "Saved to your stats."}
          {saved === "error" && "Couldn't save to your stats — check your connection."}
        </p>
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
