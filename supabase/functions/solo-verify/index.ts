// Books & Runs — solo/pass-and-play verification Edge Function.
//
// The server-side half of "record what happened locally, then verify the
// whole game once it's over" (see CODEBASE_MAP.md and the plan this shipped
// from). A solo/pass-and-play game has no server referee while it's being
// played — the engine runs entirely in the browser, for full offline play —
// so this is where that trust gap actually closes: at game-over, the client
// sends its seed + move log, this function independently replays the exact
// same game through the real engine (src/solo/replay.ts, bundled below),
// and only a replay that holds up end-to-end gets written to the account's
// stats at all. Nothing about the outcome — final score, who won, which
// achievement counters moved — is ever taken on the client's word.
//
// Deploy:  node scripts/bundle-solo-verify-engine.mjs && supabase functions deploy solo-verify
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.)

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { computePlayerStatsUpdate, PlayerStatsFields } from "../_shared/playerStats.ts";
// ./_engine is a copy of src/ with explicit .ts extensions — the Supabase
// deploy bundler doesn't resolve the app's extension-less imports. Run
// `node scripts/bundle-solo-verify-engine.mjs` before every deploy.
import { PlayerConfig } from "./_engine/gameEngine.ts";
import { MoveLogEntry } from "./_engine/moveLog.ts";
import { finalGameDeltas, mergeDeltas, tableCompositionDeltas } from "./_engine/replayStats.ts";
import { replaySoloGame } from "./_engine/solo/replay.ts";
import { ContractRequirement, Difficulty, YOU_PLAYER_ID } from "./_engine/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const AI_DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"];
const VALID_ROUNDS = [1, 2, 3, 4, 5, 6, 7];
// Generous floor, not a real pacing model — a real human cannot finish
// even the fastest legitimate game (a 2-player, 1-round Daily-Deal-style
// game) in under this; see this constant's own use for what it actually
// guards against.
const MIN_MS_BETWEEN_GAMES = 10_000;

/** "Ann" / "Ann & Bo" / "Ann, Bo & Cy" — for naming a tied-for-first group
 * in game_history.winner. Same tiny helper as app/lib/formatNames.ts;
 * duplicated rather than shared since it's the only piece of app/lib this
 * function needs and isn't part of the src/ bundle. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// ── request body validation ─────────────────────────────────────────────
// Lightweight sanitization at the boundary, same spirit as mp/index.ts's
// handleCreate — replaySoloGame itself is the real authority on whether a
// move log actually holds up (every field it reads gets checked against
// live game state via strict equality, so a malformed/wrong-typed field
// just fails that check rather than corrupting anything), this just keeps
// obviously-wrong requests from reaching it at all.

function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && AI_DIFFICULTIES.includes(v);
}

function cleanSeats(raw: unknown): PlayerConfig[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 8) return null;
  const seats: PlayerConfig[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") return null;
    const { id, name, isAI, difficulty } = s as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || typeof isAI !== "boolean") return null;
    if (difficulty !== undefined && !isDifficulty(difficulty)) return null;
    seats.push({ id, name: name.slice(0, 60), isAI, difficulty: difficulty as Difficulty | undefined });
  }
  // At most one seat may be the tracked account — zero is legitimate (a
  // table with no owner-linked human, e.g. spectating pass-and-play; see
  // handleVerify's own "no tracked seat" no-op), but two would mean a
  // malformed/tampered payload, since the real client only ever assigns
  // YOU_PLAYER_ID to a single slot 0 seat.
  if (seats.filter((s) => s.id === YOU_PLAYER_ID).length > 1) return null;
  return seats;
}

function cleanContracts(raw: unknown): ContractRequirement[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 7) return null;
  const contracts: ContractRequirement[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") return null;
    const { round, books, runs, bookSize, runSize, label, wholeHandMeld } = c as Record<string, unknown>;
    if (
      typeof round !== "number" ||
      !VALID_ROUNDS.includes(round) ||
      typeof books !== "number" ||
      typeof runs !== "number" ||
      typeof bookSize !== "number" ||
      typeof runSize !== "number" ||
      typeof label !== "string" ||
      typeof wholeHandMeld !== "boolean"
    ) {
      return null;
    }
    contracts.push({ round, books, runs, bookSize, runSize, label: label.slice(0, 40), wholeHandMeld });
  }
  return contracts;
}

/** Only a coarse array-of-objects check — replaySoloGame's own switch over
 * `entry.type` is what actually validates each entry's shape (an
 * unexpected type falls to its `default` branch; a wrong-typed field on an
 * otherwise-valid entry just fails the relevant strict-equality check
 * against live state, same reasoning as this file's own doc above). */
function cleanMoveLog(raw: unknown): MoveLogEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20000) return null;
  for (const e of raw) {
    if (!e || typeof e !== "object" || typeof (e as Record<string, unknown>).type !== "string") return null;
  }
  return raw as MoveLogEntry[];
}

interface RoundHistoryEntry {
  round: number;
  totals: Record<string, number>;
}

function cleanRoundHistory(raw: unknown): RoundHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is RoundHistoryEntry =>
      !!r && typeof r === "object" && typeof (r as RoundHistoryEntry).round === "number" && !!(r as RoundHistoryEntry).totals
  );
}

// ── Daily Deal streak integrity ─────────────────────────────────────────
// A verified completion just inserts one (user_id, date) row — the
// leaderboard_entries streak columns are recomputed from these by a
// trigger (migration 0036), the same "server silently overwrites whatever
// the client pushes" pattern migration 0035 already uses for level/XP.
// Before this, the only record of "did this account actually play today's
// deal" was three plain client-writable columns on leaderboard_entries
// (daily_deal_streak/daily_deal_best_streak/daily_deal_last_played) — a
// signed-in account could push any streak it wanted directly.

// Same tiny djb2 hash as dailyDealStore.ts's own dateSeed — duplicated
// rather than shared since it's the one piece of that file this function
// needs and dailyDealStore.ts isn't part of the src/ bundle.
function dateSeed(dateKey: string): number {
  let hash = 5381;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 33) ^ dateKey.charCodeAt(i);
  }
  return hash >>> 0;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Not a precise check — "local calendar day" is inherently a client-side
 * concept, and dateSeed can't be reversed to recover the date it came from
 * — just generous enough tolerance (timezone skew plus the local-vs-UTC
 * day boundary) to reject a wildly different claimed date (last month,
 * next year) while never falsely rejecting a real player's actual today. */
function isBelievableDailyDealDate(dateKey: string): boolean {
  if (!DATE_KEY_RE.test(dateKey)) return false;
  const claimed = new Date(`${dateKey}T00:00:00Z`).getTime();
  if (Number.isNaN(claimed)) return false;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return Math.abs(Date.now() - claimed) <= 2 * ONE_DAY_MS;
}

async function handleDailyDealCompletion(uid: string, seed: number, rawDateKey: unknown): Promise<Response> {
  const dailyDealDateKey = typeof rawDateKey === "string" ? rawDateKey : "";
  if (!isBelievableDailyDealDate(dailyDealDateKey)) {
    return json({ ok: false, error: "invalid Daily Deal date" }, 400);
  }
  if (dateSeed(dailyDealDateKey) !== seed) {
    return json({ ok: false, error: "seed doesn't match the claimed Daily Deal date" }, 400);
  }
  const { error } = await admin
    .from("daily_deal_completions")
    .upsert({ user_id: uid, date: dailyDealDateKey }, { onConflict: "user_id,date", ignoreDuplicates: true });
  if (error) return json({ ok: false, error: "couldn't record the completion" }, 500);
  return json({ ok: true, dailyDeal: true });
}

// ── Weekly Challenge streak integrity ───────────────────────────────────
// Same pattern as Daily Deal's, one week key instead of one date key — see
// migration 0039 for the (user_id, week) ground-truth table and trigger.

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

/** Same generous-tolerance reasoning as isBelievableDailyDealDate, widened
 * to a week either side — "local ISO week" is just as much a client-side
 * concept as "local calendar day," and a week is a bigger window to have
 * clock/timezone skew land near an edge of. */
function isBelievableWeeklyChallengeWeek(weekKey: string): boolean {
  if (!WEEK_KEY_RE.test(weekKey)) return false;
  const [y, w] = weekKey.split("-W").map(Number);
  if (w < 1 || w > 53) return false;
  // Approximate the week's start (good enough for a tolerance check, not
  // used for anything exact) from the ISO year/week number.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4IsoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4IsoDay - 1));
  const claimedWeekStart = new Date(week1Monday);
  claimedWeekStart.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7);
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  return Math.abs(Date.now() - claimedWeekStart.getTime()) <= 2 * ONE_WEEK_MS;
}

async function handleWeeklyChallengeCompletion(uid: string, seed: number, rawWeekKey: unknown): Promise<Response> {
  const weekKey = typeof rawWeekKey === "string" ? rawWeekKey : "";
  if (!isBelievableWeeklyChallengeWeek(weekKey)) {
    return json({ ok: false, error: "invalid Weekly Challenge week" }, 400);
  }
  // Same djb2 hash as dailyDealStore.ts's dateSeed / weeklyChallengeStore.ts's
  // weekSeed — it only ever hashes a string, so the one copy above covers both.
  if (dateSeed(weekKey) !== seed) {
    return json({ ok: false, error: "seed doesn't match the claimed Weekly Challenge week" }, 400);
  }
  const { error } = await admin
    .from("weekly_challenge_completions")
    .upsert({ user_id: uid, week: weekKey }, { onConflict: "user_id,week", ignoreDuplicates: true });
  if (error) return json({ ok: false, error: "couldn't record the completion" }, 500);
  return json({ ok: true, weeklyChallenge: true });
}

// ── stats derivation + writes ───────────────────────────────────────────

interface AchievementCountersRow {
  counters: Record<string, number>;
}

async function handleVerify(uid: string, body: Record<string, unknown>): Promise<Response> {
  const seed = Number(body.seed);
  const seats = cleanSeats(body.seats);
  const selectedContracts = cleanContracts(body.selectedContracts);
  const moveLog = cleanMoveLog(body.moveLog);
  const roundHistory = cleanRoundHistory(body.roundHistory);
  const trackStats = body.trackStats !== false;

  if (!seats || !selectedContracts || !moveLog) {
    return json({ ok: false, error: "malformed verification payload" }, 400);
  }

  const result = replaySoloGame(seed, seats, selectedContracts, moveLog);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  const { state } = result;
  const you = state.players.find((p) => p.id === YOU_PLAYER_ID);
  // A legitimately verified game with no owner-linked seat at all (see
  // cleanSeats) — nothing to record, same as recordGameResult.ts's own
  // early return for this today. Not an error: the replay held up fine.
  if (!you) return json({ ok: true, tracked: false });

  // The account this replay is being recorded against must genuinely be
  // the one that played it — the JWT identifies who's calling, but nothing
  // above ties that identity to seat 0 on its own (the seat's own `id`
  // field is just the fixed string "human-0", not this caller's uid).
  // There's no cryptographic binding to break here, though: uid is only
  // ever used below as the row key for uid's *own* player_stats/
  // achievement_counters/game_history — every write already lands under
  // whichever account's JWT this request carries, so there's nothing a
  // caller could redirect by lying about seats.

  // Daily Deal never counted toward player_stats/achievement_counters (see
  // dailyDealStore.ts's own doc) — a verified completion here only ever
  // records attendance toward the streak, nothing else.
  if (body.isDailyDeal === true) return await handleDailyDealCompletion(uid, seed, body.dailyDealDateKey);
  if (body.isWeeklyChallenge === true) {
    return await handleWeeklyChallengeCompletion(uid, seed, body.weeklyChallengeWeekKey);
  }

  if (!trackStats) return json({ ok: true, tracked: false });

  const lowestScore = Math.min(...state.players.map((p) => p.cumulativeScore));
  const winners = state.players.filter((p) => p.cumulativeScore === lowestScore);
  const won = winners.length === 1 && you.cumulativeScore === lowestScore;
  const tied = winners.length > 1 && you.cumulativeScore === lowestScore;
  const opponents = state.players
    .filter((p) => p.id !== you.id)
    .map((p) => ({ name: p.name, difficulty: p.isAI ? p.difficulty ?? null : null }));

  const { data: existingStats, error: statsSelectError } = await admin
    .from("player_stats")
    .select("games_played, games_won, games_tied, best_score, worst_score, average_score, wins_by_difficulty, updated_at")
    .eq("user_id", uid)
    .maybeSingle<PlayerStatsFields & { updated_at: string | null }>();
  if (statsSelectError) return json({ ok: false, error: "couldn't read current stats" }, 500);

  // A real game — even a fast, short, 2-player one — takes a real human
  // meaningfully longer than this to actually play through the UI. Replay
  // verification alone only proves a submission is a *legal* game; it
  // can't tell a script that generated one offline (the engine is ordinary
  // client-side JS, replicable outside the app) from one someone actually
  // played, so this bounds how often *credited* games can land for one
  // account at all, on top of that. Checked before any write — a
  // rate-limited submission changes nothing, so there's nothing to queue
  // or retry for it.
  if (existingStats?.updated_at) {
    const sinceLastGameMs = Date.now() - new Date(existingStats.updated_at).getTime();
    if (sinceLastGameMs < MIN_MS_BETWEEN_GAMES) {
      return json({ ok: false, error: "too many games recorded too quickly — try again shortly" }, 429);
    }
  }

  const update = computePlayerStatsUpdate(existingStats, you.cumulativeScore, won, tied, opponents);

  const { error: statsUpsertError } = await admin.from("player_stats").upsert({
    user_id: uid,
    ...update,
    updated_at: new Date().toISOString(),
  });
  if (statsUpsertError) return json({ ok: false, error: "couldn't save stats" }, 500);

  const { error: historyInsertError } = await admin.from("game_history").insert({
    user_id: uid,
    opponents,
    rounds: roundHistory,
    winner:
      winners.length > 1 ? `${joinNames(winners.map((p) => p.name))} (tied)` : (winners[0]?.name ?? "unknown"),
    winner_score: lowestScore,
  });
  if (historyInsertError) return json({ ok: false, error: "couldn't save game history" }, 500);

  // Achievement counters: per-move deltas already accumulated by the
  // replay itself (result.counterDeltas), plus the two things a replay
  // alone can't credit — table composition (known from the seat list, not
  // any move) and the flat "finished with zero penalty" bonus (known from
  // the final score alone).
  const counters = { ...result.counterDeltas };
  mergeDeltas(counters, tableCompositionDeltas(seats));
  mergeDeltas(counters, finalGameDeltas(you.cumulativeScore));

  const deltaEntries = Object.entries(counters).filter(([, v]) => v !== 0);
  if (deltaEntries.length > 0) {
    const { data: existingCounters, error: countersSelectError } = await admin
      .from("achievement_counters")
      .select("counters")
      .eq("user_id", uid)
      .maybeSingle<AchievementCountersRow>();
    if (countersSelectError) return json({ ok: false, error: "couldn't read achievement progress" }, 500);

    const merged: Record<string, number> = { ...(existingCounters?.counters ?? {}) };
    for (const [key, delta] of deltaEntries) merged[key] = (merged[key] ?? 0) + delta;

    const { error: countersUpsertError } = await admin.from("achievement_counters").upsert({
      user_id: uid,
      counters: merged,
      updated_at: new Date().toISOString(),
    });
    if (countersUpsertError) return json({ ok: false, error: "couldn't save achievement progress" }, 500);
  }

  return json({ ok: true, tracked: true, won, tied });
}

// ── entrypoint ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sign in first" }, 401);
  const userClient: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "sign in first" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "malformed request" }, 400);
  }

  try {
    return await handleVerify(user.id, body);
  } catch (e) {
    console.error("solo-verify function error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "something went wrong" }, 400);
  }
});
