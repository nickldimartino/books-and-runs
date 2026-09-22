import { test, expect } from "@playwright/test";
import {
  canRunLiveMpTests,
  createTestUser,
  deleteTestUser,
  newRunId,
  REQUIRED_ENV_MESSAGE,
  seedFriendship,
  signIn,
  type TestUser,
} from "./helpers/testAccounts";

// The one spec in this suite that exercises the LIVE multiplayer loop end
// to end — two real signed-in browser contexts, a real game created
// through the Edge Function, a real accept, and a real turn — rather than
// the mocked-fetch coverage in app/lib/useMpGame.test.tsx or the pure
// adapter tests in src/mp/adapter.test.ts. Everything else in this repo's
// MP tests stops short of that on purpose; this is what actually proves
// the deployed `mp` function, RLS, and Realtime all still work together.
//
// See e2e/helpers/testAccounts.ts for the shared account-creation/sign-in
// plumbing this (and e2e/friends.spec.ts, e2e/clubs.spec.ts,
// e2e/tournaments.spec.ts) all use. Run this one locally with:
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key> npm run test:e2e -- e2e/multiplayer.spec.ts
//
// In CI this only runs for real if a SUPABASE_SERVICE_ROLE_KEY repo secret
// is added (see .github/workflows/ci.yml's e2e job) — an unset secret
// resolves to an empty string there, same as not having it locally, so it
// self-skips by default rather than needing a separate opt-in job.

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);

const RUN_ID = newRunId();
let userA: TestUser;
let userB: TestUser;

test.beforeAll(async () => {
  userA = await createTestUser("mp-a", RUN_ID);
  userB = await createTestUser("mp-b", RUN_ID);
  // Pre-seed an accepted friendship directly — the friend-request flow
  // itself is covered by e2e/friends.spec.ts; this spec is about game
  // create → accept → play, not re-proving "Send invites" needs an
  // accepted friend first.
  await seedFriendship(userA.id, userB.id);
});

test.afterAll(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

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
