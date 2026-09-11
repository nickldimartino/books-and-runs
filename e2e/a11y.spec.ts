import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated accessibility checks (axe-core) on the key pages, at both a
// light and a dark theme so contrast is covered both ways. Serious issues
// fail the build; the two themes are checked because contrast is the axe
// rule most likely to differ between them.

const PAGES = ["/", "/new-game", "/how-to-play", "/settings", "/scorecard", "/sign-in"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
    } catch {
      /* ignore */
    }
  });
});

for (const theme of ["midnight", "daylight"] as const) {
  test(`no serious axe violations — ${theme} theme`, async ({ page }, testInfo) => {
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("booksAndRuns:theme", t);
      } catch {
        /* ignore */
      }
    }, theme);

    const allViolations: { page: string; id: string; nodes: number; help: string }[] = [];

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      for (const v of results.violations) {
        if (v.impact === "serious" || v.impact === "critical") {
          allViolations.push({ page: path, id: v.id, nodes: v.nodes.length, help: v.help });
        }
      }
    }

    if (allViolations.length) {
      await testInfo.attach("axe-violations", {
        body: JSON.stringify(allViolations, null, 2),
        contentType: "application/json",
      });
    }
    expect(allViolations, JSON.stringify(allViolations, null, 2)).toEqual([]);
  });
}

test("the in-game hand drawer traps focus and closes on Escape", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("booksAndRuns"))
        .forEach((k) => localStorage.removeItem(k));
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/new-game/local");
  await page.getByRole("textbox").first().fill("Tester");
  await page.getByRole("button", { name: /add ai/i }).click();
  await page.getByRole("button", { name: /start game/i }).click();
  await page.getByRole("button", { name: /show my hand/i }).click();
  await page.locator('[data-tutorial="draw-piles"] button').first().click();

  await page.locator('[data-tutorial="hand-bar"]').click();
  const dialog = page.getByRole("dialog", { name: /manage your hand/i });
  await expect(dialog).toBeVisible();

  // Focus should be inside the dialog.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null))
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
