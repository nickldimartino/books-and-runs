// Regenerates the web-manifest store screenshots in public/screenshots/ from
// the running app — real captures, not mock-ups. Needs a served build:
//
//   BR_DIST_DIR=.build-shots npx next build && npx serve .build-shots -l 4190 &
//   node scripts/capture-screenshots.mjs http://localhost:4190
//
// Narrow shots are 1080x1920 (540x960 @2x), wide 1920x1080 (960x540 @2x) —
// the sizes app/manifest.ts declares.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:4190";
const OUT = "public/screenshots";
mkdirSync(OUT, { recursive: true });

const TIP_IDS = [
  "home", "account", "new-game", "new-game-local", "new-game-multiplayer", "multiplayer-play", "settings",
  "achievements", "player-profile", "leaderboard", "leaderboard-season", "friends", "scorecard", "clubs",
  "tournaments", "tournaments-new",
];

const browser = await chromium.launch();

async function newPage(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addInitScript((tips) => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
      localStorage.setItem("booksAndRuns:seenTips", JSON.stringify(tips));
      localStorage.setItem("booksAndRuns:hasStartedAGame", "1");
      localStorage.setItem("booksAndRuns:installHint", JSON.stringify({ completedGames: 0, dismissals: 3, lastDismissedAt: Date.now(), installed: false }));
    } catch { /* ignore */ }
  }, TIP_IDS);
  return ctx.newPage();
}

async function startGame(page) {
  await page.goto(`${BASE}/new-game/local`);
  await page.getByRole("textbox").first().fill("Nick");
  await page.getByRole("button", { name: /add ai/i }).click();
  await page.getByRole("button", { name: /start game/i }).click();
  await page.getByText(/round 1 of 7/i).waitFor();
  await page.locator('[data-tutorial="draw-piles"] button').first().click();
  await page.waitForTimeout(800);
}

for (const [suffix, w, h] of [["narrow", 540, 960], ["wide", 960, 540]]) {
  let page = await newPage(w, h);
  await page.goto(BASE + "/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/home-${suffix}.png` });
  await page.context().close();

  page = await newPage(w, h);
  await startGame(page);
  await page.screenshot({ path: `${OUT}/game-${suffix}.png` });
  await page.context().close();

  if (suffix === "narrow") {
    page = await newPage(w, h);
    await page.goto(`${BASE}/settings/theme`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/themes-${suffix}.png` });
    await page.context().close();
  }
}
await browser.close();
console.log("wrote", OUT);
