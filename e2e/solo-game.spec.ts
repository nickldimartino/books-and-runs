import { test, expect } from "@playwright/test";
import { openHand, waitForMyTurn } from "./helpers/hand";

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

async function startSoloGame(page: import("@playwright/test").Page) {
  await page.goto("/new-game/local");
  await page.getByRole("textbox").first().fill("Tester");
  await page.getByRole("button", { name: /add ai/i }).click();
  await page.getByRole("button", { name: /start game/i }).click();
  await expect(page.getByText(/round 1 of \d+/i)).toBeVisible();
}

test("play one full turn: draw, discard, AI responds, turn returns", async ({ page }) => {
  await startSoloGame(page);

  // Draw from the stock pile.
  await page.locator('[data-tutorial="draw-piles"] button').first().click();
  await expect(page.getByText(/draw a card/i)).toHaveCount(0); // prompt gone → drawn

  // Open the hand drawer, select the first card, discard it.
  const dialog = await openHand(page);
  await dialog.getByRole("button").filter({ has: page.locator("svg") }).first().click();
  await dialog.getByRole("button", { name: /discard selected card/i }).click();
  await page.getByRole("button", { name: /^confirm$/i }).click();

  // The AI takes its turn and control comes straight back to us — there's no
  // pass-the-device screen with a single human at the table.
  await expect(page.getByText(/pass the device to/i)).toHaveCount(0);
  await waitForMyTurn(page);
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
