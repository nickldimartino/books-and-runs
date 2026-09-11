// "My usual" — one saved solo / pass-and-play setup the player can re-deal
// in a tap instead of walking the New Game form every time. Per-device,
// localStorage only (like theme and sound): a saved lineup is a
// convenience, not account data worth syncing. Stores the *form* choices
// (counts, names, difficulties, round mode) rather than a dealt GameState
// — every "Play my usual" deals a fresh game, fresh AI personas and all.

import { pickAiPersonas } from "./aiPersonas";
import { PlayerConfig } from "@/gameEngine";
import { CONTRACTS, ContractRequirement, Difficulty, SHORT_GAME_CONTRACTS } from "@/types";

const KEY = "booksAndRuns:favoriteGame";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
export type RoundMode = "all" | "short" | "custom";

export interface FavoriteGameConfig {
  humanCount: number;
  humanNames: string[];
  aiDifficulties: Difficulty[];
  roundMode: RoundMode;
  /** Only meaningful when roundMode === "custom". */
  customRounds: number[];
}

function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && (DIFFICULTIES as string[]).includes(v);
}

/** Defensive parse — a hand-edited or half-written localStorage value should
 * quietly read as "no favorite saved", never crash the setup page. */
function looksValid(v: unknown): v is FavoriteGameConfig {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  if (typeof c.humanCount !== "number" || c.humanCount < 1 || c.humanCount > 8) return false;
  if (!Array.isArray(c.humanNames) || c.humanNames.some((n) => typeof n !== "string")) return false;
  if (!Array.isArray(c.aiDifficulties) || !c.aiDifficulties.every(isDifficulty)) return false;
  if (c.roundMode !== "all" && c.roundMode !== "short" && c.roundMode !== "custom") return false;
  if (!Array.isArray(c.customRounds) || c.customRounds.some((r) => typeof r !== "number")) return false;
  if (c.humanCount + c.aiDifficulties.length < 2 || c.humanCount + c.aiDifficulties.length > 8) return false;
  return true;
}

export function loadFavoriteGameConfig(): FavoriteGameConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return looksValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveFavoriteGameConfig(config: FavoriteGameConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // storage unavailable/full — the quick-start is a nicety, not required
  }
}

export function clearFavoriteGameConfig(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function contractsFor(
  roundMode: RoundMode,
  customRounds: Set<number> | number[]
): ContractRequirement[] {
  if (roundMode === "all") return CONTRACTS;
  if (roundMode === "short") return SHORT_GAME_CONTRACTS;
  const set = customRounds instanceof Set ? customRounds : new Set(customRounds);
  return CONTRACTS.filter((c) => set.has(c.round));
}

/** Turn a saved / current lineup into the PlayerConfig[] GameContext deals
 * from. AI personas are picked fresh here, so every deal — including "Play
 * my usual" — gets a new set of faces. */
export function playerConfigsFor(
  humanNames: string[],
  aiDifficulties: Difficulty[]
): PlayerConfig[] {
  const personas = pickAiPersonas(aiDifficulties);
  return [
    ...humanNames.map((name, i) => ({
      id: `human-${i}`,
      name: name.trim() || (i === 0 ? "You" : `Player ${i + 1}`),
      isAI: false,
    })),
    ...aiDifficulties.map((difficulty, i) => ({
      id: `ai-${i}`,
      name: personas[i].displayName,
      isAI: true,
      difficulty,
    })),
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "You + 3 Hard AI · Short game" — the one-line summary shown on the
 * "Play my usual" card so the player can tell at a glance it's the lineup
 * they meant. */
export function describeFavoriteGameConfig(c: FavoriteGameConfig): string {
  const parts: string[] = [];

  const firstName = c.humanNames[0]?.trim() || "You";
  if (c.humanCount === 1) parts.push(firstName);
  else parts.push(`${c.humanCount} players`);

  if (c.aiDifficulties.length > 0) {
    // Group same-difficulty AI: "2 Hard + 1 Easy AI".
    const byDiff = new Map<Difficulty, number>();
    for (const d of c.aiDifficulties) byDiff.set(d, (byDiff.get(d) ?? 0) + 1);
    const grouped = [...byDiff.entries()].map(([d, n]) => `${n} ${capitalize(d)}`).join(" + ");
    parts.push(`${grouped} AI`);
  }

  const lineup = parts.join(" + ");

  const rounds =
    c.roundMode === "all"
      ? "All 7 rounds"
      : c.roundMode === "short"
        ? "Short game"
        : `${c.customRounds.filter((r) => CONTRACTS.some((cc) => cc.round === r)).length} rounds`;

  return `${lineup} · ${rounds}`;
}
