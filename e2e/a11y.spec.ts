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
  // The drawer is the phone layout; from 1024px up the hand is a docked panel.
  await page.setViewportSize({ width: 390, height: 844 });
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

test("keyboard shortcuts drive a turn and the ? sheet opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await expect(page.getByTestId("hand-dock")).toBeVisible();

  // D draws from the pile; the hand then has 14 cards.
  // (Retried: the very first press can land a frame before the page's key
  // listener is attached; a second D after drawing is a harmless no-op.)
  await expect(async () => {
    await page.keyboard.press("d");
    await expect(page.getByTestId("hand-dock").locator('[role="button"][aria-pressed]')).toHaveCount(14, { timeout: 750 });
  }).toPass();

  // H moves focus into the hand (one roving tab stop), arrows move between cards.
  await page.keyboard.press("h");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("role") === "button" && document.activeElement?.hasAttribute("aria-pressed")))
    .toBe(true);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("hand-dock").locator('[aria-pressed="true"]')).toHaveCount(1);

  // ? opens the shortcut sheet, Esc closes it.
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: /keyboard & gamepad shortcuts/i });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // D is inert once the turn's draw is used.
  await page.keyboard.press("d");
  await expect(page.getByTestId("hand-dock").locator('[role="button"][aria-pressed]')).toHaveCount(14);
});
