import { test, expect } from "@playwright/test";
import { openHand } from "./helpers/hand";
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
  const drawButton = pageA.getByRole("button", { name: /draw from (the )?pile/i });
  await expect(drawButton).toBeEnabled({ timeout: 20_000 });
  await drawButton.click();
  // The draw button disables the instant the click fires (it's gated by
  // `g.busy` too, not just the server-confirmed `youHaveDrawn` — see
  // useMpGame.ts), so waiting on *it* alone doesn't prove the real network
  // round trip through the mp function has actually landed. That matters
  // here: useMpGame.ts has a `useEffect` that resets `selectedIds` to `[]`
  // whenever `view.youHaveDrawn` flips (among other view fields) — a local
  // card selection made *before* that effect has fired gets silently wiped
  // out the instant it does. A real player never notices (their own reaction
  // time is far slower than the round trip), but Playwright can click a
  // card within that same window, so this waits for a signal that's only
  // ever true once the server's response — and thus that reset effect —
  // has already landed: the "draw a card to start" prompt is gated on
  // `!drawn` (multiplayer/play/page.tsx), i.e. the same `view.youHaveDrawn`
  // this effect keys off.
  await expect(pageA.getByText(/draw a card to start/i)).not.toBeVisible({ timeout: 15_000 });

  // The interactive hand + meld/discard controls live in the always-visible
  // dock on wide screens, or in the "Manage your hand" drawer on phones.
  const handSection = await openHand(pageA);
  // Not just "the first button in the section" — that same section also
  // has "Sort by suit"/"Sort by rank" buttons ahead of the actual cards in
  // DOM order. Every real card's own accessible name is "<rank> of <suit>"
  // (or bare "Joker") — see PlayingCard.tsx's cardLabel — which neither
  // sort button's name matches.
  const firstCard = handSection.getByRole("button", { name: /of (hearts|diamonds|clubs|spades)|^joker/i }).first();
  await firstCard.waitFor({ timeout: 15_000 });
  await firstCard.click();
  await expect(firstCard).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
  // Same confirm-before-it's-final step as solo/pass-and-play's discard
  // (see multiplayer/play/page.tsx's confirmingDiscard) — picking a card
  // to discard doesn't commit the turn by itself, tapping Confirm does.
  await pageA.getByRole("button", { name: /discard selected card/i }).click();
  await pageA.getByRole("button", { name: /^confirm$/i }).click();

  // The turn genuinely passed server-side: A's own view now says it's
  // waiting on B, and B — opening the exact same game — sees it's their
  // move, proving this round-tripped through the real Edge Function and
  // Realtime, not just local optimism on A's screen.
  await expect(pageA.getByText(/waiting for/i)).toBeVisible({ timeout: 20_000 });

  await pageB.goto(gameUrl);
  await expect(pageB.getByText(/your turn — draw a card to start/i)).toBeVisible({ timeout: 20_000 });
});
