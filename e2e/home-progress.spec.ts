import { test, expect, type Page } from "@playwright/test";
import {
  canRunLiveMpTests,
  createTestUser,
  deleteTestUser,
  newRunId,
  REQUIRED_ENV_MESSAGE,
  signIn,
  type TestUser,
} from "./helpers/testAccounts";

// Home's progression layer: the Today card (Daily / Weekly / Quests behind a
// segmented control), the top-bar identity chip with a real XP bar, and the
// "welcome back" recap.

async function seedReturningPlayer(page: Page, extra: Record<string, string> = {}) {
  await page.addInitScript((extraKeys) => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
      localStorage.setItem("booksAndRuns:hasStartedAGame", "1");
      localStorage.setItem("booksAndRuns:seenTips", JSON.stringify(["home", "new-game"]));
      // Only on the first load of the test — a reload must not re-seed.
      if (!sessionStorage.getItem("e2eSeeded")) {
        sessionStorage.setItem("e2eSeeded", "1");
        for (const [k, v] of Object.entries(extraKeys)) localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, extra);
}

test.describe("Home progression (guest)", () => {
  test("a returning guest sees the daily and weekly quests with a sign-in prompt", async ({ page }) => {
    await seedReturningPlayer(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "Quests" }).click();
    const quests = page.getByRole("region", { name: "Quests" });
    await expect(quests).toBeVisible();
    await expect(quests.getByRole("progressbar")).toHaveCount(6);
    await expect(quests.getByText("Today")).toBeVisible();
    await expect(quests.getByText("This week")).toBeVisible();
    await expect(quests.getByText(/New quests in/)).toHaveCount(2);
    await expect(quests.getByText(/sign in to earn xp/i)).toBeVisible();
    await expect(quests.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in");
    // Guests never see an account identity chip or e-mail line.
    await expect(page.getByText(/signed in as/i)).toHaveCount(0);
  });

  test("Quick Deal on Home re-deals the saved lineup in one tap", async ({ page }) => {
    await seedReturningPlayer(page, {
      "booksAndRuns:favoriteGame": JSON.stringify({
        humanCount: 1,
        humanNames: ["Tester"],
        aiDifficulties: ["easy", "hard"],
        roundMode: "short",
        customRounds: [],
      }),
    });
    await page.goto("/");
    // The Play zone's one primary button becomes Quick Deal, with the saved
    // lineup as its caption and New Game demoted beside it.
    const zone = page.getByTestId("play-zone");
    await expect(zone.getByRole("button", { name: "Quick Deal" })).toBeVisible();
    await expect(zone).toContainText("Tester");
    await expect(zone.getByRole("link", { name: "New Game" })).toBeVisible();
    await zone.getByRole("button", { name: "Quick Deal" }).click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByText(/round 1 of 5/i)).toBeVisible();
  });

  test("a first-ever session keeps Home calm — no quests yet", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("booksAndRuns:introSeen", "1");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/");
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("booksAndRuns"))
        .forEach((k) => localStorage.removeItem(k));
    });
    await page.reload();
    // One primary button — New Game — and no Quick Deal / Continue yet.
    await expect(page.getByTestId("play-primary")).toHaveText("New Game");
    await expect(page.getByTestId("play-zone").getByRole("link", { name: "New Game" })).toHaveCount(1);
    // Calm: no Quests segment, no Quests region.
    await expect(page.getByRole("tab", { name: "Quests" })).toBeHidden();
    await expect(page.getByRole("region", { name: "Quests" })).toHaveCount(0);
    // The Today card itself is there, with Daily and Weekly.
    await expect(page.getByRole("tab", { name: "Daily" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Weekly" })).toBeVisible();
  });

  test("the Today card opens on Daily, switches segments, and remembers the choice", async ({ page }) => {
    await seedReturningPlayer(page);
    await page.goto("/");
    const daily = page.getByRole("tab", { name: "Daily" });
    await expect(daily).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /play today's deal/i })).toBeVisible();

    await page.getByRole("tab", { name: "Weekly" }).click();
    await expect(page.getByRole("button", { name: /play this week's challenge/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /play today's deal/i })).toHaveCount(0);

    // Remembered across a reload (localStorage + the <html data-today-tab> hint).
    await page.reload();
    await expect(page.getByRole("tab", { name: "Weekly" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("html")).toHaveAttribute("data-today-tab", "weekly");

    // Arrow keys move between segments.
    await page.getByRole("tab", { name: "Weekly" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Quests" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Quests" })).toBeVisible();
  });

  test("the guest sign-in card is dismissible and stays dismissed", async ({ page }) => {
    await seedReturningPlayer(page);
    await page.goto("/");
    // Sign-in only exists when the build has a Supabase project configured
    // (CI runs without one — there's nothing to sign in to).
    const configured = (await page.getByTestId("home-topbar").getByRole("link", { name: "Sign in" }).count()) > 0;
    test.skip(!configured, "Supabase isn't configured in this environment");
    const card = page.locator("[data-home-signin]");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Dismiss" }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.locator("[data-home-signin]")).toBeHidden();
    // The top bar's Sign in chip is always there.
    await expect(page.getByTestId("home-topbar").getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("the quests are the same for everyone on a given UTC day (deterministic)", async ({ browser }) => {
    const labels: string[][] = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await seedReturningPlayer(page);
      await page.goto("/");
      await page.getByRole("tab", { name: "Quests" }).click();
      const quests = page.getByRole("region", { name: "Quests" });
      await expect(quests).toBeVisible();
      labels.push(await quests.getByRole("progressbar").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? "")));
      await context.close();
    }
    expect(labels[0]).toEqual(labels[1]);
    expect(labels[0]).toHaveLength(6);
  });

  test("a player back after several days gets a dismissible welcome-back card", async ({ page }) => {
    await seedReturningPlayer(page, { "booksAndRuns:lastHomeVisit": String(Date.now() - 6 * 86_400_000) });
    await page.goto("/");
    const card = page.getByRole("region", { name: "Welcome back!" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/daily deal is ready/i)).toBeVisible();
    await card.getByRole("button", { name: "Dismiss" }).click();
    await expect(card).toHaveCount(0);
    // Visiting again straight away is not another absence.
    await page.reload();
    await expect(page.getByTestId("play-primary")).toBeVisible();
    await expect(page.getByRole("region", { name: "Welcome back!" })).toHaveCount(0);
  });
});

test.describe("Home progression (signed in)", () => {
  test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);

  let user: TestUser | null = null;
  test.afterEach(async () => {
    await deleteTestUser(user);
    user = null;
  });

  test("shows the identity chip with an XP bar instead of the e-mail, and quests when the server supports them", async ({ browser }) => {
    user = await createTestUser("home", newRunId());
    const page = await signIn(browser, user.email, user.password);
    // Deterministic server side regardless of whether migration 0056 / the
    // redeployed solo-verify are live on the project this runs against.
    await page.context().route("**/rest/v1/quest_baselines*", (r) => r.fulfill({ json: [] }));
    await page.context().route("**/rest/v1/xp_ledger*", (r) => r.fulfill({ json: [] }));
    await page.context().route("**/functions/v1/solo-verify", (r) => r.fulfill({ json: { ok: true, quests: [] } }));
    await page.evaluate(() => {
      localStorage.setItem("booksAndRuns:hasStartedAGame", "1");
      localStorage.setItem("booksAndRuns:seenTips", JSON.stringify(["home", "new-game"]));
      // A brand-new account opens the language/notifications welcome dialog.
      localStorage.removeItem("booksAndRuns:justSignedUp");
    });
    await page.goto("/");

    const chip = page.getByTestId("home-topbar").getByRole("link", { name: /Level \d+/ });
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip.getByRole("progressbar")).toBeVisible();
    await expect(chip.getByText(/XP to level/)).toBeVisible();
    await expect(page.getByText(user.email)).toHaveCount(0);
    await expect(page.getByText(/signed in as/i)).toHaveCount(0);

    // Signed in: the top bar has the bell + settings gear, no guest chip.
    await expect(page.getByTestId("notification-bell")).toBeVisible();
    await expect(page.getByTestId("home-topbar").getByRole("link", { name: "Settings" })).toBeVisible();
    // The streak-shield rows show once each, for the selected segment.
    await expect(page.getByTestId("daily-shields")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("weekly-shields")).toHaveCount(0);
    await page.getByRole("tab", { name: "Weekly" }).click();
    await expect(page.getByTestId("weekly-shields")).toBeVisible();
    await expect(page.getByTestId("daily-shields")).toHaveCount(0);

    await page.getByRole("tab", { name: "Quests" }).click();
    const quests = page.getByRole("region", { name: "Quests" });
    await expect(quests).toBeVisible({ timeout: 15_000 });
    await expect(quests.getByRole("progressbar")).toHaveCount(6);
    // Signed in: no sign-in prompt inside the card.
    await expect(quests.getByText(/sign in to earn xp/i)).toHaveCount(0);
    await page.context().close();
  });

  test("celebrates a quest the server just paid out", async ({ browser }) => {
    user = await createTestUser("home-quest", newRunId());
    const page = await signIn(browser, user.email, user.password);
    await page.context().route("**/rest/v1/quest_baselines*", (r) => r.fulfill({ json: [] }));
    await page.context().route("**/rest/v1/xp_ledger*", (r) => r.fulfill({ json: [] }));
    await page.context().route("**/functions/v1/solo-verify", (r) =>
      r.fulfill({ json: { ok: true, quests: [{ id: "d_win", period: "daily", xp: 30 }] } })
    );
    await page.evaluate(() => {
      localStorage.setItem("booksAndRuns:hasStartedAGame", "1");
      localStorage.setItem("booksAndRuns:seenTips", JSON.stringify(["home", "new-game"]));
      localStorage.removeItem("booksAndRuns:justSignedUp");
    });
    await page.goto("/");
    const toast = page.getByRole("status").filter({ hasText: "Quest complete!" });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText("Win games · +30 XP");
    await toast.getByRole("button", { name: "Dismiss" }).click();
    await expect(toast).toHaveCount(0);
    await page.context().close();
  });
});
