"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "../GameContext";
import { loadLocalSettings } from "../lib/settingsStore";
import { PlayerConfig } from "@/gameEngine";
import { Difficulty } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const MAX_PLAYERS = 8;

export default function NewGamePage() {
  const router = useRouter();
  const { startNewGame } = useGame();
  const [humanCount, setHumanCount] = useState(1);
  const [aiDifficulties, setAiDifficulties] = useState<Difficulty[]>(["medium"]);
  const [defaultDifficulty, setDefaultDifficulty] = useState<Difficulty>("medium");

  // Pick up the house-rule default from Settings once mounted (before the
  // player has had a chance to touch the AI difficulty picker themselves).
  useEffect(() => {
    const preferred = loadLocalSettings().preferredAiDifficulty;
    setDefaultDifficulty(preferred);
    setAiDifficulties([preferred]);
  }, []);

  const totalPlayers = humanCount + aiDifficulties.length;
  const canStart = totalPlayers >= 2 && totalPlayers <= MAX_PLAYERS;

  const humanNames = useMemo(
    () => Array.from({ length: humanCount }, (_, i) => (i === 0 ? "You" : `Player ${i + 1}`)),
    [humanCount]
  );

  function addAI() {
    if (totalPlayers >= MAX_PLAYERS) return;
    setAiDifficulties((prev) => [...prev, defaultDifficulty]);
  }

  function removeAI(index: number) {
    setAiDifficulties((prev) => prev.filter((_, i) => i !== index));
  }

  function setAIDifficulty(index: number, difficulty: Difficulty) {
    setAiDifficulties((prev) => prev.map((d, i) => (i === index ? difficulty : d)));
  }

  function handleStart() {
    if (!canStart) return;
    const configs: PlayerConfig[] = [
      ...humanNames.map((name, i) => ({ id: `human-${i}`, name, isAI: false })),
      ...aiDifficulties.map((difficulty, i) => ({
        id: `ai-${i}`,
        name: `${difficulty[0].toUpperCase()}${difficulty.slice(1)} AI`,
        isAI: true,
        difficulty,
      })),
    ];
    startNewGame(configs);
    router.push("/game");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-emerald-100/20 px-3 py-1.5 text-xs font-medium text-emerald-100/80 hover:bg-emerald-900/40"
      >
        ← Home
      </Link>

      <h1 className="text-2xl font-bold text-amber-100">New Game</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100/60">
          Human players (pass-and-play)
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHumanCount((n) => Math.max(1, n - 1))}
            className="h-10 w-10 rounded-full bg-emerald-800 text-lg font-bold text-amber-100 hover:bg-emerald-700"
            aria-label="Fewer human players"
          >
            −
          </button>
          <span className="w-6 text-center text-xl font-semibold">{humanCount}</span>
          <button
            onClick={() => setHumanCount((n) => Math.min(MAX_PLAYERS - aiDifficulties.length, n + 1))}
            className="h-10 w-10 rounded-full bg-emerald-800 text-lg font-bold text-amber-100 hover:bg-emerald-700"
            aria-label="More human players"
          >
            +
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100/60">
            AI opponents
          </h2>
          <button
            onClick={addAI}
            disabled={totalPlayers >= MAX_PLAYERS}
            className="rounded-md bg-emerald-800 px-3 py-1 text-sm font-medium text-amber-100 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add AI
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {aiDifficulties.map((difficulty, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg bg-emerald-900/60 px-3 py-2"
            >
              <span className="text-sm text-emerald-100/80">AI {i + 1}</span>
              <select
                value={difficulty}
                onChange={(e) => setAIDifficulty(i, e.target.value as Difficulty)}
                className="rounded-md bg-emerald-950 px-2 py-1 text-sm capitalize text-amber-100"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d} className="capitalize">
                    {d}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeAI(i)}
                className="text-sm text-red-300 hover:text-red-200"
                aria-label={`Remove AI ${i + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
          {aiDifficulties.length === 0 && (
            <p className="text-sm text-emerald-100/50">No AI opponents — human players only.</p>
          )}
        </div>
      </section>

      {!canStart && (
        <p className="text-sm text-amber-300">
          Need between 2 and {MAX_PLAYERS} total players to start.
        </p>
      )}

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="mt-auto rounded-lg bg-amber-400 px-6 py-3 text-base font-semibold text-emerald-950 shadow-lg transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start Game
      </button>
    </main>
  );
}
