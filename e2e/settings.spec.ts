import { test, expect } from "@playwright/test";

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

test("a signed-out theme choice previews live but resets on reload", async ({ page }) => {
  await page.goto("/settings/theme");

  // Which of these two shows up is itself env-dependent: with Supabase
  // configured (a real deployment, and this dev machine's own .env.local),
  // settings/theme/page.tsx's signedOutGate hides the picker entirely
  // behind a "sign in first" prompt; without it configured (this repo's
  // own CI, which has no NEXT_PUBLIC_SUPABASE_* secrets), the gate is off
  // and the picker itself enforces the same rule at reload time instead
  // (see below). Both are exercised somewhere; this spec just needs to not
  // hang either way.
  const daylight = page.getByRole("button", { name: /daylight/i });
  const signInGate = page.getByText(/sign in to pick a theme/i);
  await expect(daylight.or(signInGate)).toBeVisible({ timeout: 15_000 });
  if (await signInGate.isVisible()) return;

  // Picker's available (Supabase unconfigured) — pick the light theme,
  // applies instantly as a live preview, no reload needed.
  await daylight.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "daylight");

  await page.reload();
  // Signed-out play always uses the default theme — AccountSwitchGuard
  // self-heals any non-default theme back to it on every load while
  // signed out (see its own doc and settings/theme/page.tsx's
  // signedOutGate), so a signed-out pick is a preview only, not a saved
  // preference. Persistence across reload is only for signed-in accounts,
  // which this spec doesn't set up (see e2e/multiplayer.spec.ts's helpers
  // for the real-account pattern, gated on SUPABASE_SERVICE_ROLE_KEY).
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
});

test("the 'Whose turn is it?' setting is spelled correctly", async ({ page }) => {
  await page.goto("/settings#gameplay");
  await expect(page.getByText(/whose turn is it\?/i)).toBeVisible();
  await expect(page.getByText(/who's turn is it\?/i)).toHaveCount(0);
});
