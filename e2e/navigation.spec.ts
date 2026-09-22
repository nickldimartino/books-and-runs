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

test("home screen shows the hero and the main entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Books & Runs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Game" })).toBeVisible();
  await expect(page.getByRole("button", { name: /play today's deal/i })).toBeVisible();
});

test("New Game leads to the solo / with-friends fork", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New Game" }).click();
  await expect(page).toHaveURL(/\/new-game$/);
  await expect(page.getByRole("link", { name: /solo & pass-and-play/i })).toBeVisible();
  await expect(page.getByText(/turn-based online/i)).toBeVisible();
  // This spec's beforeEach clears every booksAndRuns* key, so this always
  // runs as a true first session — new-game/page.tsx promotes the tutorial
  // CTA to a highlighted "Start tutorial" card for exactly that visitor
  // (see its own doc); the plain "Take the tutorial →" link only comes
  // back once firstSessionStore records a game has been played.
  await expect(page.getByRole("button", { name: /start tutorial/i })).toBeVisible();
});

test("an unknown route shows the themed 404, not the framework default", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: /doesn't exist/i })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("How to Play renders the round contract table", async ({ page }) => {
  await page.goto("/how-to-play");
  await expect(page.getByRole("heading", { name: "How to Play" })).toBeVisible();
  await expect(page.getByText("2 Books", { exact: true }).first()).toBeVisible();
});
