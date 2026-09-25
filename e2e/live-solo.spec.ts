// LIVE verification of solo-verify + the XP ledger + quests (migrations
// 0056/0057). Needs the service-role key (skips without it). No browser.
import { expect, test } from "@playwright/test";
import { computeTotalXp } from "@/leveling";
import { AchievementProgressState } from "@/achievements";
import { utcDayKey, utcIsoWeekKey } from "@/dailyRewards";
import { currentPeriodKey, QUEST_METRICS, questsForPeriod, questLedgerRef } from "@/quests";
import { replaySoloGame } from "@/solo/replay";
import { finalGameDeltas, mergeDeltas, tableCompositionDeltas } from "@/replayStats";
import { canRunLiveMpTests, REQUIRED_ENV_MESSAGE } from "./helpers/testAccounts";
import {
  adminClient, callFn, cleanupUsers, dateSeed, dayKeyOffset, genSoloGame, mkUser, newRunId, sleep, sweepLiveTestUsers,
  verifyPayload,
} from "./helpers/liveHelpers";

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);
test.describe.configure({ timeout: 240_000 });
test.afterAll(async () => { await sweepLiveTestUsers(""); });

async function progressFor(user: { id: string; client: any }): Promise<AchievementProgressState> {
  const admin = adminClient();
  const { data: stats } = await admin.from("player_stats").select("*").eq("user_id", user.id).maybeSingle();
  const { data: c } = await admin.from("achievement_counters").select("counters").eq("user_id", user.id).maybeSingle();
  const { data: bonus } = await user.client.rpc("my_bonus_xp");
  return {
    counters: c?.counters ?? {},
    gamesPlayed: stats?.games_played ?? 0,
    gamesWon: stats?.games_won ?? 0,
    bestScore: stats?.best_score ?? null,
    winsByDifficulty: stats?.wins_by_difficulty ?? {},
    mpGamesPlayed: 0, mpGamesWon: 0, mpBestWinStreak: 0,
    bonusXp: Number(bonus ?? 0),
  } as AchievementProgressState;
}

test("solo-verify: regular game, stats/counters/history/baselines/XP agree; failures behave", async () => {
  const runId = newRunId();
  const u = await mkUser("solo", runId, "SoloTester");
  const admin = adminClient();
  try {
    const g = genSoloGame(4242);
    const expected: Record<string, number> = {};
    const replay = replaySoloGame(g.seed, g.seats as any, g.selectedContracts, g.moveLog);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    Object.assign(expected, replay.counterDeltas);
    mergeDeltas(expected, tableCompositionDeltas(g.seats));
    mergeDeltas(expected, finalGameDeltas(replay.state.players[0].cumulativeScore));

    // unauthenticated + malformed
    const noAuth = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/solo-verify`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, body: "{}",
    });
    console.log("[solo] unauth status", noAuth.status);
    expect(noAuth.status).toBe(401);
    const bad = await callFn(u.client, "solo-verify", { seed: 1 });
    console.log("[solo] malformed status", bad.status, bad.body.error);
    expect(bad.status).toBe(400);

    // tampered log: flip a card id in the first draw/discard-ish entry
    const tampered = JSON.parse(JSON.stringify(g.moveLog));
    const idx = tampered.findIndex((e: any) => e.type === "discard");
    tampered[idx].cardId = "no-such-card";
    const t = await callFn(u.client, "solo-verify", verifyPayload({ ...g, moveLog: tampered }));
    console.log("[solo] tampered status", t.status, t.body.error);
    expect(t.status).toBe(400);
    const { data: st0 } = await admin.from("player_stats").select("games_played").eq("user_id", u.id).maybeSingle();
    expect(st0?.games_played ?? 0).toBe(0);

    // real game
    const r1 = await callFn(u.client, "solo-verify", verifyPayload(g));
    console.log("[solo] verify status", r1.status, JSON.stringify(r1.body));
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(true);
    expect(r1.body.tracked).toBe(true);
    expect(Array.isArray(r1.body.quests)).toBe(true);

    const { data: stats } = await admin.from("player_stats").select("*").eq("user_id", u.id).maybeSingle();
    expect(stats?.games_played).toBe(1);
    const { data: hist } = await admin.from("game_history").select("id").eq("user_id", u.id);
    expect(hist?.length).toBe(1);
    const { data: cnt } = await admin.from("achievement_counters").select("counters").eq("user_id", u.id).maybeSingle();
    for (const [k, v] of Object.entries(expected)) if (v !== 0) expect(cnt?.counters?.[k], `counter ${k}`).toBe(v);

    // baselines snapshot for both live periods
    const keys = [currentPeriodKey("daily"), currentPeriodKey("weekly")];
    const { data: bl } = await admin.from("quest_baselines").select("period_key, baseline").eq("user_id", u.id);
    console.log("[solo] baseline keys", (bl ?? []).map((b) => b.period_key).join(","));
    expect((bl ?? []).map((b) => b.period_key).sort()).toEqual([...keys].sort());
    for (const b of bl ?? []) expect(b.baseline.games_played).toBe(0); // baseline taken BEFORE this game's deltas

    // 429 pacing
    const again = await callFn(u.client, "solo-verify", verifyPayload(genSoloGame(77)));
    console.log("[solo] immediate resubmit status", again.status);
    expect(again.status).toBe(429);
    const { data: stats2 } = await admin.from("player_stats").select("games_played").eq("user_id", u.id).maybeSingle();
    expect(stats2?.games_played).toBe(1);

    // XP: server compute_total_xp == local computeTotalXp of same progress
    const prog = await progressFor(u);
    const { data: srvXp, error: xpErr } = await u.client.rpc("compute_total_xp", { p_user_id: u.id });
    expect(xpErr).toBeNull();
    console.log("[solo] server xp", srvXp, "local xp", computeTotalXp(prog));
    expect(Number(srvXp)).toBe(computeTotalXp(prog));

    // untracked game: trackStats false
    await sleep(10_500);
    const un = await callFn(u.client, "solo-verify", verifyPayload(genSoloGame(78), { trackStats: false }));
    console.log("[solo] trackStats=false", un.status, JSON.stringify(un.body));
    expect(un.body.tracked).toBe(false);

    // the SAME log re-submitted after the 10s floor: is it counted again? (design observation)
    const replayed = await callFn(u.client, "solo-verify", verifyPayload(g));
    const { data: stats3 } = await admin.from("player_stats").select("games_played").eq("user_id", u.id).maybeSingle();
    console.log("[solo] identical log resubmitted after floor:", replayed.status, "games_played now", stats3?.games_played);
    // Redeployed solo-verify (+ migration 0084): a repeat is an idempotent no-op,
    // and the leaderboard row's total_xp was refreshed server-side.
    if (replayed.body.duplicate !== undefined) {
      expect(replayed.status).toBe(200);
      expect(replayed.body.duplicate).toBe(true);
      expect(replayed.body.tracked).toBe(false);
      expect(stats3?.games_played).toBe(1);
      const { data: lb } = await admin.from("leaderboard_entries").select("total_xp").eq("user_id", u.id).maybeSingle();
      if (lb) expect(Number(lb.total_xp)).toBe(Number(srvXp));
    } else {
      console.log("[solo] duplicate guard not deployed yet (needs migration 0084 + solo-verify redeploy)");
    }
  } finally {
    await cleanupUsers([u]);
  }
});

test("Daily Deal: 25 XP once, idempotent replay, bad date/seed rejected", async () => {
  const runId = newRunId();
  const u = await mkUser("daily", runId, "DailyTester");
  const admin = adminClient();
  try {
    const key = utcDayKey();
    const g = genSoloGame(dateSeed(key));
    const before = await progressFor(u);
    const r = await callFn(u.client, "solo-verify", verifyPayload(g, { isDailyDeal: true, dailyDealDateKey: key }));
    console.log("[daily] first", r.status, JSON.stringify(r.body));
    expect(r.status).toBe(200);
    expect(r.body.dailyDeal).toBe(true);
    expect(r.body.xp).toBe(25);
    expect(r.body.streakBonuses).toEqual([]);
    const { data: led } = await admin.from("xp_ledger").select("ref,kind,xp").eq("user_id", u.id);
    expect(led).toEqual([{ ref: `daily:${key}`, kind: "daily", xp: 25 }]);
    const { data: cnt } = await admin.from("achievement_counters").select("counters").eq("user_id", u.id).maybeSingle();
    expect(cnt?.counters?.daily_deals_completed).toBe(1);
    expect(cnt?.counters?.daily_deal_best_streak).toBe(1);

    // immediate replay -> pacing 429
    const r2 = await callFn(u.client, "solo-verify", verifyPayload(g, { isDailyDeal: true, dailyDealDateKey: key }));
    console.log("[daily] immediate replay", r2.status);
    expect(r2.status).toBe(429);
    // age the completion beyond the pacing floor, replay -> 0 XP
    await admin.from("daily_deal_completions").update({ completed_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", u.id);
    const r3 = await callFn(u.client, "solo-verify", verifyPayload(g, { isDailyDeal: true, dailyDealDateKey: key }));
    console.log("[daily] aged replay", r3.status, JSON.stringify(r3.body));
    expect(r3.status).toBe(200);
    expect(r3.body.xp).toBe(0);
    const { count } = await admin.from("xp_ledger").select("ref", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(1);

    // XP consistency
    const after = await progressFor(u);
    const { data: srvXp } = await u.client.rpc("compute_total_xp", { p_user_id: u.id });
    console.log("[daily] server xp", srvXp, "before(local)", computeTotalXp(before), "after(local)", computeTotalXp(after));
    expect(Number(srvXp)).toBe(computeTotalXp(after));
    expect(computeTotalXp(after) - computeTotalXp(before)).toBe(25);
    const { data: bonus } = await u.client.rpc("my_bonus_xp");
    expect(Number(bonus)).toBe(25);

    // leaderboard row: trigger-based streak recompute; total_xp only refreshes on a leaderboard write
    const { data: le1 } = await admin.from("leaderboard_entries").select("total_xp, daily_deal_streak, daily_deal_best_streak").eq("user_id", u.id).maybeSingle();
    console.log("[daily] leaderboard row after credit (no client sync yet):", JSON.stringify(le1));
    // exactly the column set syncLeaderboardStats + syncDailyDealStreak write (the triggers only fire when those columns are in the SET list)
    const { error: upErr } = await u.client.from("leaderboard_entries").upsert({ user_id: u.id, level: 0, total_xp: 0, games_played: 0, games_won: 0, daily_deal_streak: 0, daily_deal_best_streak: 0, updated_at: new Date().toISOString() });
    expect(upErr).toBeNull();
    const { data: le2 } = await admin.from("leaderboard_entries").select("total_xp, level, daily_deal_streak, daily_deal_best_streak").eq("user_id", u.id).maybeSingle();
    console.log("[daily] leaderboard row after client sync:", JSON.stringify(le2));
    expect(le2?.daily_deal_best_streak).toBe(1);
    expect(le2?.total_xp).toBe(computeTotalXp(after));
    if (le1?.total_xp !== computeTotalXp(after)) console.log("[daily] NOTE: leaderboard total_xp is stale until the client next writes its row");

    // bad date / seed
    await admin.from("daily_deal_completions").update({ completed_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", u.id);
    const old = dayKeyOffset(-4);
    const badDate = await callFn(u.client, "solo-verify", verifyPayload(genSoloGame(dateSeed(old)), { isDailyDeal: true, dailyDealDateKey: old }));
    console.log("[daily] date -4d", badDate.status, badDate.body.error);
    expect(badDate.status).toBe(400);
    const badSeed = await callFn(u.client, "solo-verify", verifyPayload(genSoloGame(5), { isDailyDeal: true, dailyDealDateKey: key }));
    console.log("[daily] seed mismatch", badSeed.status, badSeed.body.error);
    expect(badSeed.status).toBe(400);
  } finally {
    await cleanupUsers([u]);
  }
});

test("Daily Deal streak milestones (7 + 30 catch-up), idempotent", async () => {
  const runId = newRunId();
  const u = await mkUser("streak", runId, "StreakTester");
  const admin = adminClient();
  try {
    const key = utcDayKey();
    // 29 prior consecutive days => today is day 30
    const rows = Array.from({ length: 29 }, (_, i) => ({ user_id: u.id, date: dayKeyOffset(-(i + 1)), completed_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }));
    const { error: seedErr } = await admin.from("daily_deal_completions").insert(rows);
    expect(seedErr).toBeNull();
    const g = genSoloGame(dateSeed(key));
    const r = await callFn(u.client, "solo-verify", verifyPayload(g, { isDailyDeal: true, dailyDealDateKey: key }));
    console.log("[streak] status", r.status, JSON.stringify(r.body));
    expect(r.status).toBe(200);
    expect(r.body.xp).toBe(25);
    expect(r.body.streakBonuses).toEqual([{ days: 7, xp: 50 }, { days: 30, xp: 150 }]);
    const { data: bonus } = await u.client.rpc("my_bonus_xp");
    expect(Number(bonus)).toBe(25 + 50 + 150);
    const { data: cnt } = await admin.from("achievement_counters").select("counters").eq("user_id", u.id).maybeSingle();
    expect(cnt?.counters?.daily_deal_best_streak).toBe(30);
    expect(cnt?.counters?.daily_deals_completed).toBe(30);
    const { data: le } = await admin.from("leaderboard_entries").select("daily_deal_streak, daily_deal_best_streak").eq("user_id", u.id).maybeSingle();
    console.log("[streak] leaderboard streak cols", JSON.stringify(le));
    // replay pays nothing
    await admin.from("daily_deal_completions").update({ completed_at: new Date(Date.now() - 120_000).toISOString() }).eq("user_id", u.id).eq("date", key);
    const r2 = await callFn(u.client, "solo-verify", verifyPayload(g, { isDailyDeal: true, dailyDealDateKey: key }));
    expect(r2.body.xp).toBe(0);
    expect(r2.body.streakBonuses).toEqual([]);
    const { data: bonus2 } = await u.client.rpc("my_bonus_xp");
    expect(Number(bonus2)).toBe(225);
  } finally {
    await cleanupUsers([u]);
  }
});

test("Weekly Challenge: 100 XP once, replay pays 0, counters, compute_total_xp agrees", async () => {
  const runId = newRunId();
  const u = await mkUser("weekly", runId, "WeeklyTester");
  const admin = adminClient();
  try {
    const key = utcIsoWeekKey();
    const g = genSoloGame(dateSeed(key));
    const before = await progressFor(u);
    const r = await callFn(u.client, "solo-verify", verifyPayload(g, { isWeeklyChallenge: true, weeklyChallengeWeekKey: key }));
    console.log("[weekly] first", r.status, JSON.stringify(r.body));
    expect(r.status).toBe(200);
    expect(r.body.weeklyChallenge).toBe(true);
    expect(r.body.xp).toBe(100);
    await admin.from("weekly_challenge_completions").update({ completed_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", u.id);
    const r2 = await callFn(u.client, "solo-verify", verifyPayload(g, { isWeeklyChallenge: true, weeklyChallengeWeekKey: key }));
    console.log("[weekly] replay", r2.status, JSON.stringify(r2.body));
    expect(r2.body.xp).toBe(0);
    const { data: led } = await admin.from("xp_ledger").select("ref,xp").eq("user_id", u.id);
    expect(led).toEqual([{ ref: `weekly:${key}`, xp: 100 }]);
    const after = await progressFor(u);
    const { data: srvXp } = await u.client.rpc("compute_total_xp", { p_user_id: u.id });
    console.log("[weekly] server xp", srvXp, "local before/after", computeTotalXp(before), computeTotalXp(after));
    expect(Number(srvXp)).toBe(computeTotalXp(after));
    expect(after.counters.weekly_challenges_completed).toBe(1);
    const badWeek = "2026-W01";
    const bw = await callFn(u.client, "solo-verify", verifyPayload(genSoloGame(dateSeed(badWeek)), { isWeeklyChallenge: true, weeklyChallengeWeekKey: badWeek }));
    console.log("[weekly] far week", bw.status, bw.body.error);
    expect(bw.status).toBe(400);
  } finally {
    await cleanupUsers([u]);
  }
});

test("Quests: 3 daily + 3 weekly match client selection; auto-claim once; baselines first-wins", async () => {
  const runId = newRunId();
  const u = await mkUser("quest", runId, "QuestTester");
  const admin = adminClient();
  try {
    const dKey = currentPeriodKey("daily");
    const wKey = currentPeriodKey("weekly");
    const daily = questsForPeriod("daily", dKey);
    const weekly = questsForPeriod("weekly", wKey);
    expect(daily).toHaveLength(3);
    expect(weekly).toHaveLength(3);
    console.log("[quests] local daily", daily.map((q) => q.id).join(","), "weekly", weekly.map((q) => q.id).join(","));

    const s1 = await callFn(u.client, "solo-verify", { action: "quests" });
    console.log("[quests] sync#1", s1.status, JSON.stringify(s1.body));
    expect(s1.status).toBe(200);
    expect(s1.body.quests).toEqual([]);
    // owner-read RLS lets the user see own baselines
    const { data: ownBl } = await u.client.from("quest_baselines").select("period_key, baseline").eq("user_id", u.id);
    expect((ownBl ?? []).map((b) => b.period_key).sort()).toEqual([dKey, wKey].sort());
    const firstBaseline = JSON.stringify(ownBl!.find((b) => b.period_key === dKey)!.baseline);

    // push every quest metric far past every target (service role = stand-in for verified play)
    const counters: Record<string, number> = {};
    for (const m of QUEST_METRICS) if (m !== "games_played" && m !== "games_won") counters[m] = 500;
    await admin.from("achievement_counters").upsert({ user_id: u.id, counters });
    await admin.from("player_stats").upsert({ user_id: u.id, games_played: 50, games_won: 30 });

    const s2 = await callFn(u.client, "solo-verify", { action: "quests" });
    console.log("[quests] sync#2", s2.status, JSON.stringify(s2.body));
    const paid = (s2.body.quests as { id: string; period: string; xp: number }[]).map((q) => q.id).sort();
    const want = [...daily, ...weekly].map((q) => q.id).sort();
    expect(paid).toEqual(want);
    const xpWant = [...daily, ...weekly].reduce((a, q) => a + q.xp, 0);
    const { data: bonus } = await u.client.rpc("my_bonus_xp");
    expect(Number(bonus)).toBe(xpWant);
    const { data: led } = await admin.from("xp_ledger").select("ref").eq("user_id", u.id);
    expect((led ?? []).map((l) => l.ref).sort()).toEqual([...daily.map((q) => questLedgerRef(dKey, q.id)), ...weekly.map((q) => questLedgerRef(wKey, q.id))].sort());

    const s3 = await callFn(u.client, "solo-verify", { action: "quests" });
    expect(s3.body.quests).toEqual([]);
    const { data: bl2 } = await admin.from("quest_baselines").select("period_key, baseline").eq("user_id", u.id);
    expect(JSON.stringify(bl2!.find((b) => b.period_key === dKey)!.baseline)).toBe(firstBaseline); // baseline unchanged
    const { count } = await admin.from("xp_ledger").select("ref", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(6);
  } finally {
    await cleanupUsers([u]);
  }
});
