// Shared plumbing for the e2e/live-*.spec.ts files — verification of the
// 0056–0064/0073 features against the LIVE Supabase project (no browser).
// Every account created here has an email starting with "e2e-live-" so
// sweepLiveTestUsers() (and scripts run out-of-band) can find leftovers.

import type { SupabaseClient } from "@supabase/supabase-js";
import { playAITurn } from "@/ai/index";
import { roundSeed, seededRng } from "@/deck";
import { createGame, PlayerConfig, startNextRound } from "@/gameEngine";
import { MoveLogEntry } from "@/moveLog";
import { SHORT_GAME_CONTRACTS } from "@/types";
import {
  ANON_KEY,
  SUPABASE_URL,
  adminClient,
  createTestUser,
  deleteTestUser,
  newRunId,
  signedInClient,
  type TestUser,
} from "./testAccounts";

export { adminClient, newRunId, signedInClient, SUPABASE_URL, ANON_KEY };
export type { TestUser };

export const LIVE_PREFIX = "e2e-live-";

export interface LiveUser extends TestUser {
  client: SupabaseClient;
}

const tracked: TestUser[] = [];

/** Creates + signs in a throwaway account (auto-confirmed), and seeds a
 * leaderboard_entries row so it has a public name. */
export async function mkUser(label: string, runId: string, displayName?: string): Promise<LiveUser> {
  const u = await createTestUser(`live-${label}`, runId);
  tracked.push(u);
  const client = await signedInClient(u.email, u.password);
  if (displayName !== undefined) {
    const { error } = await adminClient().from("leaderboard_entries").upsert({ user_id: u.id, display_name: displayName });
    if (error) throw new Error(`seed leaderboard row failed: ${error.message}`);
  }
  return { ...u, client };
}

export async function cleanupUsers(users: (TestUser | null | undefined)[] = tracked): Promise<void> {
  for (const u of users) await deleteTestUser(u);
}

/** Deletes every auth user whose email starts with e2e-live-<runId or ""> —
 * a safety net on top of per-test cleanup. Returns how many were left. */
export async function sweepLiveTestUsers(runIdFilter = ""): Promise<number> {
  const admin = adminClient();
  let n = 0;
  for (let page = 1; page < 30; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (u.email?.startsWith(LIVE_PREFIX) && u.email.includes(runIdFilter)) {
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
        n++;
      }
    }
    if (users.length < 200) break;
  }
  return n;
}

export async function callFn(
  client: SupabaseClient,
  fn: string,
  body: object,
  path = ""
): Promise<{ status: number; body: Record<string, any> }> {
  const {
    data: { session },
  } = await client.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY!,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let parsed: Record<string, any> = {};
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body: parsed };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── solo game generation ────────────────────────────────────────────────

export interface GeneratedGame {
  seed: number;
  seats: { id: string; name: string; isAI: boolean; difficulty?: string }[];
  selectedContracts: typeof SHORT_GAME_CONTRACTS;
  moveLog: MoveLogEntry[];
  finalScores: number[];
}

/** Plays an all-AI game exactly like GameContext (per-round seeded rng),
 * then presents seat 0 as the human "You" (isAI false) like the real client. */
export function genSoloGame(seed: number, contracts = SHORT_GAME_CONTRACTS): GeneratedGame {
  const aiSeats: PlayerConfig[] = [
    { id: "human-0", name: "You", isAI: true, difficulty: "medium" },
    { id: "ai-1", name: "Bot", isAI: true, difficulty: "medium" },
  ];
  let state = createGame(aiSeats, contracts, seededRng(roundSeed(seed, 1)));
  const moveLog: MoveLogEntry[] = [];
  for (let i = 0; i < 4000 && !state.gameOver; i++) {
    if (state.roundOver) {
      state = startNextRound(state, seededRng(roundSeed(seed, state.round + 1)));
      continue;
    }
    moveLog.push(...playAITurn(state));
  }
  if (!state.gameOver) throw new Error("genSoloGame: did not finish");
  return {
    seed,
    seats: [
      { id: "human-0", name: "You", isAI: false },
      { id: "ai-1", name: "Bot", isAI: true, difficulty: "medium" },
    ],
    selectedContracts: contracts,
    moveLog,
    finalScores: state.players.map((p) => p.cumulativeScore),
  };
}

export const dateSeed = (key: string): number => {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = (hash * 33) ^ key.charCodeAt(i);
  return hash >>> 0;
};

export function verifyPayload(g: GeneratedGame, extra: object = {}) {
  return {
    seed: g.seed,
    seats: g.seats,
    selectedContracts: g.selectedContracts,
    moveLog: g.moveLog,
    trackStats: true,
    roundHistory: [],
    ...extra,
  };
}

export const dayKeyOffset = (offsetDays: number, now = new Date()): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays)).toISOString().slice(0, 10);
