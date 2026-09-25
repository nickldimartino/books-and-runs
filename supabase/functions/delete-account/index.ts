// Books & Runs — self-serve account deletion.
//
// POST /delete-account  { password: string, confirm: true }   (signed in)
//
// GDPR Art. 17 / App Store 5.1.1(v) / Google Play: an account created in the
// app must be deletable from the app. What this does, in order — and it stops
// at the first failure so nothing is half-deleted:
//   1. verifies the caller's JWT, then re-verifies their PASSWORD server-side
//      (a fresh sign-in on a throwaway client — never trust the UI alone);
//   2. asks the `mp` function (with the caller's own JWT) to resign every
//      active multiplayer game they're in and cancel pending ones, so nobody
//      is left waiting on a ghost seat;
//   3. delete_account_prepare() (migration 0064, service role): revokes push
//      subscriptions, hands hosted games to another participant, rewrites the
//      account's seats in every game to "Deleted player";
//   4. removes the uploaded profile photo from the avatars bucket;
//   5. auth.admin.deleteUser — the FK cascade then removes profile, stats,
//      history, achievements, settings, saves, leaderboard entry, friendships,
//      inbox, blocks, participants, clubs/tournaments they own, etc.
//
// Deploy:  npx supabase functions deploy delete-account
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically. Also redeploy `mp` — step 2 calls /mp/resign_all.)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sign in first" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "sign in first" }, 401);

  let body: { password?: unknown; confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.confirm !== true) return json({ error: "confirmation required" }, 400);
  if (typeof body.password !== "string" || body.password.length === 0 || body.password.length > 1024) {
    return json({ error: "Current password is incorrect." }, 403);
  }
  if (!user.email) return json({ error: "Current password is incorrect." }, 403);

  // 1. Server-side re-authentication, on a client that never touches the
  //    caller's session.
  const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signedIn, error: pwErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: body.password,
  });
  if (pwErr || signedIn.user?.id !== user.id) return json({ error: "Current password is incorrect." }, 403);

  try {
    // 2. Leave every game cleanly (needs the engine, so it lives in `mp`).
    const mpRes = await fetch(`${SUPABASE_URL}/functions/v1/mp/resign_all`, {
      method: "POST",
      headers: { Authorization: authHeader, apikey: ANON_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!mpRes.ok) {
      console.error("delete-account: mp/resign_all failed", mpRes.status, await mpRes.text().catch(() => ""));
      return json({ error: "Couldn't leave your games — try again in a moment." }, 502);
    }

    // 3. Database-side prepare (anonymise, re-host, revoke pushes).
    const { data: prep, error: prepErr } = await admin.rpc("delete_account_prepare", { p_user: user.id });
    if (prepErr) {
      console.error("delete-account: prepare failed", prepErr);
      return json({ error: "Couldn't delete the account — try again in a moment." }, 500);
    }

    // 4. Uploaded avatar object(s) — the bucket is public, so they must not
    //    outlive the account. Path is "<uid>/avatar.<ext>"; list the folder
    //    rather than trusting the single stored path.
    try {
      const { data: files } = await admin.storage.from("avatars").list(user.id, { limit: 100 });
      const paths = (files ?? []).map((f: { name: string }) => `${user.id}/${f.name}`);
      const stored = (prep as { avatar_path?: string | null } | null)?.avatar_path;
      if (stored && stored.startsWith(`${user.id}/`) && !paths.includes(stored)) paths.push(stored);
      if (paths.length > 0) await admin.storage.from("avatars").remove(paths);
    } catch (err) {
      // Best-effort: a leftover object isn't worth blocking the deletion the
      // user asked for; it's logged for a manual sweep.
      console.error("delete-account: avatar cleanup failed", err);
    }

    // 5. The account itself (cascades the rest).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error("delete-account: deleteUser failed", delErr);
      return json({ error: "Couldn't delete the account — try again in a moment." }, 500);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("delete-account error:", err);
    return json({ error: "Couldn't delete the account — try again in a moment." }, 500);
  }
});
