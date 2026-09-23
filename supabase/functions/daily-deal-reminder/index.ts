// Books & Runs — Daily Deal AND Weekly Challenge streak-at-risk reminders.
//
// Push notifications previously only ever fired for multiplayer events
// (your_turn/game_request/nudge, see mp/index.ts's PUSH_COPY) — this was
// the first one for anything else, and Weekly Challenge's own reminder
// (added later) rides the same daily firing rather than getting a second
// deployed function, Vault secret, and cron schedule for what's otherwise
// an identical shape — see checkWeeklyChallenge()'s own doc for why it
// only actually sends on 2 of every 7 firings. Still named for Daily Deal
// (renaming a deployed function/cron job is real migration churn for zero
// functional gain) — this comment is the source of truth for its real
// scope, not the filename. Triggered once a day by a pg_cron job (see
// supabase/migrations/0038_daily_deal_reminder_cron.sql), never by a
// client, so there's no user JWT on the request — auth is a single shared
// secret (CRON_SECRET, a Supabase function secret, checked against the
// Authorization header the cron job sends) instead of the per-user-JWT
// pattern every other function here uses.
//
// Deploy:  supabase functions deploy daily-deal-reminder
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically;
// CRON_SECRET and the VAPID_* keys are not — see this repo's
// supabase/functions/README.md.)

import { createClient } from "jsr:@supabase/supabase-js@2";
// Same Web Push mechanics as mp/index.ts's sendPushForEvent — see that
// file's own doc for why the npm compat import is used here instead of a
// hand-rolled implementation.
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@booksandruns.app";
const PUSH_ENABLED = !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY;
if (PUSH_ENABLED) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ONE_DAY_MS = 86_400_000;

/** Yesterday, as a `date`-column-comparable "YYYY-MM-DD" (UTC). */
function yesterdayUtc(): string {
  return new Date(Date.now() - ONE_DAY_MS).toISOString().slice(0, 10);
}

/** Same ISO-8601-week algorithm as weeklyChallengeStore.ts's isoWeekKey,
 * done on UTC getters instead of local-timezone ones — same "server has no
 * concept of any one account's local midnight" reasoning as yesterdayUtc()
 * above, just for a week boundary instead of a day one. */
function isoWeekKeyUtc(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (4 - isoDay));
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / ONE_DAY_MS + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Fixed-time comparison, same reasoning/shape as stripe-webhook's own
 * signature check — a plain `!==` on the raw strings short-circuits at
 * the first differing byte, a timing side channel a remote attacker could
 * in principle use to recover CRON_SECRET one byte at a time. Hashing
 * both sides to a fixed length first also means this doesn't leak
 * anything about the *lengths* of the compared strings either. */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

interface AtRiskRow {
  user_id: string;
  streak: number;
}

/** Shared by both checks below: looks up push subscriptions for exactly
 * these accounts and fires one notification each, using `buildPayload` for
 * the copy/tag (the two reminders need different wording and a different
 * `tag` so a device holding both keeps them as two distinct notifications,
 * not one overwriting the other). Same cleanup-vs-log split on a failed
 * send as mp/index.ts's sendPushForEvent. */
async function notifyAtRisk(
  rows: AtRiskRow[],
  buildPayload: (streak: number) => Record<string, string>,
  logLabel: string
): Promise<number> {
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.user_id);
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", ids);

  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      const streak = rows.find((r) => r.user_id === s.user_id)?.streak ?? 0;
      const payload = JSON.stringify(buildPayload(streak));
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          payload
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number } | null)?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error(`${logLabel} push failed:`, err);
        }
      }
    })
  );
  return sent;
}

/** "At risk" = daily_deal_last_played is exactly yesterday — a real streak
 * (daily_deal_streak > 0, migration 0036's trigger keeps this honest) that
 * hasn't been extended to today yet. This is UTC-date based, not each
 * account's own local midnight — nothing in this schema tracks per-user
 * timezone, so a single daily firing can't line up with everyone's actual
 * evening. Good enough for a once-a-day nudge; the person who already
 * played today in their own timezone but whose UTC date hasn't rolled
 * over yet just won't be in this query (daily_deal_last_played would
 * already read as today), so this never sends a false "at risk" ping to
 * someone who already played — it can only ever be late or early by a
 * few hours relative to their own clock, never wrong about the fact
 * itself. */
async function checkDailyDeal(): Promise<number> {
  const { data: atRisk, error } = await admin
    .from("leaderboard_entries")
    .select("user_id, daily_deal_streak")
    .gt("daily_deal_streak", 0)
    .eq("daily_deal_last_played", yesterdayUtc());
  if (error) {
    console.error("Failed to query at-risk Daily Deal streaks:", error);
    return 0;
  }
  const rows: AtRiskRow[] = (atRisk ?? []).map((r) => ({ user_id: r.user_id, streak: r.daily_deal_streak }));
  return notifyAtRisk(
    rows,
    (streak) => ({
      title: "Your streak is at risk!",
      body: `Play today's Daily Deal to keep your ${streak}-day streak going.`,
      url: "/",
      tag: "daily-deal-reminder",
    }),
    "daily-deal-reminder"
  );
}

/** Same "at risk" shape as Daily Deal — weekly_challenge_streak > 0 and
 * weekly_challenge_last_played is the *previous* ISO week, i.e. this
 * account hasn't played this week's challenge yet — but unlike Daily
 * Deal's one-day window, a week-long "haven't played this week yet" window
 * would otherwise be true for 6 of a week's 7 days, and firing the same
 * nudge every single one of those days would just be spam. Only actually
 * queries/sends on the last 2 days of the ISO week (Saturday/Sunday UTC) —
 * still a same-mechanism reuse of this function's daily cron firing (see
 * this file's own top-of-file doc for why that beats a second deployed
 * function), just gated to the 2 firings a week where "at risk" is real
 * urgency rather than "technically true all week." */
async function checkWeeklyChallenge(): Promise<number> {
  const now = new Date();
  if (now.getUTCDay() !== 6 && now.getUTCDay() !== 0) return 0;

  const lastWeek = isoWeekKeyUtc(new Date(now.getTime() - 7 * ONE_DAY_MS));
  const { data: atRisk, error } = await admin
    .from("leaderboard_entries")
    .select("user_id, weekly_challenge_streak")
    .gt("weekly_challenge_streak", 0)
    .eq("weekly_challenge_last_played", lastWeek);
  if (error) {
    console.error("Failed to query at-risk Weekly Challenge streaks:", error);
    return 0;
  }
  const rows: AtRiskRow[] = (atRisk ?? []).map((r) => ({ user_id: r.user_id, streak: r.weekly_challenge_streak }));
  return notifyAtRisk(
    rows,
    (streak) => ({
      title: "Your weekly streak is at risk!",
      body: `Play this week's Weekly Challenge to keep your ${streak}-week streak going.`,
      url: "/",
      tag: "weekly-challenge-reminder",
    }),
    "weekly-challenge-reminder"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || !(await timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`))) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!PUSH_ENABLED) return json({ sent: 0, reason: "push not configured" });

  const [dailyDeal, weeklyChallenge] = await Promise.all([checkDailyDeal(), checkWeeklyChallenge()]);
  return json({ sent: dailyDeal + weeklyChallenge, dailyDeal, weeklyChallenge });
});
