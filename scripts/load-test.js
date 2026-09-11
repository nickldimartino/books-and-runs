// Books & Runs — k6 load test for the Supabase backend.
//
// ⚠️ This hits REAL infrastructure — your actual Supabase project (Postgres
// + the `mp` Edge Function), not a staging copy. It costs real compute/
// bandwidth against your plan's quota and can affect real users if you
// point it at production while people are playing. Nobody should ever run
// this against your project without you deciding to, which is exactly why
// this file only ever sits here as a script — it is NOT wired into CI, a
// dev script, or anything else that could fire it automatically.
//
// What it doesn't (currently) tell you: the actual per-request latency
// breakdown inside Postgres/the Edge Function — that's in your Supabase
// dashboard's own metrics, alongside whatever this reports. Start small.
//
// ── Setup ───────────────────────────────────────────────────────────────
// 1. Install k6: https://k6.io/docs/get-started/installation/ (`brew
//    install k6` on macOS).
// 2. Get a real access token for a signed-in test account — don't use your
//    own main account for a load test. Easiest path: sign up a throwaway
//    account in the app, sign in, then in your browser's devtools →
//    Application/Storage → Local Storage → find the
//    `sb-<project-ref>-auth-token` entry → copy its `access_token` field.
//    (Same idea as e2e/multiplayer.spec.ts's throwaway accounts, just
//    obtained by hand here instead of the Admin API, so this script never
//    needs your service_role key.)
// 3. Optional: create one multiplayer game with that account (through the
//    app) and note its id from the URL (`/multiplayer/play?g=<id>`) to
//    also exercise GET_STATE against a real game, not just the games list.
//
// ── Run ─────────────────────────────────────────────────────────────────
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_ANON_KEY=eyJ... \
//   TEST_JWT=eyJ... \
//   TEST_GAME_ID=<uuid, optional> \
//   k6 run scripts/load-test.js
//
// Defaults to a gentle 5 virtual users for 30s (LOAD_VUS / LOAD_DURATION
// env vars override it) — a smoke check, not a real stress test. Scale up
// deliberately, and watch your Supabase dashboard while you do.

import http from "k6/http";
import { check, sleep } from "k6";

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TEST_JWT = __ENV.TEST_JWT;
const TEST_GAME_ID = __ENV.TEST_GAME_ID || null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_JWT) {
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_ANON_KEY, and TEST_JWT (see this file's own setup comment) before running."
  );
}

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: Number(__ENV.LOAD_VUS || 5),
      duration: __ENV.LOAD_DURATION || "30s",
    },
  },
  thresholds: {
    // Fails the run (non-zero exit) if things get bad enough to act on —
    // tune these once you know what "normal" looks like for your project.
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

const authHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${TEST_JWT}`,
  "Content-Type": "application/json",
};

// Weighted mix of the actual hot paths a live game generates:
//   - mp_my_games: Home + useNotifications poll this constantly.
//   - mp/state: every open multiplayer game screen polls/re-fetches this
//     on every Realtime event — the single busiest read during real play.
function callMpMyGames() {
  const res = http.post(`${SUPABASE_URL}/rest/v1/rpc/mp_my_games`, "{}", { headers: authHeaders });
  check(res, { "mp_my_games: 200": (r) => r.status === 200 });
}

function callMpState() {
  if (!TEST_GAME_ID) return;
  const res = http.post(
    `${SUPABASE_URL}/functions/v1/mp/state`,
    JSON.stringify({ game_id: TEST_GAME_ID }),
    { headers: authHeaders }
  );
  check(res, { "mp/state: 200": (r) => r.status === 200 });
}

export default function () {
  callMpMyGames();
  sleep(0.5);
  callMpState();
  sleep(1 + Math.random());
}
