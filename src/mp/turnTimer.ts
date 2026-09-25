// Turn clock for async multiplayer — pure rules, shared by the `mp` Edge
// Function (enforcement) and the UI (countdown badge, New Game picker).
//
// Model: every dealt human-vs-human game has a per-turn limit chosen by the
// host (off / 24h / 48h / 72h, default 72h). The clock starts whenever the
// turn passes to a human seat (mp_games.turn_started_at). Enforcement is lazy
// (any read/move of the game) plus a scheduled sweep:
//   - at 75% of the limit the waiting player gets one reminder push;
//   - at 100% the FIRST miss auto-plays that seat's turn (draw from the
//     stock, discard the least useful high card) so the game keeps moving;
//   - a second miss in a row (no real move in between) forfeits the seat with
//     the normal resign semantics (RESIGN_PENALTY, seat skipped, game
//     force-ended if fewer than two humans remain).
// Any real move by the player resets their miss count to zero.

export const TURN_LIMIT_OPTIONS = [0, 24, 48, 72] as const;
export type TurnLimitHours = (typeof TURN_LIMIT_OPTIONS)[number];
export const DEFAULT_TURN_LIMIT_HOURS: TurnLimitHours = 72;
/** 0 (= "no limit") is a valid, explicit choice. */
export const NO_TURN_LIMIT = 0;

/** Fraction of the limit after which the reminder push goes out. */
export const WARN_FRACTION = 0.75;
/** Consecutive missed turns that forfeit a seat. */
export const MAX_MISSED_TURNS = 2;
/** A pending (unaccepted) invite older than this is auto-cancelled. */
export const PENDING_INVITE_TTL_HOURS = 24 * 7;
/** Nudge cooldown per game, in hours (matches mp_nudge in migration 0017). */
export const NUDGE_COOLDOWN_HOURS = 6;

const HOUR_MS = 3_600_000;

/** Validates a client-supplied limit. Missing/garbage → the default; an
 * explicit 0 means "no limit". */
export function normalizeTurnLimit(v: unknown): TurnLimitHours {
  if (typeof v === "number" && (TURN_LIMIT_OPTIONS as readonly number[]).includes(v)) return v as TurnLimitHours;
  return DEFAULT_TURN_LIMIT_HOURS;
}

export type TimerPhase = "off" | "ok" | "warn" | "expired";

export interface TimerState {
  phase: TimerPhase;
  /** Milliseconds left (never negative); 0 when off/expired. */
  remainingMs: number;
  deadlineMs: number | null;
}

export function timerState(nowMs: number, turnStartedMs: number | null, limitHours: number | null): TimerState {
  if (!limitHours || limitHours <= 0 || turnStartedMs == null || !Number.isFinite(turnStartedMs)) {
    return { phase: "off", remainingMs: 0, deadlineMs: null };
  }
  const total = limitHours * HOUR_MS;
  const deadlineMs = turnStartedMs + total;
  const remainingMs = Math.max(0, deadlineMs - nowMs);
  if (remainingMs === 0) return { phase: "expired", remainingMs, deadlineMs };
  const phase: TimerPhase = nowMs - turnStartedMs >= total * WARN_FRACTION ? "warn" : "ok";
  return { phase, remainingMs, deadlineMs };
}

export type ExpiryAction = "autoplay" | "resign";

/** What to do when a seat's clock runs out, given how many turns it has
 * already missed in a row (before this one). */
export function expiryAction(missedBefore: number): ExpiryAction {
  return missedBefore + 1 >= MAX_MISSED_TURNS ? "resign" : "autoplay";
}

export interface Remaining {
  unit: "days" | "hours" | "minutes";
  value: number;
}

/** Rounds up so "0h" is never shown while time is left. */
export function formatRemaining(ms: number): Remaining {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return { unit: "minutes", value: minutes };
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return { unit: "hours", value: hours };
  return { unit: "days", value: Math.ceil(hours / 24) };
}
