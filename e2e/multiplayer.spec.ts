import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// The one spec in this suite that exercises the LIVE multiplayer loop end
// to end — two real signed-in browser contexts, a real game created
// through the Edge Function, a real accept, and a real turn — rather than
// the mocked-fetch coverage in app/lib/useMpGame.test.tsx or the pure
// adapter tests in src/mp/adapter.test.ts. Everything else in this repo's
// MP tests stops short of that on purpose; this is what actually proves
// the deployed `mp` function, RLS, and Realtime all still work together.
//
// Needs SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard → Project Settings →
// API → "service_role" — NOT the anon key, and never expose this to a
// browser) in addition to the usual NEXT_PUBLIC_SUPABASE_* — it creates two
// real, throwaway auth accounts via the Admin API (bypassing email
// confirmation) and deletes them again afterward. Skips itself entirely
// when that's not set, both locally and in CI — this is the one spec that
// touches real Supabase data, so it's opt-in, not part of
// `npm run test:e2e:ci`. Run it locally with:
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key> npm run test:e2e -- e2e/multiplayer.spec.ts
//
// In CI this only runs for real if a SUPABASE_SERVICE_ROLE_KEY repo secret
// is added (see .github/workflows/ci.yml's e2e job) — an unset secret
// resolves to an empty string there, same as not having it locally, so it
// self-skips by default rather than needing a separate opt-in job.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !SUPABASE_URL || !ANON_KEY || !SERVICE_KEY,
  "needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY"
);

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "e2e-Test-Password-1!";
const userA = { email: `e2e-mp-a-${RUN_ID}@example.com`, password: PASSWORD };
const userB = { email: `e2e-mp-b-${RUN_ID}@example.com`, password: PASSWORD };
let userAId = "";
let userBId = "";

function admin() {
  // service_role bypasses RLS — only ever used here, in Node, never shipped
  // to a page. Not persisted; a fresh client per call is cheap and avoids
  // any risk of a stale session across beforeAll/afterAll.
  return createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
}

test.beforeAll(async () => {
  const a = admin();

  const { data: created1, error: err1 } = await a.auth.admin.createUser({
    email: userA.email,
    password: userA.password,
    email_confirm: true,
  });
  if (err1 || !created1.user) throw new Error(`Failed to create test user A: ${err1?.message}`);
  userAId = created1.user.id;

  const { data: created2, error: err2 } = await a.auth.admin.createUser({
    email: userB.email,
    password: userB.password,
    email_confirm: true,
  });
  if (err2 || !created2.user) throw new Error(`Failed to create test user B: ${err2?.message}`);
  userBId = created2.user.id;

  // Pre-seed an accepted friendship directly — the friend-request flow
  // itself is covered elsewhere; this spec is about game create → accept →
  // play, not re-proving "Send invites" needs an accepted friend first.
  const { error: friendErr } = await a
    .from("friendships")
    .insert({ requester_id: userAId, addressee_id: userBId, status: "accepted", responded_at: new Date().toISOString() });
  if (friendErr) throw new Error(`Failed to seed test friendship: ${friendErr.message}`);
});

test.afterAll(async () => {
  const a = admin();
  // auth.users → profiles/friendships/mp_participants/push_subscriptions/etc.
  // all cascade on delete (see the migrations' `on delete cascade` FKs), so
  // deleting the two accounts is enough to leave no trace of this run.
  if (userAId) await a.auth.admin.deleteUser(userAId).catch(() => {});
  if (userBId) await a.auth.admin.deleteUser(userBId).catch(() => {});
});

async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
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

test("create → accept → one full turn between two real accounts", async ({ browser }) => {
  test.setTimeout(90_000);

  const pageA = await signIn(browser, userA.email, userA.password);
  const pageB = await signIn(browser, userB.email, userB.password);

  // A creates a game inviting B (the only friend, so the first — and only
  // — checkbox in the list).
  await pageA.goto("/new-game/multiplayer");
  const friendCheckbox = pageA.getByRole("checkbox").first();
  await friendCheckbox.waitFor({ timeout: 15_000 });
  await friendCheckbox.click();
  await pageA.getByRole("button", { name: /send invites/i }).click();
  await pageA.waitForURL("/", { timeout: 15_000 });

  // B accepts from Home.
  await pageB.goto("/");
  const acceptButton = pageB.getByRole("button", { name: /^accept$/i });
  await expect(acceptButton).toBeVisible({ timeout: 20_000 });
  await acceptButton.click();
  await expect(acceptButton).not.toBeVisible({ timeout: 15_000 });

  // The game is dealt synchronously once the only invitee accepts — A
  // (seat 0, the host) goes first. Reload Home to pick that up and open it.
  await pageA.reload();
  const gameLinkA = pageA.getByRole("link", { name: /round \d+ of \d+/i }).first();
  await expect(gameLinkA).toBeVisible({ timeout: 20_000 });
  await gameLinkA.click();
  await pageA.waitForURL(/\/multiplayer\/play\?g=/, { timeout: 15_000 });
  const gameUrl = pageA.url();

  // A's full turn: draw, select a card, set it as the discard, end turn.
  const drawButton = pageA.getByRole("button", { name: /draw from the pile/i });
  await expect(drawButton).toBeEnabled({ timeout: 20_000 });
  await drawButton.click();

  const handSection = pageA.locator("section", { has: pageA.getByRole("heading", { name: /your hand/i }) });
  const firstCard = handSection.getByRole("button").first();
  await firstCard.waitFor({ timeout: 15_000 });
  await firstCard.click();
  await pageA.getByRole("button", { name: /set as discard/i }).click();
  await pageA.getByRole("button", { name: /end turn/i }).click();

  // The turn genuinely passed server-side: A's own view now says it's
  // waiting on B, and B — opening the exact same game — sees it's their
  // move, proving this round-tripped through the real Edge Function and
  // Realtime, not just local optimism on A's screen.
  await expect(pageA.getByText(/waiting for/i)).toBeVisible({ timeout: 20_000 });

  await pageB.goto(gameUrl);
  await expect(pageB.getByText(/your turn — draw a card to start/i)).toBeVisible({ timeout: 20_000 });
});
