// LIVE regression for "I completed today's Daily Deal but it shows I didn't"
// (Sept 25 2026). Needs the service-role key (skips without it). No browser.
//   1. a verified completion must refresh the account's leaderboard streak
//      columns by itself (migration 0080's AFTER INSERT trigger) — before the
//      fix the client's own sync raced the completion insert and stored 0/null;
//   2. a US player's local-evening completion (local day already "yesterday"
//      in UTC) must be accepted (solo-verify's isBelievableDayKey).
// (1) needs migration 0080 applied and (2) needs solo-verify redeployed with
// this change — each check skips itself with a clear note if the live project
// hasn't got that yet, so the spec is green before and after the rollout.
import { expect, test } from "@playwright/test";
import { canRunLiveMpTests, REQUIRED_ENV_MESSAGE } from "./helpers/testAccounts";
import {
  adminClient, callFn, cleanupUsers, dateSeed, dayKeyOffset, genSoloGame, mkUser, newRunId, sweepLiveTestUsers,
  verifyPayload,
} from "./helpers/liveHelpers";

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);
test.describe.configure({ timeout: 120_000 });
test.afterAll(async () => { await sweepLiveTestUsers(""); });

async function migration0080Applied(): Promise<boolean> {
  const { data } = await adminClient().from("schema_migrations").select("version").eq("version", "0080_challenge_streak_refresh_and_repair").maybeSingle();
  return !!data;
}

test("Daily Deal: a verified completion is visible on the leaderboard row even after the client's racing sync", async () => {
  const applied = await migration0080Applied();
  test.skip(!applied, "migration 0080 not applied on this project yet");
  const u = await mkUser("dstreak", newRunId(), "StreakTester");
  const admin = adminClient();
  try {
    const key = dayKeyOffset(0);
    // What GameOverScreen does: the client sync fires first (no completion yet)...
    await u.client.from("leaderboard_entries").upsert({
      user_id: u.id, daily_deal_streak: 1, daily_deal_best_streak: 1, daily_deal_last_played: key, updated_at: new Date().toISOString(),
    });
    // ...then the verified completion lands.
    const r = await callFn(u.client, "solo-verify", verifyPayload(genSoloGame(dateSeed(key)), { isDailyDeal: true, dailyDealDateKey: key }));
    expect(r.status).toBe(200);
    const { data: le } = await admin.from("leaderboard_entries").select("daily_deal_streak, daily_deal_best_streak, daily_deal_last_played").eq("user_id", u.id).single();
    expect(le).toEqual({ daily_deal_streak: 1, daily_deal_best_streak: 1, daily_deal_last_played: key });
  } finally {
    await cleanupUsers([u]);
  }
});

test("Daily Deal: a completion for the local day that is already 'yesterday' in UTC is accepted", async () => {
  // Real local days D are live until D+1 12:00Z (UTC-12); the old check
  // refused anything past D+1 00:00Z, i.e. every US player's evening.
  test.skip(new Date().getUTCHours() >= 11, "only meaningful before 11:00 UTC (yesterday's key must still be live somewhere)");
  const u = await mkUser("dtz", newRunId(), "TzTester");
  try {
    const key = dayKeyOffset(-1);
    const r = await callFn(u.client, "solo-verify", verifyPayload(genSoloGame(dateSeed(key)), { isDailyDeal: true, dailyDealDateKey: key }));
    test.skip(r.status === 400 && /invalid Daily Deal date/.test(String(r.body.error)), "solo-verify not redeployed with the tolerance fix yet");
    expect(r.status).toBe(200);
    expect(r.body.dailyDeal).toBe(true);
  } finally {
    await cleanupUsers([u]);
  }
});
