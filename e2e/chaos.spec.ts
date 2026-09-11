import { test, expect } from "@playwright/test";

// Deliberate failure-mode coverage — what the rest of this suite assumes
// works (a live network) is exactly what's turned off or broken here.
// Two things under test:
//   1. Solo/pass-and-play genuinely needs no network at all, not just
//      "happens to work because nothing failed yet" — proven by blocking
//      every cross-origin request, not merely running against an
//      unconfigured dev server (which never attempts them in the first
//      place, so wouldn't catch a regression that made solo play start
//      depending on the network).
//   2. Auth failures — a fully unreachable endpoint, and one that never
//      responds at all — surface as a clean, bounded UI state (an error
//      message, or a still-interactive disabled button) rather than a
//      silent hang or an uncaught crash.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
  await page.evaluate(() => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("booksAndRuns"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* private mode */
    }
  });
});

test("a full solo turn works with every cross-origin request blocked", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:3000").origin;
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort("internetdisconnected");
  });

  await page.goto("/new-game/local");
  await page.getByRole("textbox").first().fill("Tester");
  await page.getByRole("button", { name: /add ai/i }).click();
  await page.getByRole("button", { name: /start game/i }).click();
  await page.getByRole("button", { name: /show my hand/i }).click();
  await expect(page.getByText(/round 1 of 7/i)).toBeVisible();

  await page.locator('[data-tutorial="draw-piles"] button').first().click();
  await expect(page.getByText(/draw a card/i)).toHaveCount(0); // prompt gone → drawn

  await page.locator('[data-tutorial="hand-bar"]').click();
  const dialog = page.getByRole("dialog", { name: /manage your hand/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button").filter({ has: page.locator("svg") }).first().click();
  await dialog.getByRole("button", { name: /discard selected card/i }).click();
  await page.getByRole("button", { name: /^confirm$/i }).click();

  // The AI plays its turn and control comes back — same "not stuck" bar
  // the ordinary solo-game spec checks, just with the network truly gone
  // rather than merely unconfigured.
  await expect(page.getByText(/pass the device to/i)).toBeVisible({ timeout: 10_000 });
});

test("sign-in surfaces a clean error when the auth request is unreachable", async ({ page }) => {
  await page.goto("/sign-in");
  const notConfigured = page.getByText(/sign in isn't set up yet/i);
  if (await notConfigured.isVisible().catch(() => false)) {
    test.skip(true, "dev server has no Supabase project configured");
  }

  await page.route("**/auth/v1/token**", (route) => route.abort("connectionfailed"));
  await page.getByPlaceholder("Email").fill("someone@example.com");
  await page.getByPlaceholder("Password").fill("whatever-password-123");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // Some error surfaces — the exact wording isn't the point, "the page
  // stays on a recognizable error state" is.
  await expect(page.getByText(/error|failed|try again|network|couldn|unreachable/i)).toBeVisible({
    timeout: 15_000,
  });
  // And the form is usable again — not stuck disabled forever.
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
});

test("sign-in stays interactive (disabled, not crashed) while the auth request hangs indefinitely", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const notConfigured = page.getByText(/sign in isn't set up yet/i);
  if (await notConfigured.isVisible().catch(() => false)) {
    test.skip(true, "dev server has no Supabase project configured");
  }

  // Never resolves — the request just hangs, the way a mid-flight
  // connection drop or a stalled proxy would look from the browser's side.
  await page.route("**/auth/v1/token**", () => new Promise(() => {}));
  await page.getByPlaceholder("Email").fill("someone@example.com");
  await page.getByPlaceholder("Password").fill("whatever-password-123");
  const submit = page.getByRole("button", { name: /^sign in$/i });
  await submit.click();

  // Genuinely pending, not silently ignored — and critically, no crash:
  // the error boundary's own heading never appears.
  await expect(submit).toBeDisabled();
  await page.waitForTimeout(2000);
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("heading", { name: /this screen hit an error/i })).toHaveCount(0);
});

test("Home's background Daily Deal streak pull failing doesn't block the rest of the page", async ({
  page,
}) => {
  // Home fires a best-effort cloud pull for the Daily Deal streak whenever
  // Supabase is configured, signed in or not attempted; either way, New
  // Game and Play today's deal must never depend on it succeeding.
  await page.route("**/rest/v1/leaderboard_entries*", (route) => route.abort("failed"));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Books & Runs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Game" })).toBeVisible();
  await expect(page.getByRole("button", { name: /play today's deal/i })).toBeEnabled();
});
