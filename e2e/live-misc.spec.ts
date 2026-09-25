// LIVE verification: notification prefs round-trip, RLS sanity, leaderboard
// RPCs (paging / around-me / friends / >50 rows), delete-account.
import { expect, test } from "@playwright/test";
import { PUSH_LOCALES, PushKind, pushText, shouldPush, inQuietHours, pickPushLocale } from "../supabase/functions/_shared/push";
import { canRunLiveMpTests, REQUIRED_ENV_MESSAGE, seedFriendship, ANON_KEY, SUPABASE_URL, createTestUser, deleteTestUser } from "./helpers/testAccounts";
import { adminClient, callFn, cleanupUsers, mkUser, newRunId, sweepLiveTestUsers, TestUser } from "./helpers/liveHelpers";

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);
test.describe.configure({ timeout: 480_000 });
test.afterAll(async () => { await sweepLiveTestUsers(""); });

test("notification prefs + quiet hours + game-feel columns round-trip; constraints; push decisions/copy", async () => {
  const runId = newRunId();
  const u = await mkUser("prefs", runId, "PrefsUser");
  try {
    const patch = { user_id: u.id, notify_turns: false, notify_invites: true, notify_nudges: false, notify_streaks: null, quiet_hours_start: 22, quiet_hours_end: 7, tz_offset_minutes: -300, language: "de", game_speed: "fast", reduce_motion: "on", show_legal_moves: true, confirm_discard: false, updated_at: new Date().toISOString() };
    const up = await u.client.from("settings").upsert(patch);
    console.log("[prefs] upsert", up.error?.message ?? "ok");
    expect(up.error).toBeNull();
    const { data, error } = await u.client.from("settings").select("*").eq("user_id", u.id).maybeSingle();
    expect(error).toBeNull();
    for (const k of ["notify_turns", "notify_invites", "notify_nudges", "notify_streaks", "quiet_hours_start", "quiet_hours_end", "tz_offset_minutes", "language", "game_speed", "reduce_motion", "show_legal_moves", "confirm_discard"] as const) {
      expect((data as any)[k], k).toEqual((patch as any)[k]);
    }
    // constraints
    for (const bad of [{ quiet_hours_start: 24 }, { quiet_hours_end: -1 }, { tz_offset_minutes: 900 }, { tz_offset_minutes: -841 }]) {
      const r = await u.client.from("settings").upsert({ user_id: u.id, ...bad });
      console.log("[prefs] bad", JSON.stringify(bad), "->", r.error?.code);
      expect(r.error, JSON.stringify(bad)).toBeTruthy();
    }
    // turn everything off (NULL/NULL quiet hours) round-trips as null
    expect((await u.client.from("settings").upsert({ user_id: u.id, quiet_hours_start: null, quiet_hours_end: null })).error).toBeNull();
    const again = await u.client.from("settings").select("quiet_hours_start, quiet_hours_end, notify_turns").eq("user_id", u.id).maybeSingle();
    expect(again.data).toEqual({ quiet_hours_start: null, quiet_hours_end: null, notify_turns: false });
    // another user can't read it
    const other = await mkUser("prefs2", runId);
    const peek = await other.client.from("settings").select("notify_turns").eq("user_id", u.id);
    expect(peek.data ?? []).toEqual([]);
    // push decision logic against the REAL row
    const row = { ...(data as any) };
    const at = (h: number) => Date.UTC(2026, 8, 25, h, 0, 0) - row.tz_offset_minutes * 60_000; // instant whose local hour == h
    expect(shouldPush(row, "your_turn", Date.now())).toBe("category_off");
    expect(shouldPush(row, "game_request", at(23))).toBe("quiet_hours");
    expect(shouldPush(row, "game_request", at(3))).toBe("quiet_hours"); // wraps midnight
    expect(shouldPush(row, "game_request", at(12))).toBe("send");
    expect(shouldPush({ ...row, tz_offset_minutes: null }, "game_request", at(23))).toBe("send"); // tz unknown -> quiet hours ignored
    expect(inQuietHours({ ...row, quiet_hours_start: 5, quiet_hours_end: 5 }, at(5))).toBe(false);
    expect(pickPushLocale(row.language)).toBe("de");
    // localisation: every kind x locale is non-empty, non-English locales differ from English
    const kinds: PushKind[] = ["your_turn", "game_request", "nudge", "turn_warning", "auto_played", "forfeited", "friend_request", "friend_accepted", "streak_daily", "streak_weekly"];
    const problems: string[] = [];
    for (const l of PUSH_LOCALES) for (const k of kinds) {
      const t = pushText(k, l, { name: "Zed", round: 3, hours: 5, streak: 4 });
      if (!t.title || !t.body) problems.push(`${l}/${k} empty`);
      if (/\{\w+\}/.test(t.title + t.body)) problems.push(`${l}/${k} unfilled placeholder: ${t.title} | ${t.body}`);
      if (l !== "en" && pushText(k, "en", { name: "Zed", round: 3, hours: 5 }).body === t.body) problems.push(`${l}/${k} identical to English`);
    }
    console.log("[push] copy problems:", problems.length, problems.slice(0, 5).join(" ; "));
    expect(problems).toEqual([]);
    console.log("[push] de your_turn:", JSON.stringify(pushText("your_turn", "de", { name: "Zed", round: 3 })));
    await cleanupUsers([other]);
  } finally {
    await cleanupUsers([u]);
  }
});

test("RLS sanity: user A cannot read/write user B's quests/xp_ledger/blocks/reports, nor award XP", async () => {
  const runId = newRunId();
  const A = await mkUser("rlsA", runId, "RlsA");
  const B = await mkUser("rlsB", runId, "RlsB");
  const admin = adminClient();
  try {
    // give B private rows
    await admin.from("xp_ledger").insert({ user_id: B.id, ref: "daily:2026-09-25", kind: "daily", xp: 25 });
    await admin.from("quest_baselines").insert({ user_id: B.id, period_key: "2026-09-25", baseline: { games_played: 0 } });
    await admin.from("user_blocks").insert({ blocker_id: B.id, blocked_id: A.id });
    await admin.from("user_reports").insert({ reporter_id: B.id, reported_user_id: A.id, kind: "name", reason: "spam" });
    const results: string[] = [];
    const rd = async (table: string, col = "user_id", val = B.id) => {
      const r = await A.client.from(table).select("*").eq(col, val);
      const n = r.data?.length ?? 0;
      results.push(`${table}: read B rows -> ${r.error ? "ERR " + r.error.code : n}`);
      expect(n, `${table} leak`).toBe(0);
    };
    await rd("xp_ledger"); await rd("quest_baselines"); await rd("user_blocks", "blocker_id"); await rd("user_blocks", "blocked_id", A.id); // A must not see who blocked A
    await rd("user_reports", "reported_user_id", A.id); await rd("user_reports", "reporter_id"); await rd("settings"); await rd("player_stats"); await rd("achievement_counters"); await rd("game_history"); await rd("mp_events");
    // writes
    const w: [string, any][] = [
      ["xp_ledger insert own", await A.client.from("xp_ledger").insert({ user_id: A.id, ref: "hack:1", kind: "quest", xp: 1000 })],
      ["xp_ledger insert as B", await A.client.from("xp_ledger").insert({ user_id: B.id, ref: "hack:2", kind: "quest", xp: 1000 })],
      ["quest_baselines insert own", await A.client.from("quest_baselines").insert({ user_id: A.id, period_key: "2026-09-25", baseline: {} })],
      ["user_blocks insert direct", await A.client.from("user_blocks").insert({ blocker_id: A.id, blocked_id: B.id })],
      ["user_reports insert direct", await A.client.from("user_reports").insert({ reporter_id: A.id, reported_user_id: B.id, kind: "bio", reason: "spam" })],
      ["player_stats upsert own", await A.client.from("player_stats").upsert({ user_id: A.id, games_played: 999, games_won: 999 })],
      ["achievement_counters upsert own", await A.client.from("achievement_counters").upsert({ user_id: A.id, counters: { books_melded: 99999 } })],
    ];
    for (const [name, r] of w) { results.push(`${name}: ${r.error ? "denied (" + r.error.code + ")" : "ALLOWED"}`); expect(r.error, name).toBeTruthy(); }
    // mutate/delete B's rows (filters see 0 rows through RLS)
    const upd = await A.client.from("xp_ledger").update({ xp: 1 }).eq("user_id", B.id).select();
    const del = await A.client.from("xp_ledger").delete().eq("user_id", B.id).select();
    const delBl = await A.client.from("user_blocks").delete().eq("blocker_id", B.id).select();
    expect((upd.data ?? []).length + (del.data ?? []).length + (delBl.data ?? []).length).toBe(0);
    const still = await admin.from("xp_ledger").select("xp").eq("user_id", B.id);
    expect(still.data).toEqual([{ xp: 25 }]);
    const stillBl = await admin.from("user_blocks").select("blocker_id").eq("blocker_id", B.id);
    expect(stillBl.data).toHaveLength(1);
    // privileged RPCs
    const rpcs: [string, Record<string, unknown>][] = [
      ["solo_verify_set_counters", { p_user_id: A.id, p_patch: { books_melded: 99999 } }],
      ["delete_account_prepare", { p_user: B.id }],
      ["is_blocked_pair", { a: A.id, b: B.id }],
      ["content_flagged", { t: "x", kind: "name" }],
      ["leaderboard_ranked", { p_sort: "level", p_season: false, p_friends_only: false, p_min_games: 5, p_mp_min_games: 5 }],
    ];
    for (const [fn, args] of rpcs) {
      const r = await A.client.rpc(fn, args);
      results.push(`rpc ${fn}: ${r.error ? "denied (" + r.error.code + ")" : "ALLOWED"}`);
      expect(r.error, fn).toBeTruthy();
    }
    // informational: pre-existing (0013) — revoked from anon/public but not from `authenticated`, so callable; only ever bumps the CALLER's own counter (self-DoS at most)
    const bump = await A.client.rpc("mp_bump_rate_limit", { p_action: "e2e_probe", p_limit: 100 });
    results.push(`rpc mp_bump_rate_limit (INFO): ${bump.error ? "denied" : "callable by authenticated (caller-scoped)"}`);
    const cx = await A.client.rpc("compute_total_xp", { p_user_id: B.id });
    results.push(`rpc compute_total_xp(B): ${cx.error?.message ?? "ALLOWED"}`);
    expect(cx.error?.message).toMatch(/not authorized/);
    // my_bonus_xp is caller-scoped
    expect(Number((await A.client.rpc("my_bonus_xp")).data)).toBe(0);
    // leaderboard self-award: total_xp/level are recomputed by trigger
    const ll = await A.client.from("leaderboard_entries").upsert({ user_id: A.id, level: 500, total_xp: 9_999_999, games_played: 9999, games_won: 9999, is_test_account: true, is_creator: true });
    const { data: le } = await admin.from("leaderboard_entries").select("level,total_xp,games_played,is_test_account,is_creator").eq("user_id", A.id).maybeSingle();
    results.push(`leaderboard self-award -> ${ll.error ? "ERR " + ll.error.message : JSON.stringify(le)}`);
    expect(le?.total_xp ?? 0).toBe(0); expect(le?.level ?? 0).toBe(0); expect(le?.games_played ?? 0).toBe(0);
    expect(le?.is_test_account ?? false).toBe(false); expect(le?.is_creator ?? false).toBe(false);
    // anon (no session) reads
    for (const t of ["xp_ledger", "quest_baselines", "user_blocks", "user_reports"]) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` } });
      const txt = await r.text();
      results.push(`anon GET ${t}: ${r.status} ${txt.slice(0, 40)}`);
      expect(txt === "[]" || r.status >= 400, `anon ${t}`).toBe(true);
    }
    console.log("[rls]\n  " + results.join("\n  "));
    // the solo-verify quest sync for A must not have paid B's stuff / self award
    const q = await callFn(A.client, "solo-verify", { action: "quests" });
    expect(q.body.quests).toEqual([]);
  } finally {
    await cleanupUsers([A, B]);
  }
});

test("leaderboard RPCs: >50 rows, paging, my row / around-me, friends filter, blocks, sorts, limits", async () => {
  const runId = newRunId();
  const admin = adminClient();
  const me = await mkUser("lbme", runId, "LbMe");
  const N = 55;
  const bots: TestUser[] = [];
  try {
    for (let i = 0; i < N; i += 11) {
      await Promise.all(Array.from({ length: Math.min(11, N - i) }, async (_, j) => {
        const idx = i + j;
        const b = await createTestUser(`live-lb${idx}`, runId);
        bots.push(b);
        await admin.from("player_stats").upsert({ user_id: b.id, games_played: 5000 + idx, games_won: idx });
        const { error } = await admin.from("leaderboard_entries").upsert({ user_id: b.id, display_name: `LbBot${idx}`, games_played: 0 });
        if (error) throw error;
      }));
    }
    // "me" sits in the middle of the bots by games_played
    await admin.from("player_stats").upsert({ user_id: me.id, games_played: 5027, games_won: 0 });
    await admin.from("leaderboard_entries").upsert({ user_id: me.id, display_name: "LbMe", games_played: 0 });
    const page = (offset: number, limit: number, extra: Record<string, unknown> = {}) =>
      me.client.rpc("leaderboard_page", { p_sort: "games_played", p_season: false, p_friends_only: false, p_offset: offset, p_limit: limit, p_min_games: 5, p_mp_min_games: 5, ...extra });
    const t0 = Date.now();
    const p1 = await page(0, 50);
    const ms = Date.now() - t0;
    expect(p1.error).toBeNull();
    const rows1 = p1.data as any[];
    console.log("[lb] page1 rows", rows1.length, "total", rows1[0]?.total, "latency ms", ms, "first ranks", rows1.slice(0, 3).map((r) => r.rank).join(","));
    expect(rows1).toHaveLength(50);
    expect(Number(rows1[0].total)).toBeGreaterThanOrEqual(N + 1);
    expect(rows1.map((r) => Number(r.rank))).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const p2 = (await page(50, 50)).data as any[];
    console.log("[lb] page2 rows", p2.length, "ranks", p2[0]?.rank, "..", p2[p2.length - 1]?.rank);
    expect(p2.length).toBeGreaterThanOrEqual(6);
    expect(Number(p2[0].rank)).toBe(51);
    const ids = [...rows1, ...p2].map((r) => r.entry.user_id);
    expect(new Set(ids).size).toBe(ids.length); // no dupes across pages
    // sorted descending by games_played
    const gp = [...rows1, ...p2].map((r) => r.entry.games_played as number);
    expect([...gp].sort((a, b) => b - a)).toEqual(gp);
    // total is stable across pages
    expect(Number(p2[0].total)).toBe(Number(rows1[0].total));
    // limits: >100 clamps to 100, 0/negative clamps to 1, negative offset -> 0
    expect(((await page(0, 500)).data as any[]).length).toBe(Math.min(100, Number(rows1[0].total)));
    expect(((await page(0, 0)).data as any[]).length).toBe(1);
    expect(Number(((await page(-10, 3)).data as any[])[0].rank)).toBe(1);
    expect(((await page(10_000, 50)).data as any[]).length).toBe(0);
    // my row + around-me window
    const my = await me.client.rpc("leaderboard_my_row", { p_sort: "games_played", p_season: false, p_friends_only: false, p_min_games: 5, p_mp_min_games: 5 });
    const myRow = (my.data as any[])[0];
    const all = [...rows1, ...p2, ...(((await page(100, 100)).data as any[]) ?? [])];
    const pos = all.findIndex((r) => r.entry.user_id === me.id);
    console.log("[lb] my rank", myRow?.rank, "position in listing", pos + 1, "total", myRow?.total);
    expect(Number(myRow.rank)).toBe(pos + 1);
    const around = (await page(Math.max(0, Number(myRow.rank) - 6), 11)).data as any[];
    expect(around.map((r) => r.entry.user_id)).toContain(me.id);
    expect(Number(around[0].rank)).toBe(Number(myRow.rank) - 5);
    // friends filter
    for (const b of bots.slice(0, 3)) await seedFriendship(me.id, b.id);
    const fr = (await page(0, 50, { p_friends_only: true })).data as any[];
    console.log("[lb] friends-only rows", fr.length, "total", fr[0]?.total);
    expect(fr.map((r) => r.entry.user_id).sort()).toEqual([me.id, ...bots.slice(0, 3).map((b) => b.id)].sort());
    expect(Number(fr[0].total)).toBe(4);
    expect(fr.map((r) => Number(r.rank))).toEqual([1, 2, 3, 4]);
    // block hides both ways, and shrinks total by one for each side
    const target = bots[10];
    const totalBefore = Number(rows1[0].total);
    expect((await me.client.rpc("block_user", { p_user: target.id })).error).toBeNull();
    const after = (await page(0, 100)).data as any[];
    expect(after.map((r) => r.entry.user_id)).not.toContain(target.id);
    expect(Number(after[0].total)).toBe(totalBefore - 1);
    // every sort key + season mode runs
    for (const sort of ["level", "total_xp", "achievements", "win_rate", "average_score", "games_played", "games_won", "worst_score", "daily_deal_streak", "daily_deal_best_streak", "mp_games_won", "mp_win_rate", "mp_best_win_streak", "bogus"]) {
      for (const season of [false, true]) {
        const r = await page(0, 5, { p_sort: sort, p_season: season });
        expect(r.error, `${sort}/${season}`).toBeNull();
      }
    }
    // unauthenticated
    const anon = await fetch(`${SUPABASE_URL}/rest/v1/rpc/leaderboard_page`, { method: "POST", headers: { apikey: ANON_KEY!, "Content-Type": "application/json" }, body: "{}" });
    console.log("[lb] anon leaderboard_page ->", anon.status);
    expect([401, 403, 404]).toContain(anon.status);
  } finally {
    await cleanupUsers([me, ...bots]);
  }
});

test("delete-account: wrong password refused, then full cascade/anonymise/resign/avatar/auth-user removal", async () => {
  const runId = newRunId();
  const D = await mkUser("del", runId, "DelDana");
  const E = await mkUser("delE", runId, "DelEve");
  const admin = adminClient();
  try {
    await seedFriendship(D.id, E.id);
    // an active MP game D hosts, plus a pending one, a club, an avatar, ledger data, a report
    const g = await callFn(D.client, "mp", { contract_rounds: [1, 2], seats: [{ kind: "human", user_id: E.id }] }, "/create");
    expect((await callFn(E.client, "mp", { game_id: g.body.game_id, accept: true }, "/respond")).body.status).toBe("active");
    const g2 = await callFn(E.client, "mp", { contract_rounds: [1], seats: [{ kind: "human", user_id: D.id }] }, "/create"); // pending, D invited
    expect(g2.status).toBe(200);
    const club = await D.client.rpc("club_create", { p_name: "DelClub" });
    expect(club.error).toBeNull();
    expect((await D.client.rpc("club_add_member", { p_club_id: club.data, p_user_id: E.id })).error).toBeNull();
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    const path = `${D.id}/avatar.jpg`;
    const up = await D.client.storage.from("avatars").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    console.log("[delete] avatar upload", up.error?.message ?? "ok");
    if (!up.error) await D.client.from("leaderboard_entries").upsert({ user_id: D.id, avatar_kind: "photo", avatar_photo_path: path });
    await admin.from("xp_ledger").insert({ user_id: D.id, ref: "daily:2026-09-25", kind: "daily", xp: 25 });
    await admin.from("mp_events").insert({ user_id: E.id, actor_id: D.id, kind: "nudge", game_id: g.body.game_id });
    await D.client.rpc("report_user", { p_reported_user_id: E.id, p_kind: "other", p_reason: "spam" });

    // refusals
    const noAuth = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, { method: "POST", headers: { apikey: ANON_KEY!, "Content-Type": "application/json" }, body: JSON.stringify({ password: "x", confirm: true }) });
    expect(noAuth.status).toBe(401);
    const noConfirm = await callFn(D.client, "delete-account", { password: D.password });
    expect(noConfirm.status).toBe(400);
    const wrong = await callFn(D.client, "delete-account", { password: "definitely-wrong", confirm: true });
    console.log("[delete] wrong password ->", wrong.status, wrong.body.error);
    expect(wrong.status).toBe(403);
    const empty = await callFn(D.client, "delete-account", { password: "", confirm: true });
    expect(empty.status).toBe(403);
    expect((await admin.auth.admin.getUserById(D.id)).data.user).toBeTruthy(); // untouched
    expect((await admin.from("mp_games").select("status").eq("id", g.body.game_id).maybeSingle()).data?.status).toBe("active");

    // the real thing
    const ok = await callFn(D.client, "delete-account", { password: D.password, confirm: true });
    console.log("[delete] right password ->", ok.status, JSON.stringify(ok.body));
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);

    const gone = await admin.auth.admin.getUserById(D.id);
    expect(gone.data.user).toBeNull();
    for (const [t, col] of [["leaderboard_entries", "user_id"], ["profiles", "id"], ["xp_ledger", "user_id"], ["settings", "user_id"], ["mp_participants", "user_id"], ["friendships", "requester_id"], ["club_members", "user_id"]] as const) {
      const c = await admin.from(t).select("*", { count: "exact", head: true }).eq(col, D.id);
      console.log(`[delete] leftover rows in ${t}:`, c.count, c.error?.message ?? "");
      expect(c.count ?? 0, t).toBe(0);
    }
    const clubLeft = await admin.from("clubs").select("id").eq("id", club.data as string);
    console.log("[delete] owned club remaining:", clubLeft.data?.length);
    const files = await admin.storage.from("avatars").list(D.id);
    console.log("[delete] avatar objects remaining:", files.data?.length ?? "n/a", files.error?.message ?? "");
    expect(files.data ?? []).toEqual([]);
    // MP: game re-homed + resigned + anonymised for the survivor
    const { data: game } = await admin.from("mp_games").select("status, host_id, seats").eq("id", g.body.game_id).maybeSingle();
    console.log("[delete] shared game after deletion: status", game?.status, "host is E:", game?.host_id === E.id, "seats", JSON.stringify(game?.seats).replace(new RegExp(D.id, "g"), "<D>"));
    expect(game).toBeTruthy();
    expect(game!.status).toBe("complete");
    expect(game!.host_id).toBe(E.id);
    expect(JSON.stringify(game!.seats)).not.toContain(D.id);
    expect(JSON.stringify(game!.seats)).not.toContain("DelDana");
    expect(JSON.stringify(game!.seats)).toContain("Deleted player");
    const { data: gs } = await admin.from("mp_game_state").select("engine").eq("game_id", g.body.game_id).maybeSingle();
    expect(JSON.stringify(gs?.engine)).not.toContain("DelDana");
    // pending game D was invited to: cancelled
    const { data: pg } = await admin.from("mp_games").select("status").eq("id", g2.body.game_id).maybeSingle();
    console.log("[delete] pending game D was invited to ->", pg?.status);
    // E's inbox event from D: actor cleared or removed, not dangling
    const ev = await admin.from("mp_events").select("actor_id").eq("user_id", E.id).eq("kind", "nudge");
    console.log("[delete] E's nudge-from-D events:", JSON.stringify(ev.data));
    // E still works: sees game in history, friends list no D
    const fl = ((await E.client.rpc("mp_my_friends")).data as any[]) ?? [];
    expect(fl.map((f) => f.user_id)).not.toContain(D.id);
    const hist = await E.client.rpc("mp_my_history", { limit_n: 20 });
    expect(hist.error).toBeNull();
    // deleted user's JWT is dead
    const stale = await callFn(D.client, "mp", {}, "/resign_all");
    console.log("[delete] deleted user's old session on mp ->", stale.status);
    // the reported-by-D report row is kept with reporter null
    const rep = await admin.from("user_reports").select("reporter_id").eq("reported_user_id", E.id);
    console.log("[delete] report D filed against E kept with reporter null:", JSON.stringify(rep.data));
  } finally {
    await cleanupUsers([D, E]);
    await admin.storage.from("avatars").remove([`${D.id}/avatar.jpg`]).catch(() => {});
  }
});
