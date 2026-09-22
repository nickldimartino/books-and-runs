import { test, expect } from "@playwright/test";
import { canRunLiveMpTests, createTestUser, deleteTestUser, newRunId, REQUIRED_ENV_MESSAGE, signIn, type TestUser } from "./helpers/testAccounts";

// Live end-to-end coverage of the friend-request loop itself — send by
// code, appear on both sides, accept, appear as friends on both sides
// (proving the Realtime subscription on the `friendships` table actually
// pushes to an already-open tab, not just "works after a reload"), then
// remove. e2e/multiplayer.spec.ts, e2e/clubs.spec.ts, and
// e2e/tournaments.spec.ts all *use* an already-accepted friendship as a
// precondition (via seedFriendship) rather than re-proving this path —
// this is the one spec that exercises Add/Accept/Decline/Remove through
// the real UI against the real friendships table and mp_* RPCs.

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);

const RUN_ID = newRunId();
let userA: TestUser;
let userB: TestUser;

test.beforeAll(async () => {
  userA = await createTestUser("fr-a", RUN_ID);
  userB = await createTestUser("fr-b", RUN_ID);
});

test.afterAll(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

test("send by code → appears on both sides → accept → friends both ways → remove", async ({ browser }) => {
  test.setTimeout(90_000);

  const pageA = await signIn(browser, userA.email, userA.password);
  const pageB = await signIn(browser, userB.email, userB.password);

  await pageA.goto("/friends");
  // mp_my_friend_code() self-heals a profile row (and its code) on first
  // call — visiting once is enough for a code to exist.
  const codeLocator = pageA.getByText(/^BR-[A-Z0-9]{5}$/);
  await expect(codeLocator).toBeVisible({ timeout: 15_000 });
  const codeA = (await codeLocator.textContent())!.trim();

  // B sends A a request using A's code.
  await pageB.goto("/friends");
  await pageB.getByPlaceholder("BR-XXXXX").fill(codeA);
  await pageB.getByRole("button", { name: /send request/i }).click();
  await expect(pageB.getByText(/request sent to/i)).toBeVisible({ timeout: 15_000 });
  // Shows up under B's own "sent, awaiting a reply" list too, not just the
  // one-line confirmation.
  await expect(pageB.getByRole("heading", { name: /sent, awaiting a reply/i })).toBeVisible();

  // A sees the incoming request without reloading — proves the page's own
  // Realtime subscription on `friendships` actually fires, not just that a
  // fresh load would show it.
  await pageA.goto("/friends");
  const requestsHeading = pageA.getByRole("heading", { name: /requests \(1\)/i });
  await expect(requestsHeading).toBeVisible({ timeout: 20_000 });
  await pageA.getByRole("button", { name: /^accept$/i }).click();

  // Both sides now list each other as friends — B's tab (still open from
  // before, never reloaded) picks this up live too.
  await expect(pageA.getByRole("heading", { name: /your friends \(1\)/i })).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByRole("heading", { name: /your friends \(1\)/i })).toBeVisible({ timeout: 20_000 });
  await expect(pageA.getByRole("heading", { name: /requests/i })).not.toBeVisible();

  // Removing from either side removes it from both.
  await pageB.getByRole("button", { name: /^remove$/i }).click();
  await expect(pageB.getByText(/no friends yet/i)).toBeVisible({ timeout: 15_000 });
  await expect(pageA.getByText(/no friends yet/i)).toBeVisible({ timeout: 20_000 });
});

test("declining a request removes it without creating a friendship", async ({ browser }) => {
  test.setTimeout(60_000);

  const pageA = await signIn(browser, userA.email, userA.password);
  const pageB = await signIn(browser, userB.email, userB.password);

  await pageA.goto("/friends");
  const codeLocator = pageA.getByText(/^BR-[A-Z0-9]{5}$/);
  await expect(codeLocator).toBeVisible({ timeout: 15_000 });
  const codeA = (await codeLocator.textContent())!.trim();

  await pageB.goto("/friends");
  await pageB.getByPlaceholder("BR-XXXXX").fill(codeA);
  await pageB.getByRole("button", { name: /send request/i }).click();
  await expect(pageB.getByText(/request sent to/i)).toBeVisible({ timeout: 15_000 });

  await pageA.goto("/friends");
  await expect(pageA.getByRole("heading", { name: /requests \(1\)/i })).toBeVisible({ timeout: 20_000 });
  await pageA.getByRole("button", { name: /^decline$/i }).click();

  await expect(pageA.getByText(/no friends yet/i)).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByText(/no friends yet/i)).toBeVisible({ timeout: 20_000 });
});
