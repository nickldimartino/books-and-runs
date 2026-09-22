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

// Live end-to-end coverage of Tournaments — create a series (which itself
// creates a real round-1 multiplayer game via createMpGame, then links it
// via tournament_create, see tournaments/new/page.tsx), see it from both
// the host's and the invitee's own tournament lists, and cancel it.
//
// Deliberately stops short of playing round 1 to completion and starting
// round 2: "Start next round" only unlocks once the *last* round's real MP
// game reaches status "complete", which — like e2e/multiplayer.spec.ts's
// own single real turn — would mean grinding an actual Contract Rummy hand
// to an unpredictable number of turns through the UI. That's not a good
// trade for a fast, reliable CI run; addTournamentRound/rematchMpGame
// themselves are exercised at that point regardless of who plays the game
// out, so what's actually new to prove here is series creation, the
// resulting round's real link to a real mp_games row, and both
// participants being able to see and manage it — which this covers.

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);

const RUN_ID = newRunId();
const TOURNAMENT_NAME = `E2E Series ${RUN_ID}`;
let userA: TestUser;
let userB: TestUser;

test.beforeAll(async () => {
  userA = await createTestUser("trn-a", RUN_ID);
  userB = await createTestUser("trn-b", RUN_ID);
  await seedFriendship(userA.id, userB.id);
});

test.afterAll(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

test("create a series → round 1 is a real linked MP game → visible to both → cancel", async ({ browser }) => {
  test.setTimeout(90_000);

  const pageA = await signIn(browser, userA.email, userA.password);
  const pageB = await signIn(browser, userB.email, userB.password);

  await pageA.goto("/tournaments/new");
  await pageA.getByPlaceholder(/friday night league/i).fill(TOURNAMENT_NAME);

  const friendCheckbox = pageA.getByRole("checkbox").first();
  await friendCheckbox.waitFor({ timeout: 15_000 });
  await friendCheckbox.click();

  // Keep the series short — the number itself doesn't matter to this
  // spec, just that "Round 1 of N" reflects whatever was picked.
  await pageA.getByRole("button", { name: /^2 games$/i }).click();

  await pageA.getByRole("button", { name: /start tournament/i }).click();
  await pageA.waitForURL(/\/tournaments\?id=/, { timeout: 20_000 });
  const tournamentUrl = pageA.url();

  await expect(pageA.getByRole("heading", { name: TOURNAMENT_NAME })).toBeVisible({ timeout: 15_000 });
  await expect(pageA.getByText(/round 1 of 2/i)).toBeVisible();

  // Round 1 is a real mp_games row, linked and visible in the Rounds list —
  // "pending" (STATUS_LABEL) until B accepts the invite, which this spec
  // deliberately doesn't do (see the file's own doc).
  await expect(pageA.getByRole("link", { name: /round 1/i })).toBeVisible();
  await expect(pageA.getByText(/waiting for invites/i)).toBeVisible();

  // Host's own list shows it.
  await pageA.goto("/tournaments");
  await expect(pageA.getByRole("link", { name: new RegExp(TOURNAMENT_NAME) })).toBeVisible({ timeout: 15_000 });

  // B — the invited participant, even before accepting the underlying MP
  // game — can already see the series from their own list and detail page.
  await pageB.goto("/tournaments");
  await expect(pageB.getByRole("link", { name: new RegExp(TOURNAMENT_NAME) })).toBeVisible({ timeout: 15_000 });
  await pageB.goto(tournamentUrl);
  await expect(pageB.getByRole("heading", { name: TOURNAMENT_NAME })).toBeVisible({ timeout: 15_000 });
  // B isn't the host — no "Cancel tournament" control on their view.
  await expect(pageB.getByRole("button", { name: /cancel tournament/i })).not.toBeVisible();

  // Host cancels; the status updates for the host immediately, and for B
  // on their next visit.
  pageA.once("dialog", (dialog) => dialog.accept());
  await pageA.getByRole("button", { name: /cancel tournament/i }).click();
  await expect(pageA.getByText(/^cancelled$/i)).toBeVisible({ timeout: 15_000 });
  await expect(pageA.getByRole("button", { name: /cancel tournament/i })).not.toBeVisible();

  await pageB.goto(tournamentUrl);
  await expect(pageB.getByText(/^cancelled$/i)).toBeVisible({ timeout: 15_000 });
});
