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

async function startSoloGame(page: import("@playwright/test").Page) {
  await page.goto("/new-game/local");
  await page.getByRole("textbox").first().fill("Tester");
  await page.getByRole("button", { name: /add ai/i }).click();
  await page.getByRole("button", { name: /start game/i }).click();
  await page.getByRole("button", { name: /show my hand/i }).click();
  await expect(page.getByText(/round 1 of 7/i)).toBeVisible();
}

test("play one full turn: draw, discard, AI responds, turn returns", async ({ page }) => {
  await startSoloGame(page);

  // Draw from the stock pile.
  await page.locator('[data-tutorial="draw-piles"] button').first().click();
  await expect(page.getByText(/draw a card/i)).toHaveCount(0); // prompt gone → drawn

  // Open the hand drawer, select the first card, discard it.
  await page.locator('[data-tutorial="hand-bar"]').click();
  const dialog = page.getByRole("dialog", { name: /manage your hand/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button").filter({ has: page.locator("svg") }).first().click();
  await dialog.getByRole("button", { name: /discard selected card/i }).click();
  await page.getByRole("button", { name: /^confirm$/i }).click();

  // The AI takes its turn; control comes back to us (a new pass-gate) or the
  // round ends — either way the "waiting" state clears within a few seconds.
  await expect(page.getByText(/pass the device to/i)).toBeVisible({ timeout: 10_000 });
});

test("rapid taps on the draw pile only ever draw one card", async ({ page }) => {
  await startSoloGame(page);

  const handCount = () => page.evaluate(() => {
    const el = document.querySelector('[data-tutorial="opponent-strip"]');
    const m = el?.textContent?.match(/\b(\d{1,2})\b/);
    return m ? Number(m[1]) : -1;
  });

  const drawPile = page.locator('[data-tutorial="draw-piles"] button').first();
  const before = await page.evaluate(() =>
    Number(document.body.innerText.match(/Draw \((\d+)\)/)?.[1] ?? "0"),
  );

  // Hammer it.
  for (let i = 0; i < 8; i++) await drawPile.click({ force: true }).catch(() => {});

  const after = await page.evaluate(() =>
    Number(document.body.innerText.match(/Draw \((\d+)\)/)?.[1] ?? "0"),
  );
  expect(before - after).toBe(1);
});
