import { test, expect } from "@playwright/test";
import { syncLeaderboardStats } from "../app/lib/leaderboardStore";
import { createMpGame } from "../app/lib/mpStore";
import { autoCompleteMpGame } from "./helpers/playMpGame";
import {
  canRunLiveMpTests,
  createTestUser,
  deleteTestUser,
  newRunId,
  REQUIRED_ENV_MESSAGE,
  seedFriendship,
  signedInClient,
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
// The first test's standings stay at "0W / 0" for both members — it's
// about the roster itself, not the numbers next to it — and membership
// count is asserted by counting standings rows (Standings and Members
// render off the exact same array in clubs/page.tsx, so one covers both)
// rather than by any literal "N members" text, which only exists on the
// club *list* page, not the detail page that test spends most of its time
// on. A second test below specifically covers real, non-zero standings:
// club_standings() (migration 0040) just reads each member's own overall
// leaderboard_entries.mp_* columns side by side — it isn't scoped to games
// played *within* the club or against other members — so a member's own
// solo-vs-AI game (via playMpGame.ts's autoCompleteMpGame, same reasoning
// as tournaments.spec.ts's own second test) is exactly as valid a way to
// produce real standings data as a game against a fellow club member would
// be, and is far faster and more reliable to set up.

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

test("standings show a member's real multiplayer record once they've actually played", async ({ browser }) => {
  test.setTimeout(90_000);

  const client = await signedInClient(userA.email, userA.password);
  const { game_id: gameId } = await createMpGame(client, {
    contractRounds: [1],
    seats: [{ kind: "ai", difficulty: "beginner", name: "E2E Bot" }],
  });
  await autoCompleteMpGame(client, gameId);
  // leaderboard_entries.mp_* is self-reported (see leaderboardStore.ts's
  // own doc) — a real signed-in visit to Leaderboard/Account/Home would
  // trigger this same sync; calling it directly is just a faster, more
  // deterministic way to reach the same state than waiting on a page's own
  // mount effect.
  await syncLeaderboardStats(client, userA.id);

  const pageA = await signIn(browser, userA.email, userA.password);
  const pageB = await signIn(browser, userB.email, userB.password);
  const zeroRows = pageA.getByText("0W / 0");

  await pageA.goto("/clubs");
  await pageA.getByPlaceholder("Club name").fill(`${CLUB_NAME} Standings`);
  await pageA.getByRole("button", { name: /^create$/i }).click();
  await pageA.waitForURL(/\/clubs\?id=/, { timeout: 15_000 });

  await pageA.getByRole("button", { name: /^add$/i }).click();
  // B (never played) still reads "0W / 0"; A no longer does — exactly one
  // "0W / 0" row remains once A's real game is reflected.
  await expect(zeroRows).toHaveCount(1, { timeout: 15_000 });
  // A's own row shows real games_played (won or lost — this bot's own
  // outcome isn't asserted, only that it's no longer 0). Anchored at the
  // start only, not the end — a win here also sets mp_best_win_streak to
  // 1, which appends a "· best streak 1" suffix to this same text node.
  await expect(pageA.getByText(/^\dW \/ 1/)).toBeVisible();

  const clubUrl = pageA.url();
  await pageB.goto(clubUrl);
  await expect(pageB.getByText(/^\dW \/ 1/)).toBeVisible({ timeout: 15_000 });
});
