// Books & Runs — multiplayer Edge Function.
//
// One deployed function, path-routed: /mp/create /mp/respond /mp/cancel
// /mp/state /mp/move /mp/resign, plus /mp/nudge,
// /mp/resign_all (account deletion), /mp/friend_push and the cron-only
// /mp/sweep (turn clock). It is the ONLY thing that reads or writes
// mp_game_state (the sealed full state + deck) — every client gets back a
// redacted view. All real game logic lives in ../../../src/mp/adapter.ts,
// which is pure and unit-tested; this file is auth + DB + wiring.
//
// Deploy:  supabase functions deploy mp
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.)

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
// Deno's npm compat — sends the actual Web Push HTTP request (VAPID auth +
// aes128gcm payload encryption) so this doesn't need a hand-rolled crypto
// implementation. Pinned exact, same convention as every other dep here.
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, json } from "../_shared/cors.ts";
import { computePlayerStatsUpdate, PlayerStatsFields } from "../_shared/playerStats.ts";
import {
  buildPushPayload,
  PUSH_CATEGORY,
  PUSH_HOURLY_CAP,
  PushKind,
  PushPrefs,
  PushVars,
  shouldPush,
  underFrequencyCap,
} from "../_shared/push.ts";
// ./_engine is a copy of src/ with explicit .ts extensions — the Supabase
// deploy bundler doesn't resolve the app's extension-less imports. Run
// `node scripts/bundle-mp-engine.mjs` before every deploy.
import {
  applyCommit,
  applyDiscard,
  applyDraw,
  applyLayoff,
  applyMeld,
  applyResign,
  dealGame,
  publicColumns,
  redactFor,
  RESIGN_PENALTY,
} from "./_engine/mp/adapter.ts";
import { MpConfig, MpEngine } from "./_engine/mp/types.ts";
import { autoPlayTurn } from "./_engine/mp/autoPlay.ts";
import {
  expiryAction,
  NUDGE_COOLDOWN_HOURS,
  normalizeTurnLimit,
  PENDING_INVITE_TTL_HOURS,
  timerState,
} from "./_engine/mp/turnTimer.ts";
import { splitMoveDeltas } from "./_engine/mp/credit.ts";
import { layOffOptions } from "./_engine/meld.ts";
import {
  CounterDeltas,
  discardDeltas,
  drawDeltas,
  meldDeltas,
  layOffDeltas,
  mergeDeltas,
  roundWonDeltas,
} from "./_engine/replayStats.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Push notifications ("your turn" etc. — see addEvent/sendPush
// below) are entirely optional: unset either of these (a project that
// hasn't run `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...`
// yet) and every push send is just skipped, same as a missing RPC elsewhere
// in this file. VAPID_SUBJECT identifies the sender to push services per
// spec — a mailto: or https: URL; defaults to something generic rather than
// failing outright if it's not set.
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@booksandruns.app";
const PUSH_ENABLED = !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY;
if (PUSH_ENABLED) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const MP_GAME_CAP = 3;
const VALID_ROUNDS = [1, 2, 3, 4, 5, 6, 7];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── helpers ──────────────────────────────────────────────────────────────

function placeholderName(userId: string): string {
  const hex = userId.replace(/-/g, "").slice(-4) || "0000";
  return `Player ${parseInt(hex, 16) % 10000}`;
}

async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await admin
    .from("leaderboard_entries")
    .select("user_id, display_name")
    .in("user_id", ids);
  for (const id of ids) {
    const row = data?.find((r) => r.user_id === id);
    out.set(id, row?.display_name?.trim() || placeholderName(id));
  }
  return out;
}

async function areFriends(a: string, b: string): Promise<boolean> {
  // Both ids are validated as UUIDs by the caller. Use parameterized `.in()`
  // filters rather than interpolating into a `.or()` string — a value with
  // `,`/`(`/`)` in it could otherwise rewrite the filter (PostgREST filter
  // injection). requester_id <> addressee_id is a table CHECK, so matching
  // "both endpoints in {a,b}" can only be the (a,b) or (b,a) row.
  if (!isUuid(a) || !isUuid(b)) return false;
  const { data } = await admin
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .in("requester_id", [a, b])
    .in("addressee_id", [a, b]);
  return (data ?? []).some(
    (r) =>
      (r.requester_id === a && r.addressee_id === b) ||
      (r.requester_id === b && r.addressee_id === a)
  );
}

async function activeCount(uid: string): Promise<number> {
  const { data: parts } = await admin
    .from("mp_participants")
    .select("game_id")
    .eq("user_id", uid)
    .in("invite_status", ["invited", "accepted"]);
  const gameIds = (parts ?? []).map((p) => p.game_id);
  if (gameIds.length === 0) return 0;
  const { count } = await admin
    .from("mp_games")
    .select("id", { count: "exact", head: true })
    .in("id", gameIds)
    .in("status", ["pending", "active"]);
  return count ?? 0;
}

async function isBlockedPair(a: string, b: string): Promise<boolean> {
  if (!isUuid(a) || !isUuid(b)) return false;
  const { data } = await admin
    .from("user_blocks")
    .select("blocker_id")
    .in("blocker_id", [a, b])
    .in("blocked_id", [a, b])
    .limit(1);
  // Table missing (0060 not run yet) → error → data null → not blocked.
  return (data?.length ?? 0) > 0;
}

// ── push ─────────────────────────────────────────────────────────────────
// Which kinds push, in whose language, with what name/round, and whether the
// recipient's category switches / quiet hours / hourly cap allow it all live
// in ../_shared/push.ts (pure + unit-tested). friend_accepted and the like
// stay inbox-only unless a caller asks for them explicitly.

const PUSH_KINDS = Object.keys(PUSH_CATEGORY);
const SOCIAL_KINDS: PushKind[] = ["nudge", "game_request", "friend_request", "friend_accepted"];

async function loadPushPrefs(userId: string): Promise<PushPrefs | null> {
  const full = await admin
    .from("settings")
    .select("notify_turns, notify_invites, notify_nudges, notify_streaks, quiet_hours_start, quiet_hours_end, tz_offset_minutes, language")
    .eq("user_id", userId)
    .maybeSingle();
  if (!full.error) return (full.data as PushPrefs) ?? null;
  // 0062 not applied yet — still localise by language if 0055 is.
  const lang = await admin.from("settings").select("language").eq("user_id", userId).maybeSingle();
  return (lang.data as PushPrefs) ?? null;
}

interface PushExtra {
  round?: number | null;
  hours?: number | null;
}

async function sendPush(
  userId: string,
  kind: PushKind,
  gameId: string | null,
  actorId: string | null,
  extra: PushExtra = {}
): Promise<void> {
  if (!PUSH_ENABLED) return;
  // Social pushes respect blocks; gameplay ones (your_turn, clock warnings)
  // don't — a block must never stop you learning it's your move.
  if (actorId && SOCIAL_KINDS.includes(kind) && (await isBlockedPair(userId, actorId))) return;

  const prefs = await loadPushPrefs(userId);
  if (shouldPush(prefs, kind, Date.now()) !== "send") return;

  const { count } = await admin
    .from("mp_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("kind", PUSH_KINDS)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if (!underFrequencyCap(count ?? 0, PUSH_HOURLY_CAP)) return;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  const actorName = actorId ? (await resolveNames([actorId])).get(actorId) ?? null : null;
  const payload = JSON.stringify(
    buildPushPayload(kind, prefs?.language, { name: actorName, ...extra } as PushVars, gameId)
  );

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload);
      } catch (err) {
        // 404/410 means the push service has permanently discarded this
        // endpoint (uninstalled, permission revoked, browser data cleared)
        // — clean it up rather than retrying it forever. Anything else is
        // logged and swallowed: a push failure must never fail the game
        // action (move/create/respond) that triggered it.
        const status = (err as { statusCode?: number } | null)?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error(`push send failed for ${kind}:`, err);
        }
      }
    })
  );
}

async function addEvent(
  userId: string,
  kind: string,
  gameId: string | null,
  actorId: string | null,
  extra: PushExtra = {}
) {
  await admin.from("mp_events").insert({ user_id: userId, kind, game_id: gameId, actor_id: actorId });
  // Keep each user's inbox bounded — it's only ever read as "recent unseen"
  // (see useNotifications). Trim to the newest ~40 per user on write; a
  // periodic sweep (migration 0014) is the backstop for inactive accounts.
  await admin.rpc("mp_trim_events", { p_user: userId, p_keep: 40 }).then(
    () => {},
    () => {}, // RPC not deployed yet → no-op, the cron sweep still covers it
  );
  // Best-effort, never blocks the caller's own response on a push failure.
  if (PUSH_KINDS.includes(kind)) {
    await sendPush(userId, kind as PushKind, gameId, actorId, extra).catch((err) =>
      console.error("sendPush failed:", err)
    );
  }
}

interface GameRow {
  id: string;
  host_id: string;
  status: string;
  contract_rounds: number[];
  seats: MpConfig["seats"];
  turn_user_id: string | null;
  updated_at: string;
  created_at?: string;
  // Migration 0061 — absent (undefined) until it has been applied.
  turn_limit_hours?: number;
  turn_started_at?: string | null;
  turn_warned_at?: string | null;
}

function configOf(game: GameRow): MpConfig {
  return { seats: game.seats, contractRounds: game.contract_rounds };
}

async function loadGame(gameId: string): Promise<GameRow | null> {
  const full = await admin
    .from("mp_games")
    .select(
      "id, host_id, status, contract_rounds, seats, turn_user_id, updated_at, created_at, turn_limit_hours, turn_started_at, turn_warned_at"
    )
    .eq("id", gameId)
    .maybeSingle();
  if (!full.error) return (full.data as GameRow) ?? null;
  // 0061 not applied yet — run without the turn clock rather than not at all.
  const { data } = await admin
    .from("mp_games")
    .select("id, host_id, status, contract_rounds, seats, turn_user_id, updated_at")
    .eq("id", gameId)
    .maybeSingle();
  return (data as GameRow) ?? null;
}

async function myParticipant(gameId: string, uid: string) {
  const { data } = await admin
    .from("mp_participants")
    .select("seat, invite_status, outcome")
    .eq("game_id", gameId)
    .eq("user_id", uid)
    .maybeSingle();
  return data;
}

async function writeState(gameId: string, engine: MpEngine, fromVersion: number): Promise<boolean> {
  const { data } = await admin
    .from("mp_game_state")
    .update({ engine, version: fromVersion + 1 })
    .eq("game_id", gameId)
    .eq("version", fromVersion)
    .select("game_id");
  return (data?.length ?? 0) > 0;
}

async function syncPublicColumns(gameId: string, engine: MpEngine, config: MpConfig) {
  const cols = publicColumns(engine, config);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { ...cols, updated_at: now };
  if (cols.status === "complete") patch.completed_at = now;
  // Every state write is "activity": restart the turn clock for whoever is
  // up now (and re-arm their reminder). See src/mp/turnTimer.ts.
  const withClock = { ...patch, turn_started_at: now, turn_warned_at: null };
  const { error } = await admin.from("mp_games").update(withClock).eq("id", gameId);
  if (error) await admin.from("mp_games").update(patch).eq("id", gameId); // 0061 not applied yet
}

// ── shared-with-solo-verify-style stats crediting ───────────────────────
// Multiplayer used to have the client itself write these (recordMpGameResult.ts
// calling recordGameResult/recordAchievementProgress with the player's own
// RLS-scoped session, fed from a RedactedView + counter deltas the client
// computed for its own turn) — nothing re-verified that against the actual
// server state, so a fabricated call could credit stats for a game that
// never really happened this way. Moved here instead: every write below is
// derived from `engine`/`config` this function already has *because* the
// move it followed was just verified by applyDraw/applyCommit above, using
// the admin service-role client, same pattern solo-verify uses for solo
// games. `achievement_counters`/`player_stats` no longer accept direct
// client writes at all (see migration 0035) — this is now the only way
// either table changes for a multiplayer game, matching how mp_game_state
// itself has always worked.

async function creditAchievementCounters(uid: string, deltas: CounterDeltas): Promise<void> {
  const entries = Object.entries(deltas).filter(([, v]) => v !== 0);
  if (entries.length === 0) return;
  const { data: existing } = await admin
    .from("achievement_counters")
    .select("counters")
    .eq("user_id", uid)
    .maybeSingle<{ counters: Record<string, number> }>();
  const merged: Record<string, number> = { ...(existing?.counters ?? {}) };
  for (const [key, delta] of entries) merged[key] = (merged[key] ?? 0) + delta;
  const { error } = await admin.from("achievement_counters").upsert({
    user_id: uid,
    counters: merged,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("Failed to credit MP achievement counters for", uid, error);
}

/** The "counts like any solo game" half of finishing a multiplayer game —
 * games_played/games_won/best-worst-average score/wins_by_difficulty and a
 * game_history row, for every human participant, derived from the final
 * verified engine state. Exactly recordGameResult.ts's own logic, just
 * server-side and per-participant instead of a single client-side write
 * keyed to "human-0" — every real account in the game gets credited for
 * their own seat's own outcome. The separate MP-specific win/loss record
 * (mp_participants.outcome, mp_games' own columns) is untouched by this. */
async function recordMpGameOutcome(
  engine: MpEngine,
  config: MpConfig,
  participants: { user_id: string; seat: number }[]
): Promise<void> {
  const s = engine.state;
  const lowestScore = Math.min(...s.players.map((p) => p.cumulativeScore));
  const winnerSeats = s.players
    .map((p, seat) => ({ seat, score: p.cumulativeScore }))
    .filter((p) => p.score === lowestScore)
    .map((p) => p.seat);
  const tiedForLowest = winnerSeats.length > 1;

  for (const participant of participants) {
    const you = s.players[participant.seat];
    if (!you) continue;
    const won = !tiedForLowest && you.cumulativeScore === lowestScore;
    const tied = tiedForLowest && you.cumulativeScore === lowestScore;
    const opponents = s.players
      .filter((_, seat) => seat !== participant.seat)
      .map((p) => ({ name: p.name, difficulty: p.isAI ? p.difficulty ?? null : null }));

    const { data: existing } = await admin
      .from("player_stats")
      .select("games_played, games_won, games_tied, best_score, worst_score, average_score, wins_by_difficulty")
      .eq("user_id", participant.user_id)
      .maybeSingle<PlayerStatsFields>();

    const update = computePlayerStatsUpdate(existing, you.cumulativeScore, won, tied, opponents);

    const { error: statsError } = await admin.from("player_stats").upsert({
      user_id: participant.user_id,
      ...update,
      updated_at: new Date().toISOString(),
    });
    if (statsError) console.error("Failed to record MP player_stats for", participant.user_id, statsError);

    const { error: historyError } = await admin.from("game_history").insert({
      user_id: participant.user_id,
      opponents,
      rounds: [], // per-round totals aren't tracked server-side for MP today
      winner:
        winnerSeats.length > 1
          ? `${winnerSeats.map((seat) => s.players[seat].name).join(", ")} (tied)`
          : (s.players[winnerSeats[0]]?.name ?? "unknown"),
      winner_score: lowestScore,
    });
    if (historyError) console.error("Failed to record MP game_history for", participant.user_id, historyError);
  }
}

// Stamp outcomes + emit game_over when a game finishes.
async function finalizeParticipants(gameId: string, engine: MpEngine, config: MpConfig) {
  const s = engine.state;
  const winnerSeat = s.winnerId ? Number(s.winnerId.replace("seat-", "")) : -1;
  const { data: rows } = await admin
    .from("mp_participants")
    .select("user_id, seat, outcome")
    .eq("game_id", gameId);
  for (const r of rows ?? []) {
    const score = s.players[r.seat]?.cumulativeScore ?? null;
    const outcome = r.outcome ?? (r.seat === winnerSeat ? "won" : "lost");
    await admin
      .from("mp_participants")
      .update({ outcome, final_score: score })
      .eq("game_id", gameId)
      .eq("user_id", r.user_id);
    await addEvent(r.user_id, "game_over", gameId, null);
  }
  if (rows && rows.length > 0) {
    await recordMpGameOutcome(engine, config, rows).catch((err) =>
      console.error("Failed to record MP game outcome:", err)
    );
  }
}

async function notifyTurn(
  gameId: string,
  prevTurnUserId: string | null,
  engine: MpEngine,
  config: MpConfig,
  actorId: string | null = null
) {
  const cols = publicColumns(engine, config);
  if (cols.turn_user_id && cols.turn_user_id !== prevTurnUserId) {
    // actor = whoever just moved, so the push can say "Zara played — round 3".
    await addEvent(cols.turn_user_id, "your_turn", gameId, actorId, { round: cols.round });
  }
}

// ── routes ───────────────────────────────────────────────────────────────

async function handleCreate(uid: string, body: Record<string, unknown>): Promise<Response> {
  const rounds = Array.isArray(body.contract_rounds) ? (body.contract_rounds as number[]) : [];
  const rawSeats = Array.isArray(body.seats) ? (body.seats as Record<string, unknown>[]) : [];

  const cleanRounds = [...new Set(rounds.filter((r) => VALID_ROUNDS.includes(r)))].sort((a, b) => a - b);
  if (cleanRounds.length === 0) return json({ error: "pick at least one round" }, 400);

  const AI_DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"];
  // Trim to a sane length and drop control chars — these names are stored in
  // mp_games.seats and shown to every participant. (React escapes on render,
  // so this is about row bloat / layout, not XSS.)
  const cleanName = (v: unknown): string =>
    (typeof v === "string" ? v : "")
      // strip C0 control chars, DEL, and bidi override/isolate chars
      .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")
      .trim()
      .slice(0, 40);
  const humans: string[] = [];
  const ais: { difficulty: string; name: string }[] = [];
  for (const s of rawSeats) {
    if (s.kind === "human" && isUuid(s.user_id) && s.user_id !== uid) {
      humans.push(s.user_id);
    } else if (
      s.kind === "ai" &&
      typeof s.difficulty === "string" &&
      AI_DIFFICULTIES.includes(s.difficulty)
    ) {
      ais.push({ difficulty: s.difficulty, name: cleanName(s.name) || s.difficulty });
    }
  }
  const uniqueHumans = [...new Set(humans)];
  const total = 1 + uniqueHumans.length + ais.length;
  if (uniqueHumans.length < 1) return json({ error: "invite at least one friend" }, 400);
  if (total < 2 || total > 8) return json({ error: "a game needs 2–8 players" }, 400);

  const names = await resolveNames([uid, ...uniqueHumans]);
  const turnLimitHours = normalizeTurnLimit(body.turn_limit_hours);

  // Each invitee's friend/active-count check is independent of the others
  // (and of the host's own count below) — run them all concurrently rather
  // than one round-trip pair at a time, bounded by the 2-8 player cap so
  // this is at most ~7 requests in flight, not an unbounded fan-out. Still
  // scanned in original order afterward so the *reported* error is exactly
  // the same one a sequential version would have returned first.
  const [checks, hostActiveCount] = await Promise.all([
    Promise.all(
      uniqueHumans.map(async (h) => ({
        userId: h,
        isFriend: await areFriends(uid, h),
        count: await activeCount(h),
      }))
    ),
    activeCount(uid),
  ]);
  for (const c of checks) {
    // A block already removes the friendship; this is defence in depth, and
    // deliberately reads as the same error so it doesn't reveal who blocked.
    if (!c.isFriend || (await isBlockedPair(uid, c.userId))) {
      return json({ error: `${names.get(c.userId) ?? "That player"} isn't in your friends list` }, 400);
    }
    if (c.count >= MP_GAME_CAP) {
      return json({ error: `${names.get(c.userId) ?? "That player"} already has ${MP_GAME_CAP} games going` }, 400);
    }
  }
  if (hostActiveCount >= MP_GAME_CAP) {
    return json({ error: `You already have ${MP_GAME_CAP} multiplayer games going` }, 400);
  }

  const seats = [
    { seat: 0, kind: "human", userId: uid, name: names.get(uid) ?? placeholderName(uid) },
    ...uniqueHumans.map((h, i) => ({
      seat: 1 + i,
      kind: "human",
      userId: h,
      name: names.get(h) ?? placeholderName(h),
    })),
    ...ais.map((a, i) => ({
      seat: 1 + uniqueHumans.length + i,
      kind: "ai",
      difficulty: a.difficulty,
      name: a.name,
    })),
  ] as MpConfig["seats"];

  const baseRow = {
    host_id: uid,
    status: "pending",
    contract_rounds: cleanRounds,
    seats,
    round: 1,
  };
  let { data: game, error } = await admin
    .from("mp_games")
    .insert({ ...baseRow, turn_limit_hours: turnLimitHours })
    .select("id")
    .single();
  if (error) {
    // 0061 not applied yet — create the game without a clock.
    ({ data: game, error } = await admin.from("mp_games").insert(baseRow).select("id").single());
  }
  if (error || !game) return json({ error: "couldn't create the game" }, 500);

  const participants = seats
    .filter((s) => s.kind === "human")
    .map((s) => ({
      game_id: game.id,
      user_id: (s as { userId: string }).userId,
      seat: s.seat,
      invite_status: s.seat === 0 ? "accepted" : "invited",
      responded_at: s.seat === 0 ? new Date().toISOString() : null,
    }));
  await admin.from("mp_participants").insert(participants);

  await Promise.all(uniqueHumans.map((h) => addEvent(h, "game_request", game!.id, uid)));

  return json({ game_id: game.id, turn_limit_hours: turnLimitHours });
}

/**
 * Flips a fully-accepted pending game to active and deals it — the last
 * accepter used to do this inline in handleRespond, with no way to recover
 * if that one attempt failed partway (a transient error between the
 * invite_status update and this step left the game stuck "pending" forever:
 * every participant already shows "accepted", so nobody can ever call
 * handleRespond's accept branch again to retry it — that branch rejects
 * anyone whose invite_status isn't still "invited"). Now shared with
 * handleState, which calls this as a self-heal check on every "pending"
 * game load — the same recovery idea as handleState's own "active but
 * never dealt" repair just below, one stage earlier in the same handoff.
 * Returns "waiting" if someone still hasn't accepted, "started" if this
 * call is the one that dealt the game, or "already-active" if everyone had
 * accepted but a concurrent call (or a previous, already-successful call)
 * got there first — still a success from this caller's point of view, just
 * not the one that did the dealing.
 */
async function tryStartIfEveryoneAccepted(
  gameId: string,
  game: GameRow
): Promise<"waiting" | "started" | "already-active"> {
  if (game.status !== "pending") return "already-active";

  const { count } = await admin
    .from("mp_participants")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId)
    .neq("invite_status", "accepted");
  if ((count ?? 0) > 0) return "waiting";

  const { data: claimed } = await admin
    .from("mp_games")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", gameId)
    .eq("status", "pending")
    .select("id");
  if ((claimed?.length ?? 0) === 0) return "already-active";

  const config = configOf(game);
  const engine = dealGame(config);
  await admin.from("mp_game_state").insert({ game_id: gameId, engine, version: 0 });
  await syncPublicColumns(gameId, engine, config);
  await notifyTurn(gameId, null, engine, config);
  return "started";
}

async function handleRespond(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const accept = body.accept === true;
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);

  const mine = await myParticipant(gameId, uid);
  // A cancelled game (host withdrew, or a block cancelled it) is no invite.
  if (!mine || mine.invite_status !== "invited" || game.status !== "pending") {
    return json({ error: "no pending invite for you here" }, 400);
  }

  if (!accept) {
    await admin
      .from("mp_participants")
      .update({ invite_status: "declined", responded_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .eq("user_id", uid);
    await admin
      .from("mp_games")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", gameId)
      .eq("status", "pending");
    const { data: others } = await admin
      .from("mp_participants")
      .select("user_id")
      .eq("game_id", gameId)
      .neq("user_id", uid);
    for (const o of others ?? []) await addEvent(o.user_id, "game_cancelled", gameId, uid);
    return json({ status: "cancelled" });
  }

  // A block cancels invites between the pair (block_user(), migration 0082),
  // but an invite that predates that — or slips in around a block — must not
  // start a game with someone who has blocked you (or whom you blocked).
  const { data: others } = await admin
    .from("mp_participants")
    .select("user_id")
    .eq("game_id", gameId)
    .neq("user_id", uid);
  for (const o of others ?? []) {
    if (o.user_id && (await isBlockedPair(uid, o.user_id as string))) {
      await admin
        .from("mp_games")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", gameId)
        .eq("status", "pending");
      return json({ error: "no pending invite for you here" }, 400);
    }
  }

  const { data: accepted } = await admin
    .from("mp_participants")
    .update({ invite_status: "accepted", responded_at: new Date().toISOString() })
    .eq("game_id", gameId)
    .eq("user_id", uid)
    .eq("invite_status", "invited")
    .select("user_id");
  if ((accepted?.length ?? 0) === 0) return json({ status: game.status });

  // Only actually flips to active (and deals) once everyone's accepted.
  const result = await tryStartIfEveryoneAccepted(gameId, game);
  return json(result === "waiting" ? { status: "pending", accepted: true } : { status: "active" });
}

// The host withdraws a game invite before everyone's accepted — the other
// direction of handleRespond's decline: there, an *invitee* says no and the
// whole pending game cancels; here, the *host* changes their mind before
// anyone (or everyone but one straggler) has responded. Only ever touches a
// still-`pending` game — once it's `active`, resigning is the way out.
async function handleCancel(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  if (game.host_id !== uid) return json({ error: "only the host can cancel this" }, 403);
  if (game.status !== "pending") return json({ error: "this game already started" }, 409);

  const { data: cancelled } = await admin
    .from("mp_games")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", gameId)
    .eq("status", "pending")
    .select("id");
  if ((cancelled?.length ?? 0) === 0) return json({ status: game.status });

  const { data: others } = await admin
    .from("mp_participants")
    .select("user_id")
    .eq("game_id", gameId)
    .neq("user_id", uid);
  for (const o of others ?? []) await addEvent(o.user_id, "game_cancelled", gameId, uid);

  return json({ status: "cancelled" });
}

async function handleState(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  let game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  const mine = await myParticipant(gameId, uid);
  if (!mine) return json({ error: "you're not in this game" }, 403);

  if (game.status === "cancelled") return json({ status: "cancelled" });

  if (game.status === "pending") {
    // Self-heal: everyone may already have accepted with the actual flip
    // to active never having gone through (see tryStartIfEveryoneAccepted's
    // own doc) — anyone loading a "pending" game re-checks this instead of
    // trusting the stored status, so the game isn't stuck here forever just
    // because the one moment that should have started it hit a transient
    // error.
    const result = await tryStartIfEveryoneAccepted(gameId, game);
    if (result !== "waiting") game = (await loadGame(gameId)) ?? game;
  }

  if (game.status === "pending") {
    const { data: parts } = await admin
      .from("mp_participants")
      .select("user_id, seat, invite_status")
      .eq("game_id", gameId);
    return json({
      status: "pending",
      seats: game.seats,
      host_id: game.host_id,
      contract_rounds: game.contract_rounds,
      participants: parts ?? [],
      turn_limit_hours: game.turn_limit_hours ?? 0,
    });
  }

  // Past the pending stage there's a real hand to redact — unlike the
  // pending branch above (which an invited-but-not-yet-accepted
  // participant must still be able to see, to accept/decline it),
  // require actual acceptance here, matching handleMove/handleResign.
  if (mine.invite_status !== "accepted") return json({ error: "you're not in this game" }, 403);

  // Lazy turn-clock enforcement: whoever reads a stalled game moves it along —
  // except the stalled player themselves (opening the game IS them coming
  // back; see enforceTurnClock).
  if (game.status === "active" && (await enforceTurnClock(game, uid))) {
    game = (await loadGame(gameId)) ?? game;
  }

  let stateRow = (
    await admin.from("mp_game_state").select("engine").eq("game_id", gameId).maybeSingle()
  ).data;

  if (!stateRow && game.status === "active") {
    // handleRespond's pending -> active flip and the deal that should
    // immediately follow it are two separate, non-atomic steps — a crash
    // or transient error in between (dealGame throwing, the insert
    // failing) leaves status already "active" with no state row ever
    // written, and nothing was going to retry it: the flip's own
    // `.eq("status", "pending")` guard means a later handleRespond call
    // can never re-run this. Safe to repair here: dealGame is a pure
    // function of the game's own already-fixed seats/contracts, and the
    // insert's primary-key conflict (23505) means a concurrent poll from
    // another participant already repaired it first — not a real error.
    try {
      const config = configOf(game);
      const engine = dealGame(config);
      const { error: insertError } = await admin
        .from("mp_game_state")
        .insert({ game_id: gameId, engine, version: 0 });
      if (!insertError) {
        await syncPublicColumns(gameId, engine, config);
        await notifyTurn(gameId, null, engine, config);
      } else if (insertError.code !== "23505") {
        console.error("Failed to repair a stuck active game:", gameId, insertError);
        return json({ status: "dealing" });
      }
    } catch (err) {
      console.error("Failed to repair a stuck active game:", gameId, err);
      return json({ status: "dealing" });
    }
    stateRow = (
      await admin.from("mp_game_state").select("engine").eq("game_id", gameId).maybeSingle()
    ).data;
  }

  if (!stateRow) return json({ status: "dealing" });

  const engine = stateRow.engine as MpEngine;
  const view = redactFor(engine, configOf(game), mine.seat);
  return json({
    status: game.status,
    view,
    updated_at: game.updated_at,
    turn_limit_hours: game.turn_limit_hours ?? 0,
    turn_started_at: game.turn_started_at ?? null,
    your_missed_turns: game.turn_limit_hours ? await missedTurnsOf(gameId, uid) : 0,
  });
}

async function handleMove(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const action = body.action as Record<string, unknown>;
  let game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  if (game.status !== "active") return json({ error: "this game isn't active" }, 409);
  const mine = await myParticipant(gameId, uid);
  if (!mine || mine.invite_status !== "accepted") return json({ error: "you're not in this game" }, 403);

  // Someone else's clock may have run out before this move — settle that first
  // (never the mover's own: a late move is still a move).
  if (await enforceTurnClock(game, uid)) {
    game = (await loadGame(gameId)) ?? game;
    if (game.status !== "active") return json({ error: "this game isn't active" }, 409);
  }

  const { data: stateRow } = await admin
    .from("mp_game_state")
    .select("engine, version")
    .eq("game_id", gameId)
    .maybeSingle();
  if (!stateRow) return json({ error: "game not ready" }, 409);

  const config = configOf(game);
  const prevTurnUserId = game.turn_user_id;
  const preState = (stateRow.engine as MpEngine).state;
  let engine = stateRow.engine as MpEngine;
  let drawnCard = null;
  // Achievement-counter deltas for `uid`'s own seat, derived from exactly
  // what applyDraw/applyCommit just verified below — see
  // creditAchievementCounters's own doc for why this replaced the client's
  // former direct writes.
  const counterDeltas: CounterDeltas = {};

  if (action?.type === "draw") {
    const from = action.from === "discard" ? "discard" : "stock";
    const res = applyDraw(engine, mine.seat, from);
    if (res.error) return json({ error: res.error }, 409);
    engine = res.engine;
    drawnCard = res.card;
    if (drawnCard) mergeDeltas(counterDeltas, drawDeltas(drawnCard, from === "discard"));
  } else if (action?.type === "commit") {
    const layoffs = Array.isArray(action.layoffs)
      ? (action.layoffs as { cardId: string; meldId: string; position?: "low" | "high" }[])
      : [];
    const discardCardId = typeof action.discardCardId === "string" ? action.discardCardId : undefined;

    const res = applyCommit(engine, config, mine.seat, {
      type: "commit",
      groups: Array.isArray(action.groups) ? (action.groups as string[][]) : undefined,
      preferredRunStarts: Array.isArray(action.preferredRunStarts)
        ? (action.preferredRunStarts as (number | undefined)[])
        : undefined,
      layoffs: layoffs.length > 0 ? layoffs : undefined,
      discardCardId,
    });
    if (res.error) return json({ error: res.error }, 409);
    engine = res.engine;

    // Derived from pre-commit state (a lay-off's card/meld lookup) and
    // applyCommit's own meldedThisCommit/wentOutThisCommit — never diffed
    // out of the post-call engine.state, which advanceThroughAi may
    // already have moved past (redealing a new round, or running AI turns
    // of their own) by the time this function returns. Never from the
    // client's own claim about what it did.
    const contract = preState.selectedContracts[preState.round - 1];
    if (res.meldedThisCommit && res.meldedThisCommit.length > 0) {
      mergeDeltas(counterDeltas, meldDeltas(res.meldedThisCommit, contract));
    }
    const actingPlayerId = preState.players[mine.seat]?.id;
    for (const lo of layoffs) {
      const card = preState.players[mine.seat]?.hand.find((c) => c.id === lo.cardId);
      const meld = preState.melds.find((m) => m.id === lo.meldId);
      if (card && meld && actingPlayerId) {
        const wasAmbiguous = layOffOptions(card, meld).length === 2;
        mergeDeltas(counterDeltas, layOffDeltas(card, meld, actingPlayerId, wasAmbiguous));
      }
    }
    if (discardCardId) mergeDeltas(counterDeltas, discardDeltas());
    if (res.wentOutThisCommit) {
      mergeDeltas(counterDeltas, roundWonDeltas(contract, !!discardCardId));
    }
  } else if (action?.type === "meld") {
    // Split-turn actions: meld / layoff are immediate and leave the turn
    // open (turnDrawn stays true, no AI runs, turn_user_id is unchanged so
    // notifyTurn below sends nothing); discard ends the turn.
    const move = {
      type: "meld" as const,
      groups: Array.isArray(action.groups) ? (action.groups as string[][]) : [],
      preferredRunStarts: Array.isArray(action.preferredRunStarts)
        ? (action.preferredRunStarts as (number | undefined)[])
        : undefined,
    };
    const res = applyMeld(engine, mine.seat, move);
    if (res.error) return json({ error: res.error }, 409);
    engine = res.engine;
    mergeDeltas(counterDeltas, splitMoveDeltas(preState, mine.seat, move, res));
  } else if (action?.type === "layoff") {
    const pos = action.position === "low" || action.position === "high" ? action.position : undefined;
    const move = {
      type: "layoff" as const,
      cardId: String(action.cardId ?? ""),
      meldId: String(action.meldId ?? ""),
      position: pos,
    };
    const res = applyLayoff(engine, mine.seat, move);
    if (res.error) return json({ error: res.error }, 409);
    engine = res.engine;
    mergeDeltas(counterDeltas, splitMoveDeltas(preState, mine.seat, move, res));
  } else if (action?.type === "discard") {
    const move = {
      type: "discard" as const,
      discardCardId: typeof action.discardCardId === "string" ? action.discardCardId : undefined,
    };
    const res = applyDiscard(engine, mine.seat, move);
    if (res.error) return json({ error: res.error }, 409);
    engine = res.engine;
    mergeDeltas(counterDeltas, splitMoveDeltas(preState, mine.seat, move, res));
  } else {
    return json({ error: "unknown action" }, 400);
  }

  if (!(await writeState(gameId, engine, stateRow.version))) {
    return json({ error: "the game moved on — refresh" }, 409);
  }
  await syncPublicColumns(gameId, engine, config);
  await creditAchievementCounters(uid, counterDeltas);
  // A real move clears the AFK strike count (no-op / harmless before 0061).
  await admin
    .from("mp_participants")
    .update({ missed_turns: 0 })
    .eq("game_id", gameId)
    .eq("user_id", uid)
    .gt("missed_turns", 0);

  if (engine.state.gameOver) {
    await finalizeParticipants(gameId, engine, config);
  } else {
    await notifyTurn(gameId, prevTurnUserId, engine, config, uid);
  }

  return json({
    status: engine.state.gameOver ? "complete" : "active",
    view: redactFor(engine, config, mine.seat),
    drawnCard,
  });
}

/** The resign write shared by handleResign, resign_all (account deletion) and
 * the turn clock: resign `seat`, stamp the participant, sync, and finish the
 * game if it can't continue. `actorId` is who to credit in the next player's
 * "your turn" push (null when the system forfeits). */
async function resignSeat(
  game: GameRow,
  uid: string,
  seat: number,
  actorId: string | null
): Promise<{ ok: true; engine: MpEngine; config: MpConfig } | { ok: false; error: string; status: number }> {
  const gameId = game.id;
  const { data: stateRow } = await admin
    .from("mp_game_state")
    .select("engine, version")
    .eq("game_id", gameId)
    .maybeSingle();
  if (!stateRow) return { ok: false, error: "game not ready", status: 409 };

  const config = configOf(game);
  const prevTurnUserId = game.turn_user_id;
  const engine = applyResign(stateRow.engine as MpEngine, config, seat);

  if (!(await writeState(gameId, engine, stateRow.version))) {
    return { ok: false, error: "the game moved on — refresh", status: 409 };
  }
  await admin
    .from("mp_participants")
    // The resign penalty is charged to the scoreboard at round end (see the
    // adapter's settleResignPenalties), so add what's still pending here to
    // keep the stored interim final_score what the seat will finish with.
    .update({
      outcome: "resigned",
      final_score:
        (engine.state.players[seat]?.cumulativeScore ?? 0) +
        (engine.pendingResignPenalty?.includes(seat) ? RESIGN_PENALTY : 0),
    })
    .eq("game_id", gameId)
    .eq("user_id", uid);
  await syncPublicColumns(gameId, engine, config);

  if (engine.state.gameOver) {
    await finalizeParticipants(gameId, engine, config);
  } else {
    await notifyTurn(gameId, prevTurnUserId, engine, config, actorId);
  }
  return { ok: true, engine, config };
}

async function handleResign(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  if (game.status !== "active") return json({ error: "this game isn't active" }, 409);
  const mine = await myParticipant(gameId, uid);
  if (!mine || mine.invite_status !== "accepted") return json({ error: "you're not in this game" }, 403);

  const res = await resignSeat(game, uid, mine.seat, uid);
  if (!res.ok) return json({ error: res.error }, res.status);

  return json({
    status: res.engine.state.gameOver ? "complete" : "active",
    view: redactFor(res.engine, res.config, mine.seat),
  });
}

// ── turn clock ───────────────────────────────────────────────────────────

async function missedTurnsOf(gameId: string, uid: string): Promise<number> {
  const { data } = await admin
    .from("mp_participants")
    .select("missed_turns")
    .eq("game_id", gameId)
    .eq("user_id", uid)
    .maybeSingle();
  return (data as { missed_turns?: number } | null)?.missed_turns ?? 0;
}

/**
 * If the current player's clock has run out, move the game along: the first
 * miss auto-plays a safe turn (draw + discard, see autoPlay.ts), the second
 * miss in a row forfeits the seat with normal resign semantics. Returns true
 * if it changed the game. `skipUserId` is never enforced against: a player
 * opening/moving in their own stalled game has just come back.
 */
async function enforceTurnClock(game: GameRow, skipUserId: string | null): Promise<boolean> {
  if (game.status !== "active" || !game.turn_limit_hours || !game.turn_started_at || !game.turn_user_id) return false;
  const started = Date.parse(game.turn_started_at);
  if (timerState(Date.now(), started, game.turn_limit_hours).phase !== "expired") return false;
  const uid = game.turn_user_id;
  if (skipUserId && uid === skipUserId) return false;

  const mine = await myParticipant(game.id, uid);
  if (!mine || mine.invite_status !== "accepted") return false;
  const missed = await missedTurnsOf(game.id, uid);

  if (expiryAction(missed) === "autoplay") {
    const { data: stateRow } = await admin
      .from("mp_game_state")
      .select("engine, version")
      .eq("game_id", game.id)
      .maybeSingle();
    if (!stateRow) return false;
    const config = configOf(game);
    const played = autoPlayTurn(stateRow.engine as MpEngine, mine.seat);
    if (!played.error) {
      if (!(await writeState(game.id, played.engine, stateRow.version))) return false; // raced with a real move
      await syncPublicColumns(game.id, played.engine, config);
      await admin.from("mp_participants").update({ missed_turns: missed + 1 }).eq("game_id", game.id).eq("user_id", uid);
      await addEvent(uid, "auto_played", game.id, null);
      if (played.engine.state.gameOver) await finalizeParticipants(game.id, played.engine, config);
      else await notifyTurn(game.id, game.turn_user_id, played.engine, config, null);
      return true;
    }
    // Couldn't build a legal auto-move (shouldn't happen) — fall through to the forfeit.
  }

  const res = await resignSeat(game, uid, mine.seat, null);
  if (!res.ok) return false;
  await admin.from("mp_participants").update({ missed_turns: missed + 1 }).eq("game_id", game.id).eq("user_id", uid);
  await addEvent(uid, "forfeited", game.id, null);
  return true;
}

// ── nudge / friend push / account deletion / sweep ──────────────

async function handleNudge(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  if (!isUuid(gameId)) return json({ error: "no such game" }, 404);
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  const mine = await myParticipant(gameId, uid);
  if (!mine || mine.invite_status !== "accepted") return json({ error: "you're not in this game" }, 403);
  if (game.status !== "active") return json({ error: "this game isn't active" }, 409);
  const target = game.turn_user_id;
  if (!target || target === uid) return json({ error: "nothing to nudge" }, 409);
  if (await isBlockedPair(uid, target)) return json({ error: "nothing to nudge" }, 409);

  // Same limits as mp_nudge (migration 0017): a few an hour per caller, one
  // per game per NUDGE_COOLDOWN_HOURS regardless of who sent it.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: mineLastHour } = await admin
    .from("mp_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", uid)
    .eq("kind", "nudge")
    .gte("created_at", hourAgo);
  if ((mineLastHour ?? 0) >= 8) return json({ error: "Too many attempts — try again later." }, 429);
  const { count: recent } = await admin
    .from("mp_events")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("kind", "nudge")
    .gte("created_at", new Date(Date.now() - NUDGE_COOLDOWN_HOURS * 3_600_000).toISOString());
  if ((recent ?? 0) > 0) return json({ error: "already nudged recently" }, 429);

  await addEvent(target, "nudge", gameId, uid);
  return json({ ok: true });
}

/** Called by the client right after sending a friend request / adding by
 * code: those are written by SQL RPCs (no push hook), so the client asks the
 * server to push. Idempotent and unforgeable: it only fires for a real,
 * fresh, not-yet-pushed inbox event from the caller to that target. */
async function handleFriendPush(uid: string, body: Record<string, unknown>): Promise<Response> {
  const target = String(body.target_id ?? "");
  if (!isUuid(target) || target === uid) return json({ error: "invalid target" }, 400);
  const { data: ev } = await admin
    .from("mp_events")
    .select("id, kind, payload, created_at")
    .eq("user_id", target)
    .eq("actor_id", uid)
    .in("kind", ["friend_request", "friend_accepted"])
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ev || (ev.payload as { pushed?: boolean } | null)?.pushed) return json({ ok: true, sent: false });
  await admin
    .from("mp_events")
    .update({ payload: { ...((ev.payload as object) ?? {}), pushed: true } })
    .eq("id", ev.id);
  await sendPush(target, ev.kind as PushKind, null, uid).catch(() => {});
  return json({ ok: true, sent: true });
}

/** Resigns every active game the caller is in — step one of account deletion
 * (the delete-account function forwards the user's own JWT here). */
async function handleResignAll(uid: string): Promise<Response> {
  const { data: parts } = await admin
    .from("mp_participants")
    .select("game_id, seat")
    .eq("user_id", uid)
    .eq("invite_status", "accepted");
  let resigned = 0;
  for (const p of parts ?? []) {
    const game = await loadGame(p.game_id);
    if (!game || game.status !== "active") continue;
    const res = await resignSeat(game, uid, p.seat, null);
    if (res.ok) resigned++;
  }
  // Pending games the caller is in: host cancels, invitee declines → cancelled.
  const { data: pend } = await admin
    .from("mp_participants")
    .select("game_id")
    .eq("user_id", uid)
    .in("invite_status", ["invited", "accepted"]);
  for (const p of pend ?? []) {
    const game = await loadGame(p.game_id);
    if (!game || game.status !== "pending") continue;
    await admin
      .from("mp_games")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", game.id)
      .eq("status", "pending");
  }
  return json({ resigned });
}

/** Cron entry (pg_cron → /mp/sweep, see migration 0061): enforce every
 * expired clock, send the 75% reminder, and expire stale pending invites. */
async function handleSweep(): Promise<Response> {
  let enforced = 0;
  let warned = 0;
  let expired = 0;

  const { data: active } = await admin
    .from("mp_games")
    .select(
      "id, host_id, status, contract_rounds, seats, turn_user_id, updated_at, created_at, turn_limit_hours, turn_started_at, turn_warned_at"
    )
    .eq("status", "active")
    .gt("turn_limit_hours", 0)
    .not("turn_started_at", "is", null)
    .order("turn_started_at", { ascending: true })
    .limit(200);
  for (const g of (active ?? []) as GameRow[]) {
    try {
      const st = timerState(Date.now(), Date.parse(g.turn_started_at!), g.turn_limit_hours ?? 0);
      if (st.phase === "expired") {
        if (await enforceTurnClock(g, null)) enforced++;
      } else if (st.phase === "warn" && g.turn_user_id && !g.turn_warned_at) {
        const { data: claimed } = await admin
          .from("mp_games")
          .update({ turn_warned_at: new Date().toISOString() })
          .eq("id", g.id)
          .is("turn_warned_at", null)
          .select("id");
        if ((claimed?.length ?? 0) > 0) {
          await sendPush(g.turn_user_id, "turn_warning", g.id, null, { hours: st.remainingMs / 3_600_000 });
          warned++;
        }
      }
    } catch (err) {
      console.error("sweep failed for game", g.id, err);
    }
  }

  const cutoff = new Date(Date.now() - PENDING_INVITE_TTL_HOURS * 3_600_000).toISOString();
  const { data: stale } = await admin
    .from("mp_games")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(200);
  for (const g of stale ?? []) {
    const { data: cancelled } = await admin
      .from("mp_games")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", g.id)
      .eq("status", "pending")
      .select("id");
    if ((cancelled?.length ?? 0) === 0) continue;
    expired++;
    const { data: parts } = await admin.from("mp_participants").select("user_id").eq("game_id", g.id);
    for (const p of parts ?? []) await addEvent(p.user_id, "game_cancelled", g.id, null);
  }

  return json({ enforced, warned, expired });
}

/** Fixed-time compare, same idea as daily-deal-reminder's. */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const digest = async (x: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)));
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

// ── entrypoint ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  // Cron entry: no user, authenticated by the shared CRON_SECRET instead
  // (x-cron-secret, or a Bearer token when deployed without the JWT gate).
  if (route === "sweep") {
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const presented = req.headers.get("x-cron-secret") ?? (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    if (!cronSecret || !(await timingSafeEqual(presented, cronSecret))) return json({ error: "unauthorized" }, 401);
    try {
      return await handleSweep();
    } catch (e) {
      console.error("mp sweep error:", e);
      return json({ error: "something went wrong" }, 400);
    }
  }

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
    body = {};
  }

  try {
    switch (route) {
      case "create":
        return await handleCreate(user.id, body);
      case "respond":
        return await handleRespond(user.id, body);
      case "cancel":
        return await handleCancel(user.id, body);
      case "state":
        return await handleState(user.id, body);
      case "move":
        return await handleMove(user.id, body);
      case "resign":
        return await handleResign(user.id, body);
      case "nudge":
        return await handleNudge(user.id, body);
      case "friend_push":
        return await handleFriendPush(user.id, body);
      case "resign_all":
        return await handleResignAll(user.id);
      default:
        return json({ error: "unknown route" }, 404);
    }
  } catch (e) {
    // Logged in full server-side; the client only ever gets a fixed
    // generic message. Every path that can currently reach this throws a
    // static, hand-written Error (supabase-js query calls return
    // { data, error } rather than throwing) — but returning e.message
    // verbatim was a foot-gun: any future code path that lets a
    // third-party library or DB client throw instead would leak whatever
    // that library puts in its message straight to the caller.
    console.error("mp function error:", e);
    return json({ error: "something went wrong" }, 400);
  }
});
