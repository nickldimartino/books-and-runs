import { test, expect } from "@playwright/test";

test("a signed-out visitor sees no notification bell on Home", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Books & Runs/ })).toBeVisible();
  await expect(page.getByTestId("notification-bell")).toHaveCount(0);
  // The weekly shield row is account-only too.
  await expect(page.getByTestId("weekly-shields")).toHaveCount(0);
});
