import { test, expect, type Page } from "@playwright/test";

// The persistent app navigation (components/AppNav.tsx): a bottom tab bar on
// phones/tablets, a left rail from 1024px, on hub/list screens only.

async function skipIntro(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
      localStorage.setItem("booksAndRuns:seenTips", JSON.stringify(["home", "new-game", "friends", "leaderboard", "achievements", "clubs", "tournaments", "settings", "player-profile"]));
    } catch {
      /* ignore */
    }
  });
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" });

test.describe("app nav — phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test.beforeEach(async ({ page }) => skipIntro(page));

  test("shows four tabs with the current one marked, and tabs navigate", async ({ page }) => {
    await page.goto("/");
    await expect(nav(page)).toBeVisible();
    await expect(nav(page).getByRole("link")).toHaveCount(4);
    await expect(nav(page).getByRole("link", { name: "Play" })).toHaveAttribute("aria-current", "page");

    await nav(page).getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Progress" })).toHaveAttribute("aria-current", "page");
    await expect(nav(page).getByRole("link", { name: "Play" })).not.toHaveAttribute("aria-current", "page");

    await nav(page).getByRole("link", { name: "Social" }).click();
    await expect(page).toHaveURL(/\/social$/);
    await expect(page.getByRole("link", { name: /Clubs/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tournaments/ })).toBeVisible();

    await nav(page).getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("link", { name: /Settings/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Help & about" })).toBeVisible();

    await nav(page).getByRole("link", { name: "Play" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("child screens highlight their hub's tab", async ({ page }) => {
    for (const [path, tab] of [
      ["/achievements", "Progress"],
      ["/leaderboard", "Progress"],
      ["/friends", "Social"],
      ["/clubs", "Social"],
      ["/tournaments", "Social"],
      ["/settings", "Profile"],
      ["/how-to-play", "Profile"],
    ] as const) {
      await page.goto(path);
      await expect(nav(page).getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    }
  });

  test("is hidden on focused flows", async ({ page }) => {
    for (const path of ["/new-game", "/new-game/local", "/sign-in", "/settings/theme", "/scorecard", "/tournaments/new"]) {
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.getByTestId("app-nav"), path).toHaveCount(0);
    }
  });

  test("never covers page content (audit of every routed screen at 375px)", async ({ page }) => {
    for (const path of [
      "/", "/progress", "/social", "/profile", "/leaderboard", "/friends", "/clubs", "/tournaments",
      "/achievements", "/player", "/history", "/settings", "/account", "/how-to-play", "/support", "/privacy", "/terms",
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("app-nav")).toBeVisible();
      await page.waitForTimeout(400);
      const r = await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((res) => setTimeout(res, 150));
        const navTop = document.querySelector(".app-nav")!.getBoundingClientRect().top;
        const bottoms = Array.from(document.querySelectorAll("main *"))
          .filter((e) => e.getBoundingClientRect().height > 0 && !e.closest(".app-nav") && getComputedStyle(e).position !== "fixed")
          .map((e) => e.getBoundingClientRect().bottom);
        return {
          navTop,
          contentBottom: Math.max(...bottoms),
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      expect(r.contentBottom, `${path} content sits above the tab bar`).toBeLessThanOrEqual(r.navTop + 1);
      expect(r.overflowX, `${path} has no horizontal scroll`).toBe(false);
    }
  });

  test("a game in progress has no nav, and Home offers Continue when you leave it", async ({ page }) => {
    await page.goto("/new-game/local");
    await page.getByRole("textbox").first().fill("Tester");
    await page.getByRole("button", { name: /add ai/i }).click();
    await page.getByRole("button", { name: /start game/i }).click();
    await expect(page.getByText(/round 1 of \d+/i)).toBeVisible();
    await expect(page.getByTestId("app-nav")).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByTestId("play-primary")).toHaveText("Continue");
    await expect(page.getByTestId("play-zone").getByRole("link", { name: "New Game" })).toBeVisible();
  });

  test("tap targets are at least 44px tall", async ({ page }) => {
    await page.goto("/");
    for (const link of await nav(page).getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("labels fit in German at 375px", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("booksAndRuns:locale", "de"));
    await page.reload();
    await expect(page.getByTestId("app-nav").getByRole("link", { name: "Fortschritt" })).toBeVisible();
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".app-nav__label")).some((l) => l.scrollWidth > l.clientWidth)
    );
    expect(clipped).toBe(false);
  });

  test("Today segments and the Play zone fit in de / ru / ja / fr at 375px", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("booksAndRuns:hasStartedAGame", "1"));
    for (const lang of ["de", "ru", "ja", "fr"]) {
      await page.evaluate((l) => localStorage.setItem("booksAndRuns:locale", l), lang);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByTestId("today-card")).toBeVisible();
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="tab"] > span, [data-testid="play-primary"]')).filter(
          (e) => e.scrollWidth > e.clientWidth
        ).map((e) => e.textContent)
      );
      expect(clipped, lang).toEqual([]);
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflowX, lang).toBe(false);
    }
  });
});

test.describe("app nav — desktop rail", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => skipIntro(page));

  test("is a left rail beside the content, not over it", async ({ page }) => {
    await page.goto("/progress");
    const box = await nav(page).boundingBox();
    expect(box!.x).toBe(0);
    expect(box!.width).toBeLessThan(120);
    expect(box!.height).toBeGreaterThan(700);
    const mainBox = await page.locator("main").first().boundingBox();
    expect(mainBox!.x).toBeGreaterThanOrEqual(box!.width - 1);
  });

  test("Home is two columns", async ({ page }) => {
    await page.goto("/");
    const play = await page.getByTestId("play-zone").boundingBox();
    const today = await page.getByTestId("today-card").boundingBox();
    expect(today!.x).toBeGreaterThan(play!.x + play!.width - 1);
  });
});

test("the nav stays hidden while the first-visit intro plays", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const state = await page.evaluate(() => ({
    intro: document.documentElement.hasAttribute("data-intro"),
    visibility: getComputedStyle(document.querySelector(".app-nav")!).visibility,
  }));
  if (state.intro) expect(state.visibility).toBe("hidden");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-intro")), { timeout: 6000 })
    .toBe(false);
  await expect(nav(page)).toBeVisible();
});

test.describe("Back returns to where you came from", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("booksAndRuns:introSeen", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("Progress → Leaderboard → Back lands on Progress, not Home", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("app-nav").getByRole("link", { name: "Progress" }).click();
    await page.getByRole("link", { name: /leaderboard/i }).first().click();
    await expect(page).toHaveURL(/\/leaderboard\/?$/);
    const back = page.getByRole("link", { name: /^←/ }).first();
    await expect(back).toHaveText(/progress/i);
    await back.click();
    await expect(page).toHaveURL(/\/progress\/?$/);
  });

  test("Social → Play with friends → Back lands on Social", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("app-nav").getByRole("link", { name: "Social" }).click();
    await page.getByRole("link", { name: /play with friends/i }).first().click();
    await expect(page).toHaveURL(/\/new-game\/multiplayer\/?$/);
    const back = page.getByRole("link", { name: /^←/ }).first();
    await expect(back).toHaveText(/social/i); // the trail resolves right after mount
    await back.click();
    await expect(page).toHaveURL(/\/social\/?$/);
  });

  test("a page opened directly falls back to its hub", async ({ page }) => {
    // History is always available (Achievements etc. become a "not set up"
    // gate when no Supabase project is configured, as in CI).
    await page.goto("/history");
    await page.getByRole("link", { name: /^←/ }).first().click();
    await expect(page).toHaveURL(/\/profile\/?$/);
  });
});
