"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useGame } from "../GameContext";
import { loadLocalSettings } from "../lib/settingsStore";
import { PlayerConfig } from "@/gameEngine";
import { CONTRACTS, ContractRequirement, Difficulty, SHORT_GAME_CONTRACTS } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const MAX_PLAYERS = 8;

type RoundMode = "all" | "short" | "custom" | "tutorial";

export default function NewGamePage() {
  const router = useRouter();
  const { startNewGame, startTutorialGame } = useGame();
  const [humanCount, setHumanCount] = useState(1);
  const [humanNames, setHumanNames] = useState<string[]>(["You"]);
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
        : roundMode === "custom"
          ? CONTRACTS.filter((c) => customRounds.has(c.round))
          : [CONTRACTS[1]]; // tutorial: always "1 Book + 1 Run"
  const canStart =
    roundMode === "tutorial"
      ? true
      : totalPlayers >= 2 && totalPlayers <= MAX_PLAYERS && selectedContracts.length > 0;

  // Grows/shrinks the editable name list to match humanCount without
  // clobbering names already typed into the slots that stick around.
  function resizeHumanNames(count: number) {
    setHumanNames((prev) => {
      if (prev.length === count) return prev;
      if (prev.length < count) {
        const additions = Array.from(
          { length: count - prev.length },
          (_, i) => `Player ${prev.length + i + 1}`
        );
        return [...prev, ...additions];
      }
      return prev.slice(0, count);
    });
  }

  function setHumanCountAndResize(next: number) {
    setHumanCount(next);
    resizeHumanNames(next);
  }

  function setHumanName(index: number, name: string) {
    setHumanNames((prev) => prev.map((n, i) => (i === index ? name : n)));
  }

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
    if (roundMode === "tutorial") {
      startTutorialGame();
      router.push("/game");
      return;
    }
    // Only number AI names when there's more than one AI total — with a
    // single AI, plain "Medium AI" reads better than "Medium AI 1". Numbers
    // are per-difficulty (two Easy AIs are "Easy AI 1"/"Easy AI 2" even
    // alongside a "Medium AI 1"), not a single running count across all AIs.
    const seenByDifficulty: Partial<Record<Difficulty, number>> = {};
    const configs: PlayerConfig[] = [
      ...humanNames.map((name, i) => ({
        id: `human-${i}`,
        name: name.trim() || (i === 0 ? "You" : `Player ${i + 1}`),
        isAI: false,
      })),
      ...aiDifficulties.map((difficulty, i) => {
        seenByDifficulty[difficulty] = (seenByDifficulty[difficulty] ?? 0) + 1;
        const label = `${difficulty[0].toUpperCase()}${difficulty.slice(1)} AI`;
        return {
          id: `ai-${i}`,
          name: aiDifficulties.length > 1 ? `${label} ${seenByDifficulty[difficulty]}` : label,
          isAI: true,
          difficulty,
        };
      }),
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

      {roundMode === "tutorial" ? (
        <section className="flex flex-col gap-2 rounded-lg bg-[var(--panel)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
            Players
          </h2>
          <p className="text-sm text-[var(--muted)]">
            The tutorial is fixed to you vs. one Beginner AI, so the walkthrough always plays out
            the same way. Player and round settings are back once you start a real game.
          </p>
        </section>
      ) : (
        <>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
          Human players (pass-and-play)
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHumanCountAndResize(Math.max(1, humanCount - 1))}
            className="h-10 w-10 rounded-full bg-[var(--elevated)] text-lg font-bold text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
            aria-label="Fewer human players"
          >
            −
          </button>
          <span className="w-6 text-center text-xl font-semibold">{humanCount}</span>
          <button
            onClick={() =>
              setHumanCountAndResize(Math.min(MAX_PLAYERS - aiDifficulties.length, humanCount + 1))
            }
            className="h-10 w-10 rounded-full bg-[var(--elevated)] text-lg font-bold text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
            aria-label="More human players"
          >
            +
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {humanNames.map((name, i) => (
            <input
              key={i}
              type="text"
              value={name}
              onChange={(e) => setHumanName(i, e.target.value)}
              placeholder={i === 0 ? "You" : `Player ${i + 1}`}
              maxLength={20}
              className="rounded-md bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-1 ring-transparent focus:ring-[var(--accent)]"
            />
          ))}
        </div>
        <p className="text-xs text-[var(--faint)]">
          Names are just for this game and this device — they don&apos;t affect your signed-in
          account.
        </p>
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
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
          Rounds
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All 7"],
              ["short", "Short"],
              ["custom", "Custom"],
              ["tutorial", "Tutorial"],
            ] as [RoundMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setRoundMode(mode)}
              className={`min-w-[calc(50%-0.25rem)] flex-1 rounded-md px-3 py-2 text-sm font-medium ${
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
        {roundMode === "tutorial" && (
          <p className="text-xs text-[var(--faint)]">
            A short, guided round — 1 Book + 1 Run — that walks you through drawing, melding, and
            discarding step by step. Every helper feature (lay-off hints, player activity, etc.)
            is turned on just for this game, even if you&apos;ve turned any of them off in
            Settings. Doesn&apos;t count toward your stats or achievements.
          </p>
        )}
        {roundMode === "custom" && (
          <div className="flex flex-col gap-2">
            {CONTRACTS.map((c) => {
              const checked = customRounds.has(c.round);
              return (
                <button
                  key={c.round}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleCustomRound(c.round)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md bg-[var(--panel)] px-3 py-3 text-left text-sm text-[var(--muted)]"
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--border)] bg-transparent"
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
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
        {roundMode === "tutorial" ? "Start Tutorial" : "Start Game"}
      </button>

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
