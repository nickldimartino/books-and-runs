import { test, expect } from "@playwright/test";

// The first-visit intro splash: plays once per browser session on "/", not
// on a refresh, and gets out of the way.

test("plays on a fresh session and then clears", async ({ page }) => {
  // A brand-new context has empty sessionStorage — the intro should arm.
  await page.goto("/");

  // The inline script sets data-intro before paint; the animated splash
  // mounts and then removes it when done (or the 4.5s safety net does).
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("booksAndRuns:introSeen")), {
      timeout: 6000,
    })
    .toBe("1");

  await expect
    .poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-intro")), {
      timeout: 6000,
    })
    .toBe(false);

  // Home content is visible and interactive afterwards.
  await expect(page.getByRole("link", { name: "New Game" })).toBeVisible();
});

test("does not replay on reload within the same session", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("booksAndRuns:introSeen")))
    .toBe("1");

  await page.reload();
  // data-intro must never get set on a refresh (the script sees the flag).
  const armed = await page.evaluate(() => document.documentElement.hasAttribute("data-intro"));
  expect(armed).toBe(false);
  await expect(page.getByRole("link", { name: "New Game" })).toBeVisible();
});
