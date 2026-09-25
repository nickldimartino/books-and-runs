// LIVE verification of the multiplayer additions (migration 0061 + the
// redeployed `mp` function): turn clock, nudge, split actions.
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { solveContract, solveWholeHandContract, layOffOptions } from "@/meld";
import { ContractRequirement } from "@/types";
import { submitMpMove } from "../app/lib/mpStore";
import { playOneTurn } from "./helpers/playMpGame";
import { canRunLiveMpTests, REQUIRED_ENV_MESSAGE, seedFriendship, ANON_KEY, SUPABASE_URL } from "./helpers/testAccounts";
import { adminClient, callFn, cleanupUsers, LiveUser, mkUser, newRunId, sleep, sweepLiveTestUsers } from "./helpers/liveHelpers";

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);
test.describe.configure({ timeout: 300_000 });
test.afterAll(async () => { await sweepLiveTestUsers(""); });

async function activeGame(A: LiveUser, B: LiveUser, opts: { turnLimitHours?: number; rounds?: number[] } = {}) {
  const create = await callFn(A.client, "mp", {
    contract_rounds: opts.rounds ?? [1, 2],
    seats: [{ kind: "human", user_id: B.id }],
    ...(opts.turnLimitHours !== undefined ? { turn_limit_hours: opts.turnLimitHours } : {}),
  }, "/create");
  expect(create.status).toBe(200);
  const gameId = create.body.game_id as string;
  const acc = await callFn(B.client, "mp", { game_id: gameId, accept: true }, "/respond");
  expect(acc.body.status).toBe("active");
  return { gameId, create };
}

async function turnWithLayoffs(client: SupabaseClient, gameId: string, tally: { layoffs: number; melds: number; layoffErrors: string[] }) {
  const draw = await submitMpMove(client, gameId, { type: "draw", from: "stock" });
  if (draw.status === "complete") return draw;
  let view = draw.view;
  const seat = view.yourSeat!;
  const contract: ContractRequirement = { ...view.contract, round: view.round, label: view.roundLabel };
  if (!view.players[seat].hasMeldedContract) {
    const melds = contract.wholeHandMeld ? solveWholeHandContract(view.yourHand, contract, "me") : solveContract(view.yourHand, contract, "me");
    if (melds) {
      const r = await submitMpMove(client, gameId, { type: "meld", groups: melds.map((m) => m.cards.map((c) => c.id)), preferredRunStarts: melds.map((m) => m.runStartIndex) });
      view = r.view;
      tally.melds++;
    }
  }
  if (view.players[seat].hasMeldedContract) {
    for (let guard = 0; guard < 6; guard++) {
      let did = false;
      for (const card of view.yourHand) {
        const meld = view.melds.find((m) => layOffOptions(card, m).length > 0);
        if (!meld) continue;
        try {
          const r = await submitMpMove(client, gameId, { type: "layoff", cardId: card.id, meldId: meld.id, position: layOffOptions(card, meld)[0] });
          view = r.view; tally.layoffs++; did = true; break;
        } catch (e: any) { tally.layoffErrors.push(String(e.message)); }
      }
      if (!did) break;
    }
  }
  const leftover = view.yourHand;
  const card = leftover.find((c) => !c.isWild) ?? leftover[0];
  return submitMpMove(client, gameId, { type: "discard", discardCardId: card?.id });
}

test("MP: full game incl. split meld/layoff/discard, nudge, MP counters -> quests", async () => {
  const runId = newRunId();
  const A = await mkUser("mpA", runId, "MpAlice");
  const B = await mkUser("mpB", runId, "MpBob");
  const C = await mkUser("mpC", runId, "MpCarol"); // outsider
  const admin = adminClient();
  try {
    await seedFriendship(A.id, B.id);
    const { gameId, create } = await activeGame(A, B, { turnLimitHours: 24, rounds: [1, 2] });
    console.log("[mp] create body", JSON.stringify(create.body));
    expect(create.body.turn_limit_hours).toBe(24);
    const { data: row } = await admin.from("mp_games").select("turn_limit_hours, turn_started_at, turn_warned_at, turn_user_id, status").eq("id", gameId).maybeSingle();
    console.log("[mp] mp_games row", JSON.stringify(row));
    expect(row?.turn_limit_hours).toBe(24);
    expect(row?.turn_started_at).toBeTruthy();
    expect(row?.turn_user_id).toBe(A.id);
    // mp_my_games returns the new columns
    const mg = await A.client.rpc("mp_my_games");
    expect(mg.error).toBeNull();
    const mine = (mg.data as any[]).find((g) => g.game_id === gameId);
    console.log("[mp] mp_my_games row keys", Object.keys(mine).join(","));
    expect(mine.turn_limit_hours).toBe(24);
    expect(mine.turn_started_at).toBeTruthy();
    // state carries the clock fields
    const st = await callFn(B.client, "mp", { game_id: gameId }, "/state");
    expect(st.body.turn_limit_hours).toBe(24);
    expect(st.body.your_missed_turns).toBe(0);

    // ── nudge ── (it's A's turn; B nudges A)
    const n1 = await callFn(B.client, "mp", { game_id: gameId }, "/nudge");
    console.log("[nudge] first", n1.status, JSON.stringify(n1.body));
    expect(n1.status).toBe(200);
    const n2 = await callFn(B.client, "mp", { game_id: gameId }, "/nudge");
    console.log("[nudge] second", n2.status, n2.body.error);
    expect(n2.status).toBe(429);
    const nSelf = await callFn(A.client, "mp", { game_id: gameId }, "/nudge");
    expect(nSelf.status).toBe(409); // own turn
    const nOut = await callFn(C.client, "mp", { game_id: gameId }, "/nudge");
    expect(nOut.status).toBe(403);

    // ── play the whole game with split actions, incl. lay-offs ──
    const tally = { layoffs: 0, melds: 0, layoffErrors: [] as string[] };
    const clients: Record<number, SupabaseClient> = { 0: A.client, 1: B.client };
    let seat = 0, done = false;
    for (let i = 0; i < 300 && !done; i++) {
      const res = await turnWithLayoffs(clients[seat], gameId, tally);
      if (res.status === "complete") done = true; else seat = res.view.currentSeat;
    }
    console.log("[mp] finished:", done, "split melds", tally.melds, "layoffs", tally.layoffs, "layoff errors", tally.layoffErrors.slice(0, 3).join(" / "));
    expect(done).toBe(true);
    expect(tally.melds).toBeGreaterThan(0);
    const { data: g } = await admin.from("mp_games").select("status").eq("id", gameId).maybeSingle();
    expect(g?.status).toBe("complete");
    // nudge is not allowed in a complete game
    const post = await callFn(B.client, "mp", { game_id: gameId }, "/nudge");
    expect(post.status).toBe(409);
    // MP stats + achievement counters credited server-side
    const stats = await A.client.rpc("mp_my_stats");
    console.log("[mp] A mp_my_stats", JSON.stringify(stats.data));
    const { data: cA } = await admin.from("achievement_counters").select("counters").eq("user_id", A.id).maybeSingle();
    console.log("[mp] A counters", JSON.stringify(cA?.counters).slice(0, 300));
    expect(cA?.counters?.books_melded ?? cA?.counters?.runs_melded ?? 0).toBeGreaterThan(0);
    if (tally.layoffs > 0) {
      const { data: cB } = await admin.from("achievement_counters").select("counters").eq("user_id", B.id).maybeSingle();
      expect((cA?.counters?.cards_laid_off ?? 0) + (cB?.counters?.cards_laid_off ?? 0)).toBeGreaterThan(0);
    } else console.log("[mp] NOTE: no lay-off opportunity arose in this game; layoff path not exercised here");
    // quest sync after MP progress: baselines exist, progress = counters - baseline is claimable
    const q = await callFn(A.client, "solo-verify", { action: "quests" });
    console.log("[mp] quest sync after MP game", q.status, JSON.stringify(q.body));
    expect(q.status).toBe(200);
  } finally {
    await cleanupUsers([A, B, C]);
  }
});

test("MP turn clock: first miss auto-plays, real move resets, second consecutive miss forfeits; own-turn open never enforces", async () => {
  const runId = newRunId();
  const A = await mkUser("tcA", runId, "TcAlice");
  const B = await mkUser("tcB", runId, "TcBob");
  const admin = adminClient();
  const age = (gameId: string, hours: number) =>
    admin.from("mp_games").update({ turn_started_at: new Date(Date.now() - hours * 3_600_000).toISOString() }).eq("id", gameId);
  const missed = async (gameId: string, uid: string) =>
    ((await admin.from("mp_participants").select("missed_turns").eq("game_id", gameId).eq("user_id", uid).maybeSingle()).data?.missed_turns ?? -1) as number;
  const events = async (uid: string, kind: string, gameId: string) =>
    ((await admin.from("mp_events").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("kind", kind).eq("game_id", gameId)).count ?? 0) as number;
  try {
    await seedFriendship(A.id, B.id);
    // defaults: no limit sent -> 72; explicit 0 -> off; garbage -> 72
    const d1 = await callFn(A.client, "mp", { contract_rounds: [1], seats: [{ kind: "human", user_id: B.id }] }, "/create");
    const d2 = await callFn(A.client, "mp", { contract_rounds: [1], seats: [{ kind: "human", user_id: B.id }], turn_limit_hours: 0 }, "/create");
    const d3 = await callFn(A.client, "mp", { contract_rounds: [1], seats: [{ kind: "human", user_id: B.id }], turn_limit_hours: 5 }, "/create");
    console.log("[clock] default/0/garbage ->", d1.body.turn_limit_hours, d2.body.turn_limit_hours, d3.body.turn_limit_hours);
    expect([d1.body.turn_limit_hours, d2.body.turn_limit_hours, d3.body.turn_limit_hours]).toEqual([72, 0, 72]);
    for (const c of [d1, d2, d3]) await callFn(A.client, "mp", { game_id: c.body.game_id }, "/cancel");

    const { gameId } = await activeGame(A, B, { turnLimitHours: 24, rounds: [1, 2, 3] });
    // 1) A's own clock expired but A opens the game -> nothing forced
    await age(gameId, 25);
    const own = await callFn(A.client, "mp", { game_id: gameId }, "/state");
    expect(own.status).toBe(200);
    expect(await missed(gameId, A.id)).toBe(0);
    expect((await admin.from("mp_games").select("turn_user_id").eq("id", gameId).maybeSingle()).data?.turn_user_id).toBe(A.id);
    // 2) a 23h-old turn is not expired
    await age(gameId, 23);
    await callFn(B.client, "mp", { game_id: gameId }, "/state");
    expect(await missed(gameId, A.id)).toBe(0);
    // 3) B opens after 25h -> A auto-played once
    const before = await admin.from("mp_game_state").select("version").eq("game_id", gameId).maybeSingle();
    await age(gameId, 25);
    const bState = await callFn(B.client, "mp", { game_id: gameId }, "/state");
    const { data: g1 } = await admin.from("mp_games").select("turn_user_id, turn_started_at, status").eq("id", gameId).maybeSingle();
    const after = await admin.from("mp_game_state").select("version").eq("game_id", gameId).maybeSingle();
    console.log("[clock] after 1st miss: status", bState.status, "turn_user", g1?.turn_user_id === B.id ? "B" : "A", "missed(A)", await missed(gameId, A.id), "version", before.data?.version, "->", after.data?.version);
    expect(await missed(gameId, A.id)).toBe(1);
    expect(g1?.turn_user_id).toBe(B.id);
    expect(Date.now() - Date.parse(g1!.turn_started_at)).toBeLessThan(120_000);
    expect(await events(A.id, "auto_played", gameId)).toBe(1);
    expect(bState.body.view.currentSeat).toBe(1);
    // A returns: state shows their strike count
    const aState = await callFn(A.client, "mp", { game_id: gameId }, "/state");
    expect(aState.body.your_missed_turns).toBe(1);
    // 4) B plays; A makes a REAL move -> strikes reset to 0
    await playOneTurn(B.client, gameId);
    await playOneTurn(A.client, gameId);
    console.log("[clock] after A's real move missed(A) =", await missed(gameId, A.id));
    expect(await missed(gameId, A.id)).toBe(0);
    // 5) B plays, A misses again (fresh strike 1, NOT a forfeit because the counter was reset)
    await playOneTurn(B.client, gameId);
    await age(gameId, 25);
    await callFn(B.client, "mp", { game_id: gameId }, "/state");
    expect(await missed(gameId, A.id)).toBe(1);
    expect(await events(A.id, "forfeited", gameId)).toBe(0);
    // 6) B plays, A misses a 2nd consecutive time -> forfeit
    await playOneTurn(B.client, gameId);
    await age(gameId, 25);
    const mv = await callFn(B.client, "mp", { game_id: gameId, action: { type: "draw", from: "stock" } }, "/move"); // enforcement also runs on the OTHER player's move
    const { data: g2 } = await admin.from("mp_games").select("status").eq("id", gameId).maybeSingle();
    console.log("[clock] after 2nd consecutive miss: move status", mv.status, JSON.stringify(mv.body).slice(0, 100), "| game status", g2?.status, "missed(A)", await missed(gameId, A.id));
    expect(await missed(gameId, A.id)).toBe(2);
    expect(await events(A.id, "forfeited", gameId)).toBe(1);
    expect(g2?.status).toBe("complete"); // only one human left -> force-ended
    // A can no longer move
    const late = await callFn(A.client, "mp", { game_id: gameId, action: { type: "draw", from: "stock" } }, "/move");
    console.log("[clock] forfeited player's move ->", late.status, late.body.error);
    expect(late.status).toBe(409);
  } finally {
    await cleanupUsers([A, B]);
  }
});

test("MP sweep endpoint is closed to non-cron callers; resign_all & unknown routes behave", async () => {
  const runId = newRunId();
  const A = await mkUser("swp", runId, "SwpAlice");
  try {
    for (const hdr of [{}, { "x-cron-secret": "wrong" }, { Authorization: `Bearer ${ANON_KEY}`, "x-cron-secret": "" }]) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/mp/sweep`, { method: "POST", headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json", ...(hdr as object) }, body: "{}" });
      console.log("[sweep] status", r.status);
      expect(r.status).toBe(401);
    }
    const u = await callFn(A.client, "mp", {}, "/no_such_route");
    expect(u.status).toBe(404);
    const ra = await callFn(A.client, "mp", {}, "/resign_all");
    console.log("[resign_all] no games ->", ra.status, JSON.stringify(ra.body));
    expect(ra.status).toBe(200);
    expect(ra.body.resigned).toBe(0);
  } finally {
    await cleanupUsers([A]);
  }
});
