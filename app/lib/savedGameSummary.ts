// One-line descriptions of the saved solo / pass-and-play game, shared by
// Home's Play zone and "Your games" list. Reads straight from the raw saved
// state (GameContext only has a game loaded once continueGame() has run).

import { GameState } from "@/types";
import type { TranslationKey } from "./i18n/keys";
import { capitalize } from "./text";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;
type TPlural = (key: string, count: number, vars?: Record<string, string | number>) => string;

/** "Solo" (you vs AI) or "Pass & play" (2+ humans on one device). */
export function savedGameMode(state: GameState, t: T): string {
  const humanCount = state.players.filter((p) => !p.isAI).length;
  return humanCount > 1 ? t("home.passAndPlay") : t("home.solo");
}

/** "Round 3 of 7 · vs. Medium AI" — enough context to decide whether to jump
 * back in without loading the game first. */
export function summarizeSavedGame(state: GameState, t: T, tPlural: TPlural): string {
  const ais = state.players.filter((p) => p.isAI);
  const humanCount = state.players.length - ais.length;
  const parts: string[] = [];
  if (humanCount > 1) parts.push(tPlural("home.nPlayers", humanCount));
  if (ais.length === 1) {
    parts.push(t("home.vsDifficultyAi", { difficulty: capitalize(t(`common.difficulty.${ais[0].difficulty ?? "medium"}` as TranslationKey)) }));
  } else if (ais.length > 1) {
    parts.push(tPlural("home.vsAiOpponents", ais.length));
  }
  // Joined with a space, not a comma — "2 players vs. 2 AI opponents" reads
  // as one phrase.
  return `${t("game.roundOf", { round: state.round, total: state.selectedContracts.length })}${parts.length ? " · " + parts.join(" ") : ""}`;
}
