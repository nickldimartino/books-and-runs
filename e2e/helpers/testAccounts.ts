// Shared plumbing for every "needs real signed-in accounts" spec —
// multiplayer, friends, clubs, tournaments. All of them talk to the live
// Supabase project (not a mock), so this is the one place that creates and
// tears down throwaway auth accounts via the Admin API, and signs a page
// into one.
//
// Needs SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard → Project Settings →
// API → "service_role" — NOT the anon key, and never expose this to a
// browser) in addition to the usual NEXT_PUBLIC_SUPABASE_*. Every spec that
// imports this should call `test.skip(!canRunLiveMpTests(), ...)` itself
// (see REQUIRED_ENV_MESSAGE) — this file has no side effects on import, so
// requiring it never crashes a spec run that's missing the env vars.

import type { Browser, BrowserContextOptions, Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const REQUIRED_ENV_MESSAGE =
  "needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY";

export function canRunLiveMpTests(): boolean {
  return !!SUPABASE_URL && !!ANON_KEY && !!SERVICE_KEY;
}

/** service_role bypasses RLS — only ever used here, in Node, never shipped
 * to a page. Not persisted; a fresh client per call is cheap and avoids any
 * risk of a stale session across test steps. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
}

/** A real, anon-key-authenticated client signed in as one test user — for
 * driving app/lib's own client functions (createMpGame, submitMpMove,
 * createTournament, ...) directly from Node, bypassing both the browser
 * and any UI-level gate a form might add on top of what the server itself
 * actually requires (see e2e/helpers/playMpGame.ts's own doc for why that
 * matters: a solo-vs-AI game is a legitimate server-side capability the
 * New Game/Tournament forms just don't expose a button for). Not the same
 * as adminClient() above — this carries a real user session and goes
 * through ordinary RLS/Edge Function auth, exactly like a real signed-in
 * browser tab would. */
export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  return client;
}

export interface TestUser {
  email: string;
  password: string;
  id: string;
}

const PASSWORD = "e2e-Test-Password-1!";

/** A fresh, auto-confirmed throwaway account (bypasses the real email-
 * confirmation step) — `label` becomes part of the email so failures are
 * easy to tell apart in the Supabase dashboard while a run is live. */
export async function createTestUser(label: string, runId: string): Promise<TestUser> {
  const email = `e2e-${label}-${runId}@example.com`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Failed to create test user "${label}": ${error?.message}`);
  return { email, password: PASSWORD, id: data.user.id };
}

/** auth.users → profiles/friendships/mp_participants/club_members/
 * tournament tables/push_subscriptions/etc. all cascade on delete (see the
 * migrations' own `on delete cascade` FKs), so deleting the account is
 * enough to leave no trace of a run. */
export async function deleteTestUser(user: TestUser | null | undefined): Promise<void> {
  if (!user?.id) return;
  await adminClient()
    .auth.admin.deleteUser(user.id)
    .catch(() => {});
}

/** Seeds an already-accepted friendship directly — used by specs whose own
 * subject is something else (clubs, tournaments, one MP turn) that merely
 * *needs* two friended accounts as a precondition; the friend-request flow
 * itself (send/accept/decline/remove) is what e2e/friends.spec.ts actually
 * exercises end to end through the UI. */
export async function seedFriendship(userAId: string, userBId: string): Promise<void> {
  const { error } = await adminClient()
    .from("friendships")
    .insert({ requester_id: userAId, addressee_id: userBId, status: "accepted", responded_at: new Date().toISOString() });
  if (error) throw new Error(`Failed to seed test friendship: ${error.message}`);
}

/** Opens a fresh browser context, signs in, and lands on Home. Each signed-
 * in account in a spec gets its own context (and so its own cookies/
 * storage) so two "users" can be live in the same test run without
 * colliding — the same reason a real multiplayer game needs two actual
 * browser sessions to prove anything. */
export async function signIn(
  browser: Browser,
  email: string,
  password: string,
  contextOptions?: BrowserContextOptions
): Promise<Page> {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
    } catch {
      /* ignore */
    }
    // A just-created throwaway account is "fresh", so sign-in flags it and Home
    // opens the WelcomeOnboarding dialog, which is modal and swallows clicks.
    // Real users dismiss it; tests simply never let the flag be set.
    try {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "booksAndRuns:justSignedUp") return;
        return set.call(this, key, value);
      };
    } catch {
      /* ignore */
    }
  });
  await page.goto("/sign-in");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });
  return page;
}

/** A short id shared by every account/entity a single test run creates, so
 * a failed run's leftovers (if cleanup itself fails) are easy to spot and
 * bulk-delete in the Supabase dashboard by prefix. */
export function newRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
