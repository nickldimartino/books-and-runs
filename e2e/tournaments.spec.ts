import { test, expect } from "@playwright/test";
import { createTournament } from "../app/lib/tournamentsStore";
import { createMpGame } from "../app/lib/mpStore";
import { autoCompleteMpGame } from "./helpers/playMpGame";
import {
  canRunLiveMpTests,
  createTestUser,
  deleteTestUser,
  newRunId,
  REQUIRED_ENV_MESSAGE,
  seedFriendship,
  signIn,
  signedInClient,
  type TestUser,
} from "./helpers/testAccounts";

// Live end-to-end coverage of Tournaments — create a series (which itself
// creates a real round-1 multiplayer game via createMpGame, then links it
// via tournament_create, see tournaments/new/page.tsx), see it from both
// the host's and the invitee's own tournament lists, and cancel it. A
// second test plays a whole series to completion and back — round 1
// finishing for real unlocks "Start next round" in the UI, which starts a
// real round 2 (rematchMpGame + addTournamentRound), which then finishes
// too and shows the series-won banner.
//
// That second test uses e2e/helpers/playMpGame.ts's autoCompleteMpGame
// against a solo-vs-AI game (bypassing the New Tournament form's own
// "invite at least one friend" gate by calling createMpGame/createTournament
// directly — a legitimate server-side capability the form just has no
// button for, see that helper's own doc) rather than grinding a real
// 2-human game through the UI turn by turn, which — like
// e2e/multiplayer.spec.ts's own single real turn — would take an
// unpredictable number of turns for a Contract Rummy hand to resolve. The
// first test below still proves the realistic 2-human-invite path end to
// end; this one proves round-to-round progression and series completion.

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

test("a full series plays round to round and reaches series complete", async ({ browser }) => {
  test.setTimeout(90_000);

  const client = await signedInClient(userA.email, userA.password);

  // Round 1: solo vs. one AI, a single contract round each game — the
  // smallest, fastest legal game this engine supports — so autoCompleteMpGame
  // finishes it in a handful of turns rather than a full 7-round game.
  const { game_id: round1GameId } = await createMpGame(client, {
    contractRounds: [1],
    seats: [{ kind: "ai", difficulty: "beginner", name: "E2E Bot" }],
  });
  const tournamentId = await createTournament(client, {
    name: `${TOURNAMENT_NAME} Full Series`,
    totalRounds: 2,
    contractRounds: [1],
    clubId: null,
    gameId: round1GameId,
  });
  await autoCompleteMpGame(client, round1GameId);

  // From here on, the real UI: round 1 already complete unlocks "Start
  // round 2" — the exact button a host would tap after a real round ends.
  const pageA = await signIn(browser, userA.email, userA.password);
  await pageA.goto(`/tournaments?id=${tournamentId}`);

  const startRound2 = pageA.getByRole("button", { name: /start round 2/i });
  await expect(startRound2).toBeVisible({ timeout: 15_000 });
  await startRound2.click();
  // Lands on the freshly-created round-2 game itself.
  await pageA.waitForURL(/\/multiplayer\/play\?g=/, { timeout: 15_000 });
  const round2GameId = new URL(pageA.url()).searchParams.get("g")!;

  await pageA.goto(`/tournaments?id=${tournamentId}`);
  await expect(pageA.getByRole("link", { name: /round 2/i })).toBeVisible({ timeout: 15_000 });

  // Finish round 2 the same way — the series is now complete.
  await autoCompleteMpGame(client, round2GameId);
  await pageA.goto(`/tournaments?id=${tournamentId}`);
  await expect(pageA.getByText(/won the series/i)).toBeVisible({ timeout: 15_000 });
  await expect(pageA.getByRole("button", { name: /start round/i })).not.toBeVisible();
});
