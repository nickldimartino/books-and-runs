"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "../GameContext";
import { loadLocalSettings } from "../lib/settingsStore";
import { PlayerConfig } from "@/gameEngine";
import { CONTRACTS, ContractRequirement, Difficulty, SHORT_GAME_CONTRACTS } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const MAX_PLAYERS = 8;

type RoundMode = "all" | "short" | "custom";

export default function NewGamePage() {
  const router = useRouter();
  const { startNewGame } = useGame();
  const [humanCount, setHumanCount] = useState(1);
  const [aiDifficulties, setAiDifficulties] = useState<Difficulty[]>(["medium"]);
  const [defaultDifficulty, setDefaultDifficulty] = useState<Difficulty>("medium");
  const [roundMode, setRoundMode] = useState<RoundMode>("all");
  const [customRounds, setCustomRounds] = useState<Set<number>>(
    () => new Set(CONTRACTS.map((c) => c.round))
  );

  // Pick up the house-rule default from Settings once mounted (before the
  // player has had a chance to touch the AI difficulty picker themselves).
  useEffect(() => {
    const preferred = loadLocalSettings().preferredAiDifficulty;
    setDefaultDifficulty(preferred);
    setAiDifficulties([preferred]);
  }, []);

  const totalPlayers = humanCount + aiDifficulties.length;
  const selectedContracts: ContractRequirement[] =
    roundMode === "all"
      ? CONTRACTS
      : roundMode === "short"
        ? SHORT_GAME_CONTRACTS
        : CONTRACTS.filter((c) => customRounds.has(c.round));
  const canStart =
    totalPlayers >= 2 && totalPlayers <= MAX_PLAYERS && selectedContracts.length > 0;

  const humanNames = useMemo(
    () => Array.from({ length: humanCount }, (_, i) => (i === 0 ? "You" : `Player ${i + 1}`)),
    [humanCount]
  );

  function toggleCustomRound(round: number) {
    setCustomRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  }

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
    startNewGame(configs, selectedContracts);
    router.push("/game");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <h1 className="text-2xl font-bold text-[var(--heading)]">New Game</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
          Human players (pass-and-play)
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHumanCount((n) => Math.max(1, n - 1))}
            className="h-10 w-10 rounded-full bg-[var(--elevated)] text-lg font-bold text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
            aria-label="Fewer human players"
          >
            −
          </button>
          <span className="w-6 text-center text-xl font-semibold">{humanCount}</span>
          <button
            onClick={() => setHumanCount((n) => Math.min(MAX_PLAYERS - aiDifficulties.length, n + 1))}
            className="h-10 w-10 rounded-full bg-[var(--elevated)] text-lg font-bold text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
            aria-label="More human players"
          >
            +
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
            AI opponents
          </h2>
          <button
            onClick={addAI}
            disabled={totalPlayers >= MAX_PLAYERS}
            className="rounded-md bg-[var(--elevated)] px-3 py-1 text-sm font-medium text-[var(--heading)] hover:bg-[var(--elevated-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add AI
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {aiDifficulties.map((difficulty, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel)] px-3 py-2"
            >
              <span className="text-sm text-[var(--muted)]">AI {i + 1}</span>
              <select
                value={difficulty}
                onChange={(e) => setAIDifficulty(i, e.target.value as Difficulty)}
                className="rounded-md bg-[var(--panel-soft)] px-2 py-1 text-sm capitalize text-[var(--heading)]"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d} className="capitalize">
                    {d}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeAI(i)}
                className="text-sm text-[var(--danger)] hover:opacity-80"
                aria-label={`Remove AI ${i + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
          {aiDifficulties.length === 0 && (
            <p className="text-sm text-[var(--faint)]">No AI opponents — human players only.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
          Rounds
        </h2>
        <div className="flex gap-2">
          {(
            [
              ["all", "All 7"],
              ["short", "Short"],
              ["custom", "Custom"],
            ] as [RoundMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setRoundMode(mode)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                roundMode === mode
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {roundMode === "short" && (
          <p className="text-xs text-[var(--faint)]">
            Drops the two hardest mixed rounds — 2 Books + 1 Run, and 1 Book + 2 Runs.
          </p>
        )}
        {roundMode === "custom" && (
          <div className="flex flex-col gap-1">
            {CONTRACTS.map((c) => {
              const checked = customRounds.has(c.round);
              return (
                <button
                  key={c.round}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleCustomRound(c.round)}
                  className="flex w-full items-center gap-2 rounded-md bg-[var(--panel)] px-3 py-2 text-left text-sm text-[var(--muted)]"
                >
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--border)] bg-transparent"
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 16 16" className="h-3 w-3">
                        <path
                          d="M3 8.5l3 3 7-7"
                          fill="none"
                          stroke="var(--on-accent)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  Round {c.round}: {c.label}
                </button>
              );
            })}
            {selectedContracts.length === 0 && (
              <p className="text-xs text-[var(--accent)]">Pick at least one round.</p>
            )}
          </div>
        )}
      </section>

      {!canStart && (
        <p className="text-sm text-[var(--accent)]">
          {selectedContracts.length === 0
            ? "Pick at least one round to start."
            : `Need between 2 and ${MAX_PLAYERS} total players to start.`}
        </p>
      )}

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="mt-auto rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start Game
      </button>
    </main>
  );
}
