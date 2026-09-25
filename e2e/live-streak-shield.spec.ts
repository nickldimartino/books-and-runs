// LIVE check of the streak-shield server rule (migration 0081). Needs the
// service-role key (skips without it) and migration 0081 applied (skips with
// a note otherwise). No browser. Completion rows are inserted with the admin
// client (exactly what solo-verify does) and the leaderboard row the AFTER
// INSERT trigger refreshes is asserted.
import { expect, test } from "@playwright/test";
import { canRunLiveMpTests, REQUIRED_ENV_MESSAGE } from "./helpers/testAccounts";
import { adminClient, cleanupUsers, dayKeyOffset, mkUser, newRunId, sweepLiveTestUsers } from "./helpers/liveHelpers";

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);
test.describe.configure({ timeout: 120_000 });
test.afterAll(async () => { await sweepLiveTestUsers(""); });

async function migration0081Applied(): Promise<boolean> {
  const { data } = await adminClient().from("schema_migrations").select("version").eq("version", "0081_streak_shields").maybeSingle();
  return !!data;
}

test("Daily Deal: a 7-day run earns a shield that covers one missed day; a client cannot write shields", async () => {
  test.skip(!(await migration0081Applied()), "migration 0081 not applied on this project yet");
  const u = await mkUser("dshield", newRunId(), "ShieldTester");
  const admin = adminClient();
  try {
    // 7 consecutive days ending 3 days ago, then skip one day, then play two more.
    const played = [-9, -8, -7, -6, -5, -4, -3, -1, 0].map((o) => dayKeyOffset(o));
    const { error } = await admin.from("daily_deal_completions").insert(played.map((date) => ({ user_id: u.id, date })));
    expect(error).toBeNull();
    const cols = "daily_deal_streak, daily_deal_best_streak, daily_deal_last_played, daily_deal_shields, daily_deal_shields_earned, daily_deal_shields_used, daily_deal_covered_days";
    const { data: le } = await admin.from("leaderboard_entries").select(cols).eq("user_id", u.id).single();
    expect(le).toEqual({
      daily_deal_streak: 9,
      daily_deal_best_streak: 9,
      daily_deal_last_played: dayKeyOffset(0),
      daily_deal_shields: 0,
      daily_deal_shields_earned: 1,
      daily_deal_shields_used: 1,
      daily_deal_covered_days: [dayKeyOffset(-2)],
    });
    // No client can claim shields: the BEFORE trigger recomputes them.
    await u.client.from("leaderboard_entries").upsert({ user_id: u.id, daily_deal_shields: 2, daily_deal_shields_earned: 9, updated_at: new Date().toISOString() });
    const { data: after } = await admin.from("leaderboard_entries").select("daily_deal_shields, daily_deal_shields_earned").eq("user_id", u.id).single();
    expect(after).toEqual({ daily_deal_shields: 0, daily_deal_shields_earned: 1 });
  } finally {
    await cleanupUsers([u]);
  }
});
