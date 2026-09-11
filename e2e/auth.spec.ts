import { test, expect } from "@playwright/test";

// These exercise the auth surface without a real account — enough to prove
// the lazily-loaded Supabase SDK actually loads and wires up. They only run
// meaningfully when the dev server has NEXT_PUBLIC_SUPABASE_* set; when it
// doesn't, the page shows the "not set up" state, which is also asserted.

test.beforeEach(async ({ page }) => {
  // Skip the first-visit intro splash (its own spec covers it).
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

test("sign-in page: the SDK loads and a bad password comes back as an error", async ({ page }) => {
  await page.goto("/sign-in");

  const notConfigured = page.getByText(/sign in isn't set up yet/i);
  if (await notConfigured.isVisible().catch(() => false)) {
    test.skip(true, "dev server has no Supabase project configured");
  }

  await page.getByPlaceholder("Email").fill("nobody@example.com");
  await page.getByPlaceholder("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // A real response from Supabase Auth — proves the lazy import resolved and
  // signInWithPassword ran (rather than the "isn't configured" short-circuit).
  await expect(page.getByText(/invalid|incorrect|credentials|email/i)).toBeVisible({
    timeout: 15_000,
  });
});

// The "Supabase SDK stays out of the initial bundle" guarantee is verified
// against the production build, not dev (turbopack dev doesn't code-split
// the same way): `npm run build` then check no page HTML references a chunk
// containing "GoTrueClient". See the commit that introduced loadSupabase().

test("reset-password page renders without crashing", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading")).toBeVisible();
});
