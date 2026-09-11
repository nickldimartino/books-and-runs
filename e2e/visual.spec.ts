import { test, expect } from "@playwright/test";

// Full-page visual regression for a handful of static, deterministic
// screens — pages whose signed-out, no-saved-game, default-theme render is
// stable run to run, so a pixel diff here means a real, unintended visual
// change (a CSS regression, a broken token, a layout shift), not noise.
// Deliberately skips anything state-dependent (the game board, a dealt
// hand, Daily Deal's streak text) — those vary by design and would just
// make the baseline flaky rather than useful.
//
// Every title carries "@visual" so these can be pulled in or out of a run
// with --grep/--grep-invert (see package.json's test:e2e:visual and
// test:e2e:ci, and this repo's ci.yml). That split exists because
// Playwright's screenshot comparison is platform-sensitive — a baseline
// PNG made on macOS (this repo's committed ones) won't byte-match Linux's
// font rasterizer, so the committed baselines here are a local, on-your-
// own-machine tool, not something the Linux e2e CI job can check against
// without its own Linux-generated baselines (e.g. from Playwright's own
// Docker image) — not set up in this repo yet.
//
// Regenerate after a deliberate visual change, on the same OS the existing
// baselines were made on:
//   npm run test:e2e:visual -- --update-snapshots

test.beforeEach(async ({ page }) => {
  // Skip the first-visit intro splash (its own spec covers the animation).
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

test("@visual home screen (signed out, no saved game, Midnight theme)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Books & Runs" })).toBeVisible();
  // CardFanHero deals a fresh random five cards every load by design — mask
  // it out rather than compare pixels that are supposed to change.
  await expect(page).toHaveScreenshot("home.png", {
    fullPage: true,
    animations: "disabled",
    mask: [page.getByTestId("card-fan-hero")],
  });
});

test("@visual New Game fork screen", async ({ page }) => {
  await page.goto("/new-game");
  await expect(page.getByRole("heading", { name: "New Game" })).toBeVisible();
  await expect(page).toHaveScreenshot("new-game.png", { fullPage: true, animations: "disabled" });
});

test("@visual How to Play — the round contract table", async ({ page }) => {
  await page.goto("/how-to-play");
  await expect(page.getByRole("heading", { name: "How to Play" })).toBeVisible();
  await expect(page).toHaveScreenshot("how-to-play.png", { fullPage: true, animations: "disabled" });
});

test("@visual Settings — default state", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page).toHaveScreenshot("settings.png", { fullPage: true, animations: "disabled" });
});

test("@visual home screen in a light, non-default theme (Daylight)", async ({ page }) => {
  // Catches a CSS custom-property regression that a Midnight-only baseline
  // wouldn't — Daylight's palette is Midnight's near-opposite (light ground,
  // dark text) rather than a close variant of it.
  await page.evaluate(() => localStorage.setItem("booksAndRuns:theme", "daylight"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "daylight");
  await expect(page).toHaveScreenshot("home-daylight.png", {
    fullPage: true,
    animations: "disabled",
    mask: [page.getByTestId("card-fan-hero")],
  });
});
