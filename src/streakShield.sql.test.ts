// Agreement test: the SQL streak-shield walk (migration 0081) and its TS
// mirror (src/streakShield.ts) must compute identical results on the same
// completion histories. Spins up a throwaway local Postgres (initdb into a
// temp dir, unix socket only), stubs the few Supabase tables the migration
// touches, applies the REAL 0080 + 0081 files, then fills completion tables
// with generated histories and compares the trigger-computed
// leaderboard_entries columns to the TS walk.
//
// Skipped automatically when no Postgres binaries are found (set PG_BIN to a
// Postgres 14+ bin directory to force it, or PG_BIN=0 to skip explicitly).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dailyShieldStats,
  dayKeyFromIndex,
  weekIndex,
  weekKeyFromIndex,
  weeklyShieldStats,
} from "./streakShield";

function findPgBin(): string | null {
  const env = process.env.PG_BIN;
  if (env === "0") return null;
  const candidates = [env, "/opt/homebrew/opt/postgresql@16/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"];
  for (const c of candidates) if (c && existsSync(join(c, "initdb"))) return c;
  return null;
}

const PG_BIN = findPgBin();
const MIGRATIONS = resolve(__dirname, "../supabase/migrations");
const SOCK_DIR = PG_BIN ? mkdtempSync("/tmp/pgshield-") : "";
const DATA_DIR = join(SOCK_DIR, "data");
// macOS Postgres refuses to start under an unset/invalid locale.
const PG_ENV = { ...process.env, LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" };
const PORT = String(54000 + Math.floor(Math.random() * 900));

function psql(sql: string): string {
  const r = spawnSync(
    join(PG_BIN!, "psql"),
    ["-h", SOCK_DIR, "-p", PORT, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-A", "-t"],
    { input: sql, encoding: "utf8", env: PG_ENV }
  );
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}\n${r.stdout}`);
  return r.stdout;
}

const STUBS = `
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key);
create table public.leaderboard_entries (
  user_id uuid primary key references auth.users (id),
  daily_deal_streak int not null default 0, daily_deal_best_streak int not null default 0, daily_deal_last_played date,
  weekly_challenge_streak int not null default 0, weekly_challenge_best_streak int not null default 0, weekly_challenge_last_played text
);
create table public.daily_deal_completions (user_id uuid not null references auth.users (id), date date not null,
  completed_at timestamptz not null default now(), primary key (user_id, date));
create table public.weekly_challenge_completions (user_id uuid not null references auth.users (id), week text not null,
  completed_at timestamptz not null default now(), primary key (user_id, week));
create table public.daily_deal_scores (user_id uuid, deal_date text, created_at timestamptz default now());
create table public.achievement_counters (user_id uuid primary key, counters jsonb not null default '{}', updated_at timestamptz);
create table public.schema_migrations (version text primary key);
create function public.refresh_achievement_rarity() returns void language sql as 'select 1';
-- 0036/0039 shipped these triggers; 0081 replaces the functions and recreates the triggers.
create function public.sync_daily_deal_streak_truth() returns trigger language plpgsql as 'begin return new; end';
create function public.sync_weekly_challenge_streak_truth() returns trigger language plpgsql as 'begin return new; end';
`;

// Small deterministic PRNG so failures reproduce.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface History {
  id: string;
  days: string[];
  weeks: string[];
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function buildHistories(): History[] {
  const out: History[] = [];
  let n = 1;
  const add = (days: string[], weeks: string[] = []) => out.push({ id: uuid(n++), days, weeks });
  const D0 = 20_000; // a day index; only differences matter
  const run = (from: number, len: number) => Array.from({ length: len }, (_, i) => D0 + from + i);
  const keys = (idx: number[]) => idx.map((i) => dayKeyFromIndex(i));
  // Hand-picked shapes.
  add([]);
  add(keys(run(0, 1)));
  add(keys(run(0, 7)));
  add(keys([...run(0, 7), ...run(8, 3)])); // one-day gap with a shield
  add(keys([...run(0, 6), ...run(7, 5)])); // one-day gap, no shield yet
  add(keys([...run(0, 7), ...run(9, 3)])); // two-day gap resets
  add(keys([...run(0, 14), ...run(15, 2), ...run(18, 2), ...run(21, 2)])); // chained gaps
  add(keys(run(0, 30)));
  add(keys([...run(0, 21), ...run(22, 9)])); // cap at 2 at 14+21
  add(keys([D0 + 5, D0 + 3, D0 + 4, D0 + 5])); // unordered + duplicate
  add(keys(run(360, 20))); // spans a year boundary in dates
  // Weekly shapes across the 2026 -> 2027 boundary (2026 has 53 ISO weeks).
  const w0 = weekIndex("2026-W40");
  const wk = (idx: number[]) => idx.map((i) => weekKeyFromIndex(i));
  add([], wk([0, 1, 2, 3].map((i) => w0 + i)));
  add([], wk([0, 1, 2, 3, 5, 6].map((i) => w0 + i))); // covered week 4
  add([], wk([0, 1, 2, 3, 5, 6, 7, 8, 10].map((i) => w0 + i))); // 2nd gap: shield earned at 8 covers it
  add([], wk([0, 1, 2, 4].map((i) => w0 + i))); // gap without a shield
  add([], wk([0, 1, 2, 3, 6].map((i) => w0 + i))); // 2-week gap resets
  add([], wk(Array.from({ length: 20 }, (_, i) => w0 + i)));
  // Random.
  const r = rng(20260925);
  for (let i = 0; i < 160; i++) {
    const density = 0.45 + r() * 0.55;
    const len = 5 + Math.floor(r() * 90);
    const start = D0 + Math.floor(r() * 400);
    const days: number[] = [];
    for (let d = 0; d < len; d++) if (r() < density) days.push(start + d);
    const wdensity = 0.4 + r() * 0.6;
    const weeks: number[] = [];
    const wstart = weekIndex("2025-W30") + Math.floor(r() * 60);
    for (let w = 0; w < 40; w++) if (r() < wdensity) weeks.push(wstart + w);
    add(keys(days), wk(weeks));
  }
  return out;
}

const suite = PG_BIN ? describe : describe.skip;

suite("streak shield: SQL (migration 0081) agrees with the TS mirror", () => {
  beforeAll(() => {
    execFileSync(join(PG_BIN!, "initdb"), ["-D", DATA_DIR, "-A", "trust", "-U", "postgres"], { stdio: "ignore", env: PG_ENV });
    execFileSync(
      join(PG_BIN!, "pg_ctl"),
      ["-D", DATA_DIR, "-o", `-p ${PORT} -k ${SOCK_DIR} -c listen_addresses=''`, "-l", join(SOCK_DIR, "log"), "-w", "start"],
      { stdio: "ignore", env: PG_ENV }
    );
    psql(STUBS);
    psql(readFileSync(join(MIGRATIONS, "0080_challenge_streak_refresh_and_repair.sql"), "utf8"));
    psql(readFileSync(join(MIGRATIONS, "0081_streak_shields.sql"), "utf8"));
  }, 120_000);

  afterAll(() => {
    try {
      execFileSync(join(PG_BIN!, "pg_ctl"), ["-D", DATA_DIR, "-m", "immediate", "stop"], { stdio: "ignore", env: PG_ENV });
    } catch {
      // already down
    }
    rmSync(SOCK_DIR, { recursive: true, force: true });
  });

  it("ISO week key <-> index round-trips identically in SQL and TS", () => {
    const start = weekIndex("2024-W50");
    const idxs = Array.from({ length: 200 }, (_, i) => start + i);
    const sql = psql(
      `select string_agg(public.iso_week_key_index(k)::text || '=' || public.iso_week_key_from_index(public.iso_week_key_index(k)), ',' order by k)
         from unnest(array[${idxs.map((i) => `'${weekKeyFromIndex(i)}'`).join(",")}]) as k;`
    ).trim();
    const expected = idxs.map((i) => `${i}=${weekKeyFromIndex(i)}`).sort().join(",");
    expect(sql.split(",").sort().join(",")).toBe(expected);
  });

  it("matches on generated Daily and Weekly histories, including after re-running the repair", () => {
    const histories = buildHistories();
    const sql: string[] = [];
    for (const h of histories) {
      sql.push(`insert into auth.users values ('${h.id}');`);
      if (h.days.length) {
        sql.push(`insert into public.daily_deal_completions (user_id, date) values ${h.days.map((d) => `('${h.id}','${d}')`).join(",")} on conflict do nothing;`);
      }
      if (h.weeks.length) {
        sql.push(`insert into public.weekly_challenge_completions (user_id, week) values ${h.weeks.map((w) => `('${h.id}','${w}')`).join(",")} on conflict do nothing;`);
      }
    }
    psql(sql.join("\n"));
    const read = () =>
      psql(`select json_agg(t) from (select * from public.leaderboard_entries order by user_id) t;`).trim();
    // AFTER INSERT triggers (0080) created + recomputed every row via 0081's BEFORE triggers.
    const check = () => {
      const rows = JSON.parse(read()) as Array<Record<string, unknown>>;
      const byId = new Map(rows.map((r) => [r.user_id as string, r]));
      let compared = 0;
      let withUsed = 0;
      let withCapped = 0;
      for (const h of histories) {
        if (!h.days.length && !h.weeks.length) continue;
        const row = byId.get(h.id)!;
        expect(row, h.id).toBeTruthy();
        if (h.days.length) {
          const t = dailyShieldStats(h.days);
          expect(row.daily_deal_streak, `${h.id} daily streak ${h.days}`).toBe(t.current);
          expect(row.daily_deal_best_streak, `${h.id} daily best`).toBe(t.best);
          expect(row.daily_deal_last_played, `${h.id} daily last`).toBe(t.lastPlayed);
          expect(row.daily_deal_shields, `${h.id} daily shields`).toBe(t.shields);
          expect(row.daily_deal_shields_earned, `${h.id} daily earned`).toBe(t.earned);
          expect(row.daily_deal_shields_used, `${h.id} daily used`).toBe(t.used);
          expect(row.daily_deal_covered_days, `${h.id} daily covered`).toEqual(t.covered);
          compared++;
          if (t.used > 0) withUsed++;
          if (t.shields === 2) withCapped++;
        }
        if (h.weeks.length) {
          const t = weeklyShieldStats(h.weeks);
          expect(row.weekly_challenge_streak, `${h.id} weekly streak ${h.weeks}`).toBe(t.current);
          expect(row.weekly_challenge_best_streak, `${h.id} weekly best`).toBe(t.best);
          expect(row.weekly_challenge_last_played, `${h.id} weekly last`).toBe(t.lastPlayed);
          expect(row.weekly_challenge_shields, `${h.id} weekly shields`).toBe(t.shields);
          expect(row.weekly_challenge_covered_weeks, `${h.id} weekly covered`).toEqual(t.covered);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(150);
      // The generated set really exercises shield spending and the cap.
      expect(withUsed).toBeGreaterThan(5);
      expect(withCapped).toBeGreaterThan(0);
      // Achievement counters: completions actually played, best incl. bridges.
      return rows;
    };
    const first = check();
    // Idempotent: re-running the migration's repair leaves everything identical.
    psql(readFileSync(join(MIGRATIONS, "0081_streak_shields.sql"), "utf8"));
    expect(check()).toEqual(first);
    const counters = JSON.parse(
      psql(`select json_agg(t) from (select user_id, counters from public.achievement_counters order by user_id) t;`).trim()
    ) as Array<{ user_id: string; counters: Record<string, number> }>;
    const cById = new Map(counters.map((c) => [c.user_id, c.counters]));
    for (const h of histories) {
      if (!h.days.length) continue;
      const t = dailyShieldStats(h.days);
      expect(cById.get(h.id)?.daily_deals_completed).toBe(t.count);
      expect(cById.get(h.id)?.daily_deal_best_streak).toBe(t.best);
    }
  }, 120_000);

  it("a client cannot claim shields by writing the columns", () => {
    const id = uuid(9000);
    psql(`insert into auth.users values ('${id}');
      insert into public.leaderboard_entries (user_id, daily_deal_shields, daily_deal_shields_earned, weekly_challenge_shields) values ('${id}', 2, 9, 1);`);
    const row = JSON.parse(
      psql(`select row_to_json(t) from (select daily_deal_shields, daily_deal_shields_earned, weekly_challenge_shields from public.leaderboard_entries where user_id='${id}') t;`)
    );
    expect(row).toEqual({ daily_deal_shields: 0, daily_deal_shields_earned: 0, weekly_challenge_shields: 0 });
    psql(`update public.leaderboard_entries set daily_deal_shields = 2 where user_id='${id}';`);
    const after = JSON.parse(psql(`select row_to_json(t) from (select daily_deal_shields from public.leaderboard_entries where user_id='${id}') t;`));
    expect(after.daily_deal_shields).toBe(0);
  });
});
