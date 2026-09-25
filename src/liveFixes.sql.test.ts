// Scratch-Postgres checks for the 2026-09-25 live-test fixes (migrations
// 0082-0084) — same harness as streakShield.sql.test.ts: a throwaway local
// Postgres (unix socket only), tiny stubs for the Supabase pieces, and the
// REAL migration files applied on top. Covers:
//   - content_words() (0083) agrees with the TS filter (src/safety) on a
//     corpus of evasions and innocent names, in both directions;
//   - block_user() (0082) cancels pending games/invites between the pair (and
//     only them) and mp_bump_rate_limit() is closed to `authenticated`;
//   - refresh_leaderboard_truth() (0084) refreshes total_xp through the
//     existing trigger even though compute_total_xp() insists on auth.uid().
// Skipped automatically when no Postgres binaries are found (PG_BIN, or
// PG_BIN=0 to skip).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkContent, ContentKind } from "./safety/contentFilter";

function findPgBin(): string | null {
  const env = process.env.PG_BIN;
  if (env === "0") return null;
  const candidates = [env, "/opt/homebrew/opt/postgresql@16/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"];
  for (const c of candidates) if (c && existsSync(join(c, "initdb"))) return c;
  return null;
}

const PG_BIN = findPgBin();
const MIGRATIONS = resolve(__dirname, "../supabase/migrations");
const SOCK_DIR = PG_BIN ? mkdtempSync("/tmp/pgfixes-") : "";
const DATA_DIR = join(SOCK_DIR, "data");
const PG_ENV = { ...process.env, LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" };
const PORT = String(54900 + Math.floor(Math.random() * 90));

function psql(sql: string): string {
  const r = spawnSync(
    join(PG_BIN!, "psql"),
    ["-h", SOCK_DIR, "-p", PORT, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-A", "-t"],
    { input: sql, encoding: "utf8", env: PG_ENV }
  );
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}\n${r.stdout}`);
  return r.stdout;
}

const mig = (name: string) => readFileSync(join(MIGRATIONS, name), "utf8");

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const G_AB = "00000000-0000-4000-8000-0000000000a1";
const G_AC = "00000000-0000-4000-8000-0000000000a2";
const G_ACTIVE = "00000000-0000-4000-8000-0000000000a3";

const STUBS = `
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create table public.schema_migrations (version text primary key);
create table public.friendships (requester_id uuid, addressee_id uuid);
create table public.mp_events (id bigserial primary key, user_id uuid, actor_id uuid, kind text, seen_at timestamptz);
create table public.mp_games (id uuid primary key, status text, completed_at timestamptz);
create table public.mp_participants (game_id uuid, user_id uuid);
create table public.user_blocks (
  blocker_id uuid not null references auth.users (id), blocked_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(), primary key (blocker_id, blocked_id));
create function public.mp_bump_rate_limit(p_action text, p_limit int) returns void language sql as 'select 1';
-- leaderboard stand-ins for the 0084 check
create table public.xp_ledger (user_id uuid, xp int);
create table public.leaderboard_entries (user_id uuid primary key references auth.users (id), total_xp int not null default 0);
create function public.compute_total_xp(p_user_id uuid) returns numeric language plpgsql stable security definer as $$
begin
  if p_user_id <> auth.uid() then raise exception 'not authorized'; end if;
  return (select coalesce(sum(xp), 0) from public.xp_ledger where user_id = p_user_id);
end $$;
create function public.sync_truth() returns trigger language plpgsql as $$
begin new.total_xp := public.compute_total_xp(new.user_id); return new; end $$;
create trigger sync_truth before insert or update of total_xp on public.leaderboard_entries
  for each row execute function public.sync_truth();
`;

const SAMPLES: [string, ContentKind][] = [
  ["f u c k", "bio"], ["f.u.c.k", "bio"], ["f-u-c-k", "bio"], ["f_u_c_k", "name"], ["you are a f u c k", "bio"],
  ["i f-u-c-k", "bio"], ["a s h i t", "bio"], ["what a f.u.c.k.i.n.g mess", "bio"], ["fuck", "name"], ["sh1t", "name"],
  ["J. R. R. Tolkien fan", "bio"], ["A. J. Smith", "name"], ["I am a big fan", "bio"], ["a b c d", "bio"], ["Q. E. D.", "bio"],
  ["I O U", "bio"], ["Ms. A. B. Chen", "name"], ["Friday Night Rummy", "title"], ["a d m i n", "name"], ["Admin", "name"],
  ["I love a good run of 7s", "bio"], ["class of 2020", "bio"], ["c l a s s", "bio"], ["Scunthorpe", "name"], ["a s s", "bio"],
];

const suite = PG_BIN ? describe : describe.skip;

suite("live-test fixes: SQL (migrations 0082-0084)", () => {
  beforeAll(() => {
    execFileSync(join(PG_BIN!, "initdb"), ["-D", DATA_DIR, "-A", "trust", "-U", "postgres"], { stdio: "ignore", env: PG_ENV });
    execFileSync(
      join(PG_BIN!, "pg_ctl"),
      ["-D", DATA_DIR, "-o", `-p ${PORT} -k ${SOCK_DIR} -c listen_addresses=''`, "-l", join(SOCK_DIR, "log"), "-w", "start"],
      { stdio: "ignore", env: PG_ENV }
    );
    psql(STUBS);
    // The content-filter section of the REAL 0060 (table, generated list, fold/words/flagged), then 0083 on top.
    const m60 = mig("0060_blocks_reports_content_filter.sql");
    const from = m60.indexOf("create table if not exists public.content_blocklist");
    const to = m60.indexOf("revoke execute on function public.content_fold");
    psql(m60.slice(from, to));
    psql(mig("0083_content_words_leading_article.sql"));
    psql(mig("0082_remove_emotes_block_cancels_invites.sql"));
    psql(mig("0084_solo_replay_guard_and_xp_refresh.sql"));
  }, 120_000);

  afterAll(() => {
    try {
      execFileSync(join(PG_BIN!, "pg_ctl"), ["-D", DATA_DIR, "-m", "immediate", "stop"], { stdio: "ignore", env: PG_ENV });
    } catch {
      // already down
    }
    rmSync(SOCK_DIR, { recursive: true, force: true });
  });

  it("content_flagged (SQL) agrees with checkContent (TS) on evasions and innocents", () => {
    const rows = SAMPLES.map(([t, k], i) => `select ${i}, coalesce(public.content_flagged($q$${t}$q$, '${k}'), 'ok')`).join("\nunion all\n");
    const out = psql(`${rows} order by 1;`).trim().split("\n");
    SAMPLES.forEach(([t, k], i) => {
      const ts = checkContent(t, k);
      const expected = ts.ok ? "ok" : ts.issue;
      expect(out[i], `${k}: ${t}`).toBe(`${i}|${expected}`);
    });
  });

  it("blocks 'a f u c k' but not initials", () => {
    const f = (t: string) => psql(`select coalesce(public.content_flagged($q$${t}$q$, 'bio'), 'ok');`).trim();
    expect(f("you are a f u c k")).toBe("profanity");
    expect(f("J. R. R. Tolkien fan")).toBe("ok");
    expect(f("Q. E. D.")).toBe("ok");
  });

  it("block_user cancels pending games with the blocked user (only), clears their invite events, leaves active games", () => {
    psql(`
      insert into auth.users values ('${A}'), ('${B}'), ('${C}');
      insert into public.mp_games values ('${G_AB}', 'pending', null), ('${G_AC}', 'pending', null), ('${G_ACTIVE}', 'active', null);
      insert into public.mp_participants values
        ('${G_AB}', '${A}'), ('${G_AB}', '${B}'), ('${G_AC}', '${A}'), ('${G_AC}', '${C}'),
        ('${G_ACTIVE}', '${A}'), ('${G_ACTIVE}', '${B}');
      insert into public.mp_events (user_id, actor_id, kind) values
        ('${B}', '${A}', 'game_request'), ('${C}', '${A}', 'game_request'), ('${A}', '${B}', 'game_request');
      set request.jwt.claim.sub = '${A}';
      select public.block_user('${B}');
    `);
    const rows = psql(`select id || '=' || status from public.mp_games order by id;`).trim().split("\n");
    expect(rows).toEqual([`${G_AB}=cancelled`, `${G_AC}=pending`, `${G_ACTIVE}=active`]);
    const ev = psql(`select user_id || '<-' || actor_id from public.mp_events order by user_id;`).trim().split("\n");
    expect(ev).toEqual([`${C}<-${A}`]); // only the unrelated invite to C remains
  });

  it("mp_bump_rate_limit is no longer callable by authenticated; block_user still works as them", () => {
    const r = spawnSync(
      join(PG_BIN!, "psql"),
      ["-h", SOCK_DIR, "-p", PORT, "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-c", "set role authenticated; select public.mp_bump_rate_limit('x', 1);"],
      { encoding: "utf8", env: PG_ENV }
    );
    expect(r.stderr).toContain("permission denied");
    const ok = spawnSync(
      join(PG_BIN!, "psql"),
      ["-h", SOCK_DIR, "-p", PORT, "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-c", `set role authenticated; set request.jwt.claim.sub = '${C}'; select public.block_user('${B}');`],
      { encoding: "utf8", env: PG_ENV }
    );
    // authenticated has no table grants in this stub, so the definer's own rights are what's tested: it must not be a
    // permission error about mp_bump_rate_limit.
    expect(ok.stderr).not.toContain("mp_bump_rate_limit");
  });

  it("refresh_leaderboard_truth recomputes total_xp through the trigger and restores the claims", () => {
    psql(`
      insert into public.leaderboard_entries (user_id, total_xp) values ('${B}', 0);
      insert into public.xp_ledger values ('${B}', 25), ('${B}', 100);
    `);
    // Without the refresh the stored value is stale (the live-test finding).
    expect(psql(`select total_xp from public.leaderboard_entries where user_id = '${B}';`).trim()).toBe("0");
    const out = psql(`
      select public.refresh_leaderboard_truth('${B}');
      select total_xp || '|' || coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), 'none')
        from public.leaderboard_entries where user_id = '${B}';
    `).trim().split("\n").pop();
    expect(out).toBe("125|none");
    // A user with no leaderboard row is a harmless no-op.
    expect(() => psql(`select public.refresh_leaderboard_truth('${C}');`)).not.toThrow();
  });

  it("refresh_leaderboard_truth is service-role only", () => {
    const r = spawnSync(
      join(PG_BIN!, "psql"),
      ["-h", SOCK_DIR, "-p", PORT, "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-c", `set role authenticated; select public.refresh_leaderboard_truth('${B}');`],
      { encoding: "utf8", env: PG_ENV }
    );
    expect(r.stderr).toContain("permission denied");
  });
});
