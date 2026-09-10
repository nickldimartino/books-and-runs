// Books & Runs — multiplayer Edge Function.
//
// One deployed function, path-routed: /mp/create /mp/respond /mp/state
// /mp/move /mp/resign. It is the ONLY thing that reads or writes
// mp_game_state (the sealed full state + deck) — every client gets back a
// redacted view. All real game logic lives in ../../../src/mp/adapter.ts,
// which is pure and unit-tested; this file is auth + DB + wiring.
//
// Deploy:  supabase functions deploy mp
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.)

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
// ./_engine is a copy of src/ with explicit .ts extensions — the Supabase
// deploy bundler doesn't resolve the app's extension-less imports. Run
// `node scripts/bundle-mp-engine.mjs` before every deploy.
import {
  applyCommit,
  applyDraw,
  applyResign,
  dealGame,
  publicColumns,
  redactFor,
} from "./_engine/mp/adapter.ts";
import { MpConfig, MpEngine } from "./_engine/mp/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

async function addEvent(userId: string, kind: string, gameId: string | null, actorId: string | null) {
  await admin.from("mp_events").insert({ user_id: userId, kind, game_id: gameId, actor_id: actorId });
}

interface GameRow {
  id: string;
  host_id: string;
  status: string;
  contract_rounds: number[];
  seats: MpConfig["seats"];
  turn_user_id: string | null;
}

function configOf(game: GameRow): MpConfig {
  return { seats: game.seats, contractRounds: game.contract_rounds };
}

async function loadGame(gameId: string): Promise<GameRow | null> {
  const { data } = await admin
    .from("mp_games")
    .select("id, host_id, status, contract_rounds, seats, turn_user_id")
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
  const patch: Record<string, unknown> = { ...cols, updated_at: new Date().toISOString() };
  if (cols.status === "complete") patch.completed_at = new Date().toISOString();
  await admin.from("mp_games").update(patch).eq("id", gameId);
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
}

async function notifyTurn(gameId: string, prevTurnUserId: string | null, engine: MpEngine, config: MpConfig) {
  const cols = publicColumns(engine, config);
  if (cols.turn_user_id && cols.turn_user_id !== prevTurnUserId) {
    await addEvent(cols.turn_user_id, "your_turn", gameId, null);
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

  for (const h of uniqueHumans) {
    if (!(await areFriends(uid, h))) {
      return json({ error: `${names.get(h) ?? "That player"} isn't in your friends list` }, 400);
    }
    if ((await activeCount(h)) >= MP_GAME_CAP) {
      return json({ error: `${names.get(h) ?? "That player"} already has ${MP_GAME_CAP} games going` }, 400);
    }
  }
  if ((await activeCount(uid)) >= MP_GAME_CAP) {
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

  const { data: game, error } = await admin
    .from("mp_games")
    .insert({
      host_id: uid,
      status: "pending",
      contract_rounds: cleanRounds,
      seats,
      round: 1,
    })
    .select("id")
    .single();
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

  for (const h of uniqueHumans) await addEvent(h, "game_request", game.id, uid);

  return json({ game_id: game.id });
}

async function handleRespond(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const accept = body.accept === true;
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);

  const mine = await myParticipant(gameId, uid);
  if (!mine || mine.invite_status !== "invited") {
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

  const { data: accepted } = await admin
    .from("mp_participants")
    .update({ invite_status: "accepted", responded_at: new Date().toISOString() })
    .eq("game_id", gameId)
    .eq("user_id", uid)
    .eq("invite_status", "invited")
    .select("user_id");
  if ((accepted?.length ?? 0) === 0) return json({ status: game.status });

  const { count } = await admin
    .from("mp_participants")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId)
    .neq("invite_status", "accepted");
  if ((count ?? 0) > 0) return json({ status: "pending", accepted: true });

  // Everyone's in. Flip pending → active atomically; the winner of that race deals.
  const { data: claimed } = await admin
    .from("mp_games")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", gameId)
    .eq("status", "pending")
    .select("id");
  if ((claimed?.length ?? 0) === 0) return json({ status: "active" });

  const config = configOf(game);
  const engine = dealGame(config);
  await admin.from("mp_game_state").insert({ game_id: gameId, engine, version: 0 });
  await syncPublicColumns(gameId, engine, config);
  await notifyTurn(gameId, null, engine, config);
  return json({ status: "active" });
}

async function handleState(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  const mine = await myParticipant(gameId, uid);
  if (!mine) return json({ error: "you're not in this game" }, 403);

  if (game.status === "cancelled") return json({ status: "cancelled" });

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
    });
  }

  const { data: stateRow } = await admin
    .from("mp_game_state")
    .select("engine")
    .eq("game_id", gameId)
    .maybeSingle();
  if (!stateRow) return json({ status: "dealing" });

  const engine = stateRow.engine as MpEngine;
  const view = redactFor(engine, configOf(game), mine.seat);
  return json({ status: game.status, view });
}

async function handleMove(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const action = body.action as Record<string, unknown>;
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  if (game.status !== "active") return json({ error: "this game isn't active" }, 409);
  const mine = await myParticipant(gameId, uid);
  if (!mine || mine.invite_status !== "accepted") return json({ error: "you're not in this game" }, 403);

  const { data: stateRow } = await admin
    .from("mp_game_state")
    .select("engine, version")
    .eq("game_id", gameId)
    .maybeSingle();
  if (!stateRow) return json({ error: "game not ready" }, 409);

  const config = configOf(game);
  const prevTurnUserId = game.turn_user_id;
  let engine = stateRow.engine as MpEngine;
  let drawnCard = null;

  if (action?.type === "draw") {
    const from = action.from === "discard" ? "discard" : "stock";
    const res = applyDraw(engine, mine.seat, from);
    if (res.error) return json({ error: res.error }, 409);
    engine = res.engine;
    drawnCard = res.card;
  } else if (action?.type === "commit") {
    const res = applyCommit(engine, config, mine.seat, {
      type: "commit",
      groups: Array.isArray(action.groups) ? (action.groups as string[][]) : undefined,
      preferredRunStarts: Array.isArray(action.preferredRunStarts)
        ? (action.preferredRunStarts as (number | undefined)[])
        : undefined,
      layoffs: Array.isArray(action.layoffs)
        ? (action.layoffs as { cardId: string; meldId: string; position?: "low" | "high" }[])
        : undefined,
      discardCardId: typeof action.discardCardId === "string" ? action.discardCardId : undefined,
    });
    if (res.error) return json({ error: res.error }, 409);
    engine = res.engine;
  } else {
    return json({ error: "unknown action" }, 400);
  }

  if (!(await writeState(gameId, engine, stateRow.version))) {
    return json({ error: "the game moved on — refresh" }, 409);
  }
  await syncPublicColumns(gameId, engine, config);

  if (engine.state.gameOver) {
    await finalizeParticipants(gameId, engine, config);
  } else {
    await notifyTurn(gameId, prevTurnUserId, engine, config);
  }

  return json({
    status: engine.state.gameOver ? "complete" : "active",
    view: redactFor(engine, config, mine.seat),
    drawnCard,
  });
}

async function handleResign(uid: string, body: Record<string, unknown>): Promise<Response> {
  const gameId = String(body.game_id ?? "");
  const game = await loadGame(gameId);
  if (!game) return json({ error: "no such game" }, 404);
  if (game.status !== "active") return json({ error: "this game isn't active" }, 409);
  const mine = await myParticipant(gameId, uid);
  if (!mine || mine.invite_status !== "accepted") return json({ error: "you're not in this game" }, 403);

  const { data: stateRow } = await admin
    .from("mp_game_state")
    .select("engine, version")
    .eq("game_id", gameId)
    .maybeSingle();
  if (!stateRow) return json({ error: "game not ready" }, 409);

  const config = configOf(game);
  const prevTurnUserId = game.turn_user_id;
  const engine = applyResign(stateRow.engine as MpEngine, config, mine.seat);

  if (!(await writeState(gameId, engine, stateRow.version))) {
    return json({ error: "the game moved on — refresh" }, 409);
  }
  await admin
    .from("mp_participants")
    .update({ outcome: "resigned", final_score: engine.state.players[mine.seat]?.cumulativeScore ?? null })
    .eq("game_id", gameId)
    .eq("user_id", uid);
  await syncPublicColumns(gameId, engine, config);

  if (engine.state.gameOver) {
    await finalizeParticipants(gameId, engine, config);
  } else {
    await notifyTurn(gameId, prevTurnUserId, engine, config);
  }

  return json({
    status: engine.state.gameOver ? "complete" : "active",
    view: redactFor(engine, config, mine.seat),
  });
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

  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
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
      case "state":
        return await handleState(user.id, body);
      case "move":
        return await handleMove(user.id, body);
      case "resign":
        return await handleResign(user.id, body);
      default:
        return json({ error: "unknown route" }, 404);
    }
  } catch (e) {
    console.error("mp function error:", e);
    return json({ error: e instanceof Error ? e.message : "something went wrong" }, 400);
  }
});
