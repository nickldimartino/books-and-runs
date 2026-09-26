import { test, expect, type Page } from "@playwright/test";
import en from "../app/lib/i18n/dictionaries/en";
import { toPseudo } from "../app/lib/i18n/pseudoLocale";

// Catches hardcoded (never-through-t()) UI text on any guest-reachable route
// without needing real translations: the dev-only pseudo-locale turns every
// translated string into bracketed, accented text ("[Ûñĺôçķ ñéŵ]"), so any
// run of 3+ plain-ASCII English words still visible on screen was not routed
// through t(). No secrets or accounts needed. See AGENTS.md "Adding
// user-visible text". The pseudo-locale only exists in non-production builds
// (`next dev`, which is what Playwright boots).

const ROUTES = [
  "/",
  "/progress",
  "/social",
  "/profile",
  "/how-to-play",
  "/terms",
  "/privacy",
  "/history",
  "/sign-in",
  "/reset-password",
  "/settings",
  "/settings#display",
  "/settings#audio",
  "/settings#gameplay",
  "/settings#accessibility",
  "/settings/theme",
  "/settings/card-back",
  "/settings/card-face",
  "/settings/ambient-song",
  "/new-game",
  "/new-game/local",
  "/new-game/multiplayer",
  "/support",
  "/tip",
  "/scorecard",
  "/stats",
  "/achievements",
  "/leaderboard",
  "/friends",
  "/clubs",
  "/tournaments",
  "/tournaments/new",
  "/multiplayer",
  "/multiplayer/new",
  "/player",
  "/account",
  "/this-route-does-not-exist",
];

/** Text that is legitimately English on a pseudo-locale page. Each entry is
 * matched against a run of plain-ASCII words. Keep this tiny and commented. */
const ALLOWED_RUNS: RegExp[] = [
  // Proper nouns that are deliberately never translated.
  /Books & Runs/,
  /Contract Rummy/i, // game name used in prose that is data-driven (e.g. document meta)
];

/** Finds runs of >= 3 plain-ASCII words in visible text nodes and in
 * user-visible attributes. Runs inside the page, returns offending strings. */
async function findEnglish(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const RUN = /(?<![A-Za-z])[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){2,}/g;
    const out = new Set<string>();
    const visible = (el: Element | null) => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
      }
      return true;
    };
    const scan = (s: string, where: string) => {
      const norm = s.replace(/\s+/g, " ");
      for (const m of norm.matchAll(RUN)) out.add(`${where}: ${m[0]}`);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(p.tagName)) continue;
      if (!visible(p)) continue;
      scan(n.textContent ?? "", "text");
    }
    for (const el of document.body.querySelectorAll("[aria-label],[title],[placeholder],[alt]")) {
      if (!visible(el)) continue;
      for (const a of ["aria-label", "title", "placeholder", "alt"]) {
        const v = el.getAttribute(a);
        if (v) scan(v, a);
      }
    }
    return [...out];
  });
}

async function report(page: Page, label: string) {
  const found = (await findEnglish(page)).filter((f) => !ALLOWED_RUNS.some((r) => r.test(f)));
  expect(found, `Untranslated English on ${label} (route rendered in the pseudo-locale)`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
      localStorage.setItem("booksAndRuns:pseudoLocale", "1");
    } catch {
      /* ignore */
    }
  });
});

test("the pseudo-locale actually applies (sanity)", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText(toPseudo(en["settings.language.title"])).first()).toBeVisible({ timeout: 15_000 });
});

for (const route of ROUTES) {
  test(`no hardcoded English on ${route}`, async ({ page }) => {
    await page.goto(route);
    // Wait for the pseudo dictionary to load (any bracketed accented text).
    await page.waitForFunction(() => /\[[^\]]*[À-ſƀ-ɏḀ-ỿ]/.test(document.body.innerText), undefined, { timeout: 15_000 });
    await page.waitForTimeout(500); // let client-only content settle
    await report(page, route);
  });
}

test("no hardcoded English in a local game (board + hand drawer)", async ({ page }) => {
  await page.goto("/new-game/local");
  await page.waitForFunction(() => /\[[^\]]*[À-ſƀ-ɏḀ-ỿ]/.test(document.body.innerText), undefined, { timeout: 15_000 });
  await page.getByRole("textbox").first().fill("Tester");
  await page.getByRole("button", { name: toPseudo(en["newGameLocal.addAI"]) }).click();
  await page.getByRole("button", { name: toPseudo(en["newGameLocal.startGame"]) }).click();
  await expect(page.locator('[data-tutorial="draw-piles"] button').first()).toBeVisible({ timeout: 15_000 });
  await report(page, "the game board (before drawing)");
  await page.locator('[data-tutorial="draw-piles"] button').first().click();
  await page.waitForTimeout(600);
  await report(page, "the game board (after drawing)");
  const dock = page.getByTestId("hand-dock");
  if (!(await dock.isVisible().catch(() => false))) {
    await page.locator('[data-tutorial="hand-bar"]').click();
    await page.getByRole("dialog").first().waitFor();
  }
  await report(page, "the hand drawer / dock");
});

test("the detector itself flags plain English (self-test)", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForFunction(() => /\[[^\]]*[À-ſƀ-ɏḀ-ỿ]/.test(document.body.innerText), undefined, { timeout: 15_000 });
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.textContent = "This was never translated";
    p.setAttribute("aria-label", "Another hardcoded label here");
    document.body.appendChild(p);
  });
  const found = await findEnglish(page);
  expect(found.join("|")).toContain("This was never translated");
  expect(found.join("|")).toContain("Another hardcoded label here");
});
