import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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

test("a chosen theme sticks across a full reload", async ({ page }) => {
  await page.goto("/settings/theme");

  // Wait past the loading spinner, then pick the light theme.
  const daylight = page.getByRole("button", { name: /daylight/i });
  await daylight.waitFor();
  await daylight.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "daylight");

  await page.reload();
  // The before-paint script in layout.tsx must re-apply it — no flash back
  // to Midnight.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "daylight");
});

test("the 'Whose turn is it?' setting is spelled correctly", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText(/whose turn is it\?/i)).toBeVisible();
  await expect(page.getByText(/who's turn is it\?/i)).toHaveCount(0);
});
