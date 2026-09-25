// LIVE verification of blocks / reports / content filter (migration 0060).
import { expect, test } from "@playwright/test";
import { checkContent } from "@/safety/contentFilter";
import { contentRejectionFromServer } from "../app/lib/safetyStore";
import { canRunLiveMpTests, REQUIRED_ENV_MESSAGE, seedFriendship } from "./helpers/testAccounts";
import { adminClient, callFn, cleanupUsers, mkUser, newRunId, sweepLiveTestUsers } from "./helpers/liveHelpers";

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);
test.describe.configure({ timeout: 240_000 });
test.afterAll(async () => { await sweepLiveTestUsers(""); });

async function seedBoardRow(uid: string, name: string, gamesPlayed: number) {
  const admin = adminClient();
  await admin.from("player_stats").upsert({ user_id: uid, games_played: gamesPlayed, games_won: 0 });
  const { error } = await admin.from("leaderboard_entries").upsert({ user_id: uid, display_name: name, games_played: 0 }); // games_played in the SET list fires sync_leaderboard_truth
  if (error) throw error;
}

test("blocks: hides both ways in friends / friend-code lookup / leaderboard / invites; reversible", async () => {
  const runId = newRunId();
  const A = await mkUser("blkA", runId, "BlkAlice");
  const B = await mkUser("blkB", runId, "BlkBob");
  const C = await mkUser("blkC", runId, "BlkCarol");
  const admin = adminClient();
  try {
    await Promise.all([seedBoardRow(A.id, "BlkAlice", 3001), seedBoardRow(B.id, "BlkBob", 3002), seedBoardRow(C.id, "BlkCarol", 3003)]);
    await seedFriendship(A.id, B.id);
    await seedFriendship(A.id, C.id);
    const codeA = (await A.client.rpc("mp_my_friend_code")).data as string;
    const codeB = (await B.client.rpc("mp_my_friend_code")).data as string;

    const lb = async (c: typeof A, friendsOnly = false) => {
      const { data, error } = await c.client.rpc("leaderboard_page", { p_sort: "games_played", p_season: false, p_friends_only: friendsOnly, p_offset: 0, p_limit: 100, p_min_games: 5, p_mp_min_games: 5 });
      expect(error).toBeNull();
      return (data as any[]).map((r) => r.entry.user_id as string);
    };
    // pre-block baseline
    expect(await lb(A)).toEqual(expect.arrayContaining([A.id, B.id, C.id]));
    expect(await lb(B)).toContain(A.id);
    // a pending game invite A->B and an unseen event, created before the block
    const g = await callFn(A.client, "mp", { contract_rounds: [1], seats: [{ kind: "human", user_id: B.id }] }, "/create");
    console.log("[block] pre-block create", g.status);
    expect(g.status).toBe(200);
    const { count: evBefore } = await admin.from("mp_events").select("id", { count: "exact", head: true }).eq("user_id", B.id).eq("actor_id", A.id).eq("kind", "game_request");
    console.log("[block] B's unseen game_request events from A before block:", evBefore);

    // self / unknown targets rejected
    expect((await A.client.rpc("block_user", { p_user: A.id })).error?.message).toMatch(/invalid target/);
    expect((await A.client.rpc("block_user", { p_user: "00000000-0000-4000-8000-000000000000" })).error?.message).toMatch(/no such user/);

    const blk = await A.client.rpc("block_user", { p_user: B.id });
    expect(blk.error).toBeNull();
    const idem = await A.client.rpc("block_user", { p_user: B.id });
    expect(idem.error).toBeNull();

    // friendship gone both sides; C untouched
    const friendsA = ((await A.client.rpc("mp_my_friends")).data as any[]).map((f) => f.user_id);
    const friendsB = ((await B.client.rpc("mp_my_friends")).data as any[]).map((f) => f.user_id);
    console.log("[block] friends A", friendsA.length, "friends B", friendsB.length);
    expect(friendsA).toEqual([C.id]);
    expect(friendsB).toEqual([]);
    // leaderboard both ways (global + friends-only)
    const lbA = await lb(A), lbB = await lb(B);
    expect(lbA).not.toContain(B.id); expect(lbA).toContain(C.id);
    expect(lbB).not.toContain(A.id); expect(lbB).toContain(C.id);
    expect(await lb(A, true)).not.toContain(B.id);
    // "my row" for the blocker still exists
    const mine = await A.client.rpc("leaderboard_my_row", { p_sort: "games_played", p_season: false, p_friends_only: false, p_min_games: 5, p_mp_min_games: 5 });
    expect((mine.data as any[])[0]?.entry.user_id).toBe(A.id);
    // friend-code lookup + add both directions
    const look1 = await A.client.rpc("mp_lookup_friend_code", { code: codeB });
    const look2 = await B.client.rpc("mp_lookup_friend_code", { code: codeA });
    expect((look1.data as any[]).length).toBe(0);
    expect((look2.data as any[]).length).toBe(0);
    const add = await B.client.rpc("mp_add_friend_by_code", { code: codeA });
    console.log("[block] B add-by-code A:", add.error?.message);
    expect(add.error).toBeTruthy();
    const req = await B.client.rpc("mp_send_friend_request", { target: A.id });
    console.log("[block] B friend-request A:", req.error?.message);
    expect(req.error?.message).toMatch(/can't connect/i);
    const req2 = await A.client.rpc("mp_send_friend_request", { target: B.id });
    expect(req2.error?.message).toMatch(/can't connect/i);
    // invites: new game creation both ways rejected
    const c1 = await A.client.rpc("mp_active_count");
    void c1;
    const inv1 = await callFn(A.client, "mp", { contract_rounds: [1], seats: [{ kind: "human", user_id: B.id }] }, "/create");
    const inv2 = await callFn(B.client, "mp", { contract_rounds: [1], seats: [{ kind: "human", user_id: A.id }] }, "/create");
    console.log("[block] create A->B", inv1.status, inv1.body.error, "| B->A", inv2.status, inv2.body.error);
    expect(inv1.status).toBe(400); expect(inv2.status).toBe(400);
    // block list
    const mb = await A.client.rpc("my_blocks");
    expect((mb.data as any[]).map((x) => x.user_id)).toEqual([B.id]);
    const mbB = await B.client.rpc("my_blocks");
    expect((mbB.data as any[]).length).toBe(0); // blocked party can't see it
    // RLS: B can't read A's block row
    const peek = await B.client.from("user_blocks").select("*");
    expect(peek.data ?? []).toEqual([]);
    // the pending pre-block game invite remains? (informational)
    const { data: pend } = await admin.from("mp_participants").select("invite_status").eq("game_id", g.body.game_id).eq("user_id", B.id).maybeSingle();
    console.log("[block] pre-existing pending invite after block still:", pend?.invite_status);
    const { count: evAfter } = await admin.from("mp_events").select("id", { count: "exact", head: true }).eq("user_id", B.id).eq("actor_id", A.id).eq("kind", "game_request");
    console.log("[block] B's game_request events from A after block:", evAfter);

    // can the blocked party still ACCEPT the pre-block invite (game starts vs. the blocker)?
    const acc = await callFn(B.client, "mp", { game_id: g.body.game_id, accept: true }, "/respond");
    console.log("[block] blocked invitee accepting pre-block invite ->", acc.status, JSON.stringify(acc.body).slice(0, 120));
    // With migration 0082 (block_user cancels pending games between the pair) and the
    // redeployed mp function, the pre-block invite can no longer be accepted.
    const { data: mig } = await admin.from("schema_migrations").select("version").eq("version", "0082_remove_emotes_block_cancels_invites").maybeSingle();
    if (mig) {
      expect(acc.status).toBe(400);
      const { data: gm } = await admin.from("mp_games").select("status").eq("id", g.body.game_id).maybeSingle();
      expect(gm?.status).toBe("cancelled");
      expect(evAfter ?? 0).toBe(0);
    } else {
      console.log("[block] migration 0082 not applied yet; pre-block invite still acceptable (known)");
    }
    // unblock -> reconnect works, both see each other again
    expect((await B.client.rpc("unblock_user", { p_user: A.id })).error).toBeNull(); // no-op for non-blocker
    expect(((await A.client.rpc("my_blocks")).data as any[]).length).toBe(1);
    expect((await A.client.rpc("unblock_user", { p_user: B.id })).error).toBeNull();
    expect(await lb(A)).toContain(B.id);
    expect(await lb(B)).toContain(A.id);
    const re = await B.client.rpc("mp_add_friend_by_code", { code: codeA });
    expect(re.error).toBeNull();
    // unauth'd anon can't call
    const anonCall = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/block_user`, { method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" }, body: JSON.stringify({ p_user: B.id }) });
    console.log("[block] anon block_user status", anonCall.status);
    expect([401, 403, 404]).toContain(anonCall.status);
  } finally {
    await cleanupUsers([A, B, C]);
  }
});

test("reports: row + snapshot, dedupe, validation, unreadable, legacy route, rate limit", async () => {
  const runId = newRunId();
  const A = await mkUser("rptA", runId, "RptAlice");
  const B = await mkUser("rptB", runId, "RptBob");
  const admin = adminClient();
  try {
    const r = await A.client.rpc("report_user", { p_reported_user_id: B.id, p_kind: "name", p_reason: "offensive", p_note: "  test note  ", p_context: "profile" });
    expect(r.error).toBeNull();
    const { data: rows } = await admin.from("user_reports").select("*").eq("reported_user_id", B.id);
    console.log("[report] rows after 1st:", rows?.length, JSON.stringify(rows?.[0]?.snapshot), rows?.[0]?.status, rows?.[0]?.note);
    expect(rows).toHaveLength(1);
    expect(rows![0].reporter_id).toBe(A.id);
    expect(rows![0].snapshot.display_name).toBe("RptBob");
    expect(rows![0].note).toBe("test note");
    expect(rows![0].status).toBe("open");
    // duplicate (same kind) is a no-op
    expect((await A.client.rpc("report_user", { p_reported_user_id: B.id, p_kind: "name", p_reason: "spam" })).error).toBeNull();
    expect((await admin.from("user_reports").select("id", { count: "exact", head: true }).eq("reported_user_id", B.id)).count).toBe(1);
    // different kind -> second row
    expect((await A.client.rpc("report_user", { p_reported_user_id: B.id, p_kind: "behavior", p_reason: "harassment", p_game_id: null, p_context: "mp_game" })).error).toBeNull();
    expect((await admin.from("user_reports").select("id", { count: "exact", head: true }).eq("reported_user_id", B.id)).count).toBe(2);
    // legacy photo route feeds the same queue
    expect((await A.client.rpc("report_profile_photo", { p_reported_user_id: B.id, p_reason: "nsfw" })).error).toBeNull();
    const { data: photo } = await admin.from("user_reports").select("kind, reason, note").eq("reported_user_id", B.id).eq("kind", "photo");
    console.log("[report] legacy photo route ->", JSON.stringify(photo));
    expect(photo).toHaveLength(1);
    // validation
    expect((await A.client.rpc("report_user", { p_reported_user_id: A.id, p_kind: "name", p_reason: "spam" })).error?.message).toMatch(/cannot report yourself/);
    expect((await A.client.rpc("report_user", { p_reported_user_id: B.id, p_kind: "zzz", p_reason: "spam" })).error?.message).toMatch(/invalid report/);
    expect((await A.client.rpc("report_user", { p_reported_user_id: B.id, p_kind: "other", p_reason: "bogus" })).error?.message).toMatch(/invalid report/);
    expect((await A.client.rpc("report_user", { p_reported_user_id: B.id, p_kind: "other", p_reason: "spam", p_note: "x".repeat(300) })).error).toBeNull(); // truncated to 280 by function
    const { data: longNote } = await admin.from("user_reports").select("note").eq("reported_user_id", B.id).eq("kind", "other").maybeSingle();
    expect(longNote?.note?.length).toBe(280);
    // not readable / writable by clients
    const rd = await A.client.from("user_reports").select("*");
    console.log("[report] client select on user_reports:", rd.error?.message ?? `${rd.data?.length} rows`);
    expect(rd.data ?? []).toEqual([]);
    const ins = await A.client.from("user_reports").insert({ reporter_id: A.id, reported_user_id: B.id, kind: "bio", reason: "spam" });
    expect(ins.error).toBeTruthy();
    // rate limit: 20 / hour (each call counts, even no-ops). 5 used above (plus errors are rolled back).
    let firstBlocked = -1;
    for (let i = 0; i < 25; i++) {
      const x = await A.client.rpc("report_user", { p_reported_user_id: B.id, p_kind: "name", p_reason: "spam" });
      if (x.error) { firstBlocked = i; console.log("[report] rate-limited at extra call", i, x.error.message); break; }
    }
    expect(firstBlocked).toBeGreaterThan(-1);
    // target deleted -> report row removed with them; reporter deleted -> row kept (set null)
    await cleanupUsers([A]);
    const { data: kept } = await admin.from("user_reports").select("reporter_id").eq("reported_user_id", B.id);
    console.log("[report] rows kept after reporter deleted:", kept?.length, "reporter_id null:", kept?.every((k) => k.reporter_id === null));
    expect(kept!.length).toBeGreaterThan(0);
    expect(kept!.every((k) => k.reporter_id === null)).toBe(true);
  } finally {
    await cleanupUsers([A, B]);
  }
});

test("content filter: DB trigger rejects slur/link/reserved; client filter parity; club title guard", async () => {
  const runId = newRunId();
  const A = await mkUser("cf", runId, "CfAlice");
  const admin = adminClient();
  try {
    const set = (col: "display_name" | "bio", v: string) => A.client.from("leaderboard_entries").upsert({ user_id: A.id, [col]: v });
    const slur = await set("display_name", "fuck");
    console.log("[filter] name 'fuck' ->", slur.error?.code, slur.error?.message);
    expect(slur.error?.message).toMatch(/That name isn't allowed/);
    expect(contentRejectionFromServer(slur.error?.message, "name")?.issue).toBe("profanity");
    const link = await set("bio", "join www.spam.com now");
    console.log("[filter] bio link ->", link.error?.message);
    expect(link.error?.message).toMatch(/Links aren't allowed here/);
    expect(contentRejectionFromServer(link.error?.message, "bio")?.issue).toBe("link");
    const nlink = await set("display_name", "cool.com");
    expect(nlink.error?.message).toMatch(/Links aren't allowed/);
    const res = await set("display_name", "Admin");
    console.log("[filter] name 'Admin' ->", res.error?.message);
    expect(res.error?.message).toMatch(/reserved/);
    expect(contentRejectionFromServer(res.error?.message, "name")?.issue).toBe("impersonation");
    const bioBad = await set("bio", "f u c k");
    expect(bioBad.error?.message).toMatch(/That bio isn't allowed/);
    const spaced = await set("bio", "you are a f u c k");
    console.log("[filter] 'you are a f u c k' as bio ->", spaced.error ? "rejected" : "ACCEPTED (single-letter-run evasion: the preceding lone 'a' joins the run)");
    const spacedC = checkContent("you are a f u c k", "bio");
    console.log("[filter] client-side check of same string ->", spacedC.ok ? "ok" : spacedC.issue);
    // leet / stretched / accent evasions
    for (const evil of ["sh1t", "fuuuuck", "fúck", "f.u.c.k"]) {
      const x = await set("display_name", evil);
      console.log("[filter] evasion", evil, "->", x.error ? "rejected" : "ACCEPTED");
      expect(x.error, evil).toBeTruthy();
    }
    // acceptable text passes; bio allows 'admin'
    expect((await set("display_name", "CfGoodName")).error).toBeNull();
    expect((await set("bio", "I love the admin panel of my life")).error).toBeNull();
    expect((await A.client.from("leaderboard_entries").upsert({ user_id: A.id, bio: null })).error).toBeNull();
    // the stored name was not changed by rejected attempts
    const { data: le } = await admin.from("leaderboard_entries").select("display_name").eq("user_id", A.id).maybeSingle();
    expect(le?.display_name).toBe("CfGoodName");
    // club name guard (title_content_guard)
    const club = await A.client.rpc("club_create", { p_name: "fuck club" });
    console.log("[filter] club_create slur ->", club.error?.message);
    expect(club.error?.message).toMatch(/That name isn't allowed/);

    // parity: client foldText/checkContent vs DB content_flagged
    const samples = ["fuck","f u c k","fuuuck","sh1t","Scunthorpe","Dickens","class","assassin","Hello World","admin","Admin1","moderator","support","BooksAndRuns","official","www.evil.com","http://x.y","me@site.com","evil.ru","nice.name","ass","bass","grass","cocktail","cockatoo","Ünïcode Név","日本語","Matsumoto","nigger","n1gger","kike","spic","retard","f*ck","facebook.com","Sam Cooke","Cummings","Hancock","shiitake","Analyst","bitch","b1tch","Пример","Ольга"];
    const mism: string[] = [];
    for (const kind of ["name", "bio"] as const) {
      for (const s of samples) {
        const { data: dbIssue, error } = await admin.rpc("content_flagged", { t: s, kind });
        if (error) throw new Error(error.message);
        const cl = checkContent(s, kind);
        const clientIssue = cl.ok ? null : cl.issue ?? null;
        if ((dbIssue ?? null) !== clientIssue) mism.push(`${kind}:${JSON.stringify(s)} db=${dbIssue} client=${clientIssue}`);
      }
    }
    console.log("[filter] parity mismatches:", mism.length, mism.join(" | "));
    expect(mism).toEqual([]);
  } finally {
    await cleanupUsers([A]);
  }
});
