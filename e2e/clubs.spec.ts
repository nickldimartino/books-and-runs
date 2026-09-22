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

// Live end-to-end coverage of Clubs — create, add/remove a member, rename,
// leave, delete — against the real clubs/club_members tables and their
// RPCs (createClub/addClubMember/removeClubMember/renameClub/deleteClub,
// see clubsStore.ts). Uses seedFriendship rather than re-proving the
// friend-request flow (see e2e/friends.spec.ts for that) — a club can only
// ever add an existing friend, so two already-friended accounts are just a
// precondition here, not the thing under test.
//
// Doesn't attempt to populate real W/L standings (that needs a completed
// multiplayer game — see e2e/multiplayer.spec.ts's own doc for why
// grinding a full game to completion isn't a good fit for a fast, reliable
// E2E run). Both members sit at "0W / 0" the whole time; membership count
// is asserted by counting standings rows (Standings and Members render off
// the exact same array in clubs/page.tsx, so one covers both) rather than
// by any literal "N members" text, which only exists on the club *list*
// page, not the detail page this test spends most of its time on.

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);

const RUN_ID = newRunId();
const CLUB_NAME = `E2E Club ${RUN_ID}`;
const CLUB_RENAMED = `E2E Club ${RUN_ID} Renamed`;
let userA: TestUser;
let userB: TestUser;

test.beforeAll(async () => {
  userA = await createTestUser("club-a", RUN_ID);
  userB = await createTestUser("club-b", RUN_ID);
  await seedFriendship(userA.id, userB.id);
});

test.afterAll(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

test("create → add member → both see it → rename → leave → delete", async ({ browser }) => {
  test.setTimeout(90_000);

  const pageA = await signIn(browser, userA.email, userA.password);
  const pageB = await signIn(browser, userB.email, userB.password);
  const standingsRows = pageA.getByText("0W / 0");

  // A creates the club — starts as just the owner in standings.
  await pageA.goto("/clubs");
  await pageA.getByPlaceholder("Club name").fill(CLUB_NAME);
  await pageA.getByRole("button", { name: /^create$/i }).click();
  await pageA.waitForURL(/\/clubs\?id=/, { timeout: 15_000 });
  const clubUrl = pageA.url();
  await expect(pageA.getByRole("heading", { name: CLUB_NAME })).toBeVisible({ timeout: 15_000 });
  await expect(standingsRows).toHaveCount(1);

  // A adds B (owner-only "Add a friend" section) — standings grows to 2.
  await pageA.getByRole("button", { name: /^add$/i }).click();
  await expect(standingsRows).toHaveCount(2, { timeout: 15_000 });

  // B sees the club (2 members) in their own list from a fresh visit.
  await pageB.goto("/clubs");
  const clubLink = pageB.getByRole("link", { name: new RegExp(CLUB_NAME) });
  await expect(clubLink).toBeVisible({ timeout: 15_000 });
  await expect(clubLink.getByText(/2 members/i)).toBeVisible();

  // A renames it; the new name shows for both, B's included.
  await pageA.getByRole("button", { name: /^rename$/i }).click();
  await pageA.locator('input[maxlength="40"]').first().fill(CLUB_RENAMED);
  await pageA.getByRole("button", { name: /^save$/i }).click();
  await expect(pageA.getByRole("heading", { name: CLUB_RENAMED })).toBeVisible({ timeout: 15_000 });

  await pageB.goto(clubUrl);
  await expect(pageB.getByRole("heading", { name: CLUB_RENAMED })).toBeVisible({ timeout: 15_000 });

  // B leaves — redirected to the club list, no longer shown there for B.
  await pageB.getByRole("button", { name: /^leave$/i }).click();
  await pageB.waitForURL("/clubs", { timeout: 15_000 });
  await expect(pageB.getByRole("link", { name: new RegExp(CLUB_RENAMED) })).not.toBeVisible();

  // A sees the roster back down to just themself, then deletes the club.
  await pageA.goto(clubUrl);
  await expect(standingsRows).toHaveCount(1, { timeout: 15_000 });

  pageA.once("dialog", (dialog) => dialog.accept());
  await pageA.getByRole("button", { name: /delete this club/i }).click();
  await pageA.waitForURL("/clubs", { timeout: 15_000 });
  await expect(pageA.getByRole("link", { name: new RegExp(CLUB_RENAMED) })).not.toBeVisible();
});
