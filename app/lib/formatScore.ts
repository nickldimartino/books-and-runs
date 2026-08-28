/**
 * "47" for a whole number, "47.6" for anything fractional, "—" for null.
 * Shared by the Stats and Leaderboard pages specifically so a possibly-
 * fractional score (average score, worst score) can never show two
 * different numbers for the same underlying value depending on which page
 * you're looking at it from — Stats used to round this with Math.round(),
 * which silently disagreed with the Leaderboard's more precise display for
 * the exact same account's average_score.
 */
export function formatScore(value: number | null): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
