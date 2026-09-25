import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  canRunLiveMpTests,
  createTestUser,
  deleteTestUser,
  newRunId,
  REQUIRED_ENV_MESSAGE,
  seedFriendship,
  signedInClient,
  signIn,
  type TestUser,
} from "./helpers/testAccounts";
import { playOneTurn } from "./helpers/playMpGame";
import { openHand } from "./helpers/hand";
import { createMpGame, getMpState, respondToMpGame } from "../app/lib/mpStore";
import { compareByMode } from "../app/lib/handSort";

// Live check of the multiplayer meld flow and "smoothness" (no needless
// React re-mounting / layout jumps) against the real Supabase project — two
// signed-in browser contexts, a real game (human A, human B, one AI seat),
// and a solo (pass-and-play) game as the baseline for what "smooth" means.
//
// The card DOM under the hand drawer is instrumented from inside the page
// (see INSTRUMENT below): every card element is identified by its React key
// (the card id, read off the element's fiber), so we can tell "same node,
// kept" from "same card, node destroyed and re-created" (a re-mount) and
// from a legitimate add/remove. A MutationObserver counts raw card-node
// churn, a per-frame rAF sampler measures the largest single-frame movement
// of any card that was present at both ends of the window, and a
// `layout-shift` PerformanceObserver accumulates CLS.
//
//   npx playwright test e2e/multiplayer-smoothness.spec.ts --project=desktop
// (needs NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in
// the environment, e.g. `set -a; . ./.env.local; set +a` first.)
//
// Video of both contexts and screenshots of key moments land under
// test-results/ (see the attachments on the test).

test.skip(!canRunLiveMpTests(), REQUIRED_ENV_MESSAGE);
// The measurements are browser-engine independent; one desktop Chromium run
// is the meaningful one (and keeps the live-game count low).
test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "desktop chromium only");

const RUN_ID = newRunId();
let userA: TestUser;
let userB: TestUser;

test.beforeAll(async () => {
  userA = await createTestUser("smooth-a", RUN_ID);
  userB = await createTestUser("smooth-b", RUN_ID);
  await seedFriendship(userA.id, userB.id);
});

test.afterAll(async () => {
  await deleteTestUser(userA);
  await deleteTestUser(userB);
});

interface WindowStats {
  cardAdded: number;
  cardRemoved: number;
  /** Card ids present before AND after whose DOM node is a different element. */
  remounted: string[];
  /** Card ids present before AND after whose DOM node is the very same element. */
  retained: number;
  lost: string[];
  gained: string[];
  /** Max px any retained card moved between two consecutive frames. */
  maxCardStep: number;
  /** Max px the drawer / hand section top or height changed in one frame. */
  maxContainerStep: number;
  cls: number;
  /** Card ids in DOM order at the end of the window. */
  order: string[];
}

// Installed into the page once (drawer must be open — but it re-reads the DOM
// on every call, so it survives the drawer being closed/reopened).
const INSTRUMENT = `
(() => {
  if (window.__mp) return;
  const HAND = '[data-tutorial="hand"]';
  const fiberKey = (el) => {
    const k = Object.keys(el).find((x) => x.startsWith("__reactFiber$"));
    return k ? el[k].key : null;
  };
  const cardEls = () =>
    [...document.querySelectorAll(HAND + ' [role="button"][aria-pressed]')].filter((e) => fiberKey(e) != null);
  const snap = () => {
    const m = new Map();
    for (const e of cardEls()) m.set(fiberKey(e), e);
    return m;
  };
  const containers = () => {
    const out = [];
    const h = document.querySelector(HAND);
    const d = document.querySelector('[role="dialog"]');
    for (const e of [h, d]) {
      if (e) { const r = e.getBoundingClientRect(); out.push([r.top, r.height]); }
      else out.push(null);
    }
    return out;
  };
  let w = null;
  const isCard = (n) => n.nodeType === 1 && n.matches && n.matches('[role="button"][aria-pressed]') ;
  const countCards = (n) => {
    if (n.nodeType !== 1) return 0;
    let c = isCard(n) && n.closest(HAND) ? 1 : 0;
    if (n.querySelectorAll) c += [...n.querySelectorAll('[role="button"][aria-pressed]')].filter((e) => e.closest(HAND) || n.closest(HAND)).length;
    return c;
  };
  window.__mp = {
    start() {
      const st = { base: snap(), added: 0, removed: 0, maxCard: 0, maxCont: 0, cls: 0, prev: null, prevC: null, raf: 0 };
      st.mo = new MutationObserver((recs) => {
        for (const r of recs) {
          r.addedNodes.forEach((n) => (st.added += countCards(n)));
          r.removedNodes.forEach((n) => (st.removed += countCards(n)));
        }
      });
      st.mo.observe(document.body, { childList: true, subtree: true });
      try {
        st.po = new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) st.cls += e.value;
        });
        st.po.observe({ type: "layout-shift", buffered: false });
      } catch (e) {}
      const tick = () => {
        const cur = new Map();
        for (const [k, el] of snap()) { const r = el.getBoundingClientRect(); cur.set(k, [r.left, r.top]); }
        if (st.prev) for (const [k, p] of cur) { const q = st.prev.get(k); if (q && st.base.has(k)) st.maxCard = Math.max(st.maxCard, Math.abs(p[0]-q[0]), Math.abs(p[1]-q[1])); }
        st.prev = cur;
        const c = containers();
        if (st.prevC) c.forEach((v, i) => { const q = st.prevC[i]; if (v && q) st.maxCont = Math.max(st.maxCont, Math.abs(v[0]-q[0]), Math.abs(v[1]-q[1])); });
        st.prevC = c;
        st.raf = requestAnimationFrame(tick);
      };
      st.raf = requestAnimationFrame(tick);
      w = st;
    },
    stop() {
      const st = w; w = null;
      cancelAnimationFrame(st.raf); st.mo.disconnect(); if (st.po) st.po.disconnect();
      const end = snap();
      const remounted = [], lost = [], gained = [];
      let retained = 0;
      for (const [k, el] of st.base) {
        if (!end.has(k)) lost.push(k);
        else if (end.get(k) !== el) remounted.push(k);
        else retained++;
      }
      for (const k of end.keys()) if (!st.base.has(k)) gained.push(k);
      return {
        cardAdded: st.added, cardRemoved: st.removed, remounted, retained, lost, gained,
        maxCardStep: st.maxCard, maxContainerStep: st.maxCont, cls: st.cls, order: [...end.keys()],
      };
    },
    order() { return [...snap().keys()]; },
  };
})();
`;

async function install(page: Page) {
  await page.evaluate(INSTRUMENT);
}
const begin = (page: Page) => page.evaluate("window.__mp.start()");
async function measure(page: Page, label: string, results: Record<string, WindowStats>, settleMs = 600): Promise<WindowStats> {
  await page.waitForTimeout(settleMs);
  const s = (await page.evaluate("window.__mp.stop()")) as WindowStats;
  results[label] = s;
  return s;
}
const domOrder = (page: Page) => page.evaluate("window.__mp.order()") as Promise<string[]>;

/** Touch the game row so Realtime fires a refresh with no state change —
 * what an opponent's/AI's bookkeeping writes look like to a viewer. */
async function pokeRealtime(page: Page, gameId: string) {
  const responded = page.waitForResponse((r) => r.url().includes("/functions/v1/mp/state"), { timeout: 15_000 });
  await adminClient().from("mp_games").update({ updated_at: new Date().toISOString() }).eq("id", gameId);
  await responded;
}

function card(suit: string, rank: string, isWild = false) {
  return { id: `${suit[0].toUpperCase()}-${rank}-z`, suit, rank, isWild };
}

/** Replaces seat 0's hand server-side (service role; test-only) so the meld
 * flow is deterministic: two 9s+9 book, a 5-8 heart run, a wild 2, fillers. */
async function craftHostHand(gameId: string) {
  const admin = adminClient();
  const { data, error } = await admin.from("mp_game_state").select("engine").eq("game_id", gameId).single();
  if (error || !data) throw new Error(`craft: ${error?.message}`);
  const engine = data.engine as { state: { players: { hand: unknown[] }[] } };
  engine.state.players[0].hand = [
    card("clubs", "9"), card("spades", "9"), card("diamonds", "9"),
    card("hearts", "5"), card("hearts", "6"), card("hearts", "7"), card("hearts", "8"),
    card("spades", "2", true),
    card("clubs", "3"), card("diamonds", "J"), card("spades", "K"), card("clubs", "A"), card("hearts", "Q"),
  ];
  const { error: e2 } = await admin.from("mp_game_state").update({ engine }).eq("game_id", gameId);
  if (e2) throw new Error(`craft write: ${e2.message}`);
}

function fmt(label: string, s: WindowStats) {
  return (
    `${label.padEnd(34)} +${s.cardAdded}/-${s.cardRemoved} nodes  retained ${String(s.retained).padStart(2)}  ` +
    `remounted ${s.remounted.length}  lost ${s.lost.length}  gained ${s.gained.length}  ` +
    `maxCardStep ${s.maxCardStep.toFixed(1)}px  maxContainerStep ${s.maxContainerStep.toFixed(1)}px  CLS ${s.cls.toFixed(4)}`
  );
}

test("solo baseline: draw, sort, discard", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
  await page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith("booksAndRuns")).forEach((k) => localStorage.removeItem(k));
  });
  await page.goto("/new-game/local");
  await page.getByRole("textbox").first().fill("Tester");
  await page.getByRole("button", { name: /add ai/i }).click();
  await page.getByRole("button", { name: /start game/i }).click();
  await expect(page.getByText(/round 1 of \d+/i)).toBeVisible();

  const results: Record<string, WindowStats> = {};
  await page.locator('[data-tutorial="draw-piles"] button').first().click();
  const dialog = await openHand(page);
  await page.waitForTimeout(800); // card-enter animation
  await install(page);

  await begin(page);
  await dialog.getByRole("button", { name: /sort by suit/i }).click();
  await measure(page, "solo: sort by suit", results);

  await begin(page);
  await dialog.getByRole("button", { name: /sort by rank/i }).click();
  await measure(page, "solo: sort by rank", results);

  await begin(page);
  await dialog.locator('[data-tutorial="hand"] [role="button"][aria-pressed]').first().click();
  await dialog.getByRole("button", { name: /discard selected card/i }).click();
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await measure(page, "solo: select+discard+confirm", results, 1200);

  console.log("\n" + Object.entries(results).map(([k, v]) => fmt(k, v)).join("\n"));
  await testInfo.attach("solo-baseline.json", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
  await context.close();

  // Baseline invariants: sorting never re-mounts a card; a discard removes one.
  expect(results["solo: sort by suit"].remounted).toEqual([]);
  expect(results["solo: sort by rank"].remounted).toEqual([]);
  // (Raw node add/remove counts are non-zero for a sort — React re-orders keyed
  // nodes with DOM moves, which a MutationObserver reports as remove+add — so
  // the meaningful signals are identity (remounted) and lost/gained.)
  expect(results["solo: sort by suit"].lost.length + results["solo: sort by suit"].gained.length).toBe(0);
});

test("multiplayer: meld flow + smoothness with two live accounts", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const results: Record<string, WindowStats> = {};
  const clientA = await signedInClient(userA.email, userA.password);
  const clientB = await signedInClient(userB.email, userB.password);

  // Round 2 contract (1 book + 1 run) as a one-round game; seats: A (host,
  // seat 0), B (seat 1), one AI (seat 2 — its turns resolve inline on the
  // server, so B's move hands the turn straight back to A).
  const { game_id: gameId } = await createMpGame(clientA, {
    contractRounds: [2],
    seats: [
      { kind: "human", user_id: userB.id },
      { kind: "ai", difficulty: "easy", name: "Bot" },
    ],
  });
  await respondToMpGame(clientB, gameId, true);
  await craftHostHand(gameId);

  const videoDir = testInfo.outputPath("video");
  const pageA = await signIn(browser, userA.email, userA.password, {
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const pageB = await signIn(browser, userB.email, userB.password);
  try {
    await pageA.goto(`/multiplayer/play?g=${gameId}`);
    await pageB.goto(`/multiplayer/play?g=${gameId}`);
    await expect(pageA.getByText(/draw a card to start/i)).toBeVisible({ timeout: 20_000 });

    // Open the drawer first; drive the draw pile with a DOM click since the
    // modal backdrop covers it (a real player draws first, then opens it —
    // the measured window is the same either way).
    await pageA.getByRole("button", { name: /jump to your hand/i }).click();
    const dialog = pageA.getByRole("dialog", { name: /manage your hand/i });
    await expect(dialog).toBeVisible();
    const handCards = dialog.locator('[data-tutorial="hand"] [role="button"][aria-pressed]');
    await expect(handCards).toHaveCount(13);
    await pageA.waitForTimeout(900); // let the card-enter animation finish
    await install(pageA);
    await testInfo.attach("01-before-draw.png", { body: await pageA.screenshot(), contentType: "image/png" });

    // ── (ii) own draw ────────────────────────────────────────────────────
    await begin(pageA);
    await pageA.getByRole("button", { name: /draw from (the )?pile/i }).dispatchEvent("click");
    await expect(handCards).toHaveCount(14, { timeout: 15_000 });
    const draw = await measure(pageA, "mp: own draw", results);
    expect(draw.gained.length).toBe(1);
    expect(draw.lost.length).toBe(0);
    expect(draw.remounted).toEqual([]);

    // Full-hand ground truth for expected sort orders.
    const hand = (await getMpState(clientA, gameId)).view!.yourHand;
    const expectSorted = (mode: "suit" | "rank") => [...hand].sort(compareByMode(mode)).map((c) => c.id);

    // ── (iii) sort persists through unstage, refresh ─────────────────────
    await begin(pageA);
    await dialog.getByRole("button", { name: /sort by suit/i }).click();
    const sortSuit = await measure(pageA, "mp: sort by suit", results);
    expect(sortSuit.remounted).toEqual([]);
    expect(sortSuit.gained.length + sortSuit.lost.length).toBe(0);
    expect(await domOrder(pageA)).toEqual(expectSorted("suit"));

    // A no-change realtime event (opponent/AI-side bookkeeping) mid-turn.
    await begin(pageA);
    await pokeRealtime(pageA, gameId);
    const refreshSuit = await measure(pageA, "mp: realtime refresh after suit sort", results);
    expect(refreshSuit.cardAdded + refreshSuit.cardRemoved).toBe(0);
    expect(refreshSuit.remounted).toEqual([]);
    expect(refreshSuit.maxCardStep).toBe(0);
    expect(refreshSuit.maxContainerStep).toBe(0);
    expect(refreshSuit.cls).toBeLessThan(0.001);
    expect(await domOrder(pageA)).toEqual(expectSorted("suit"));

    await dialog.getByRole("button", { name: /sort by rank/i }).click();
    expect(await domOrder(pageA)).toEqual(expectSorted("rank"));

    // Stage the book (three 9s), then unstage it: the hand keeps its rank order.
    await begin(pageA);
    for (const name of ["9 of clubs", "9 of spades", "9 of diamonds"]) {
      await dialog.getByRole("button", { name, exact: true }).click();
    }
    await dialog.getByRole("button", { name: /group selected cards/i }).click();
    await expect(handCards).toHaveCount(11);
    const stage = await measure(pageA, "mp: stage book", results);
    expect(stage.remounted).toEqual([]);
    expect(stage.lost.length).toBe(3);
    expect(stage.gained.length).toBe(0);
    await begin(pageA);
    await dialog.getByRole("button", { name: /^remove$/i }).click();
    await expect(handCards).toHaveCount(14);
    const unstage = await measure(pageA, "mp: unstage book", results);
    expect(unstage.remounted).toEqual([]);
    expect(unstage.gained.length).toBe(3); // the three returning cards only
    expect(unstage.lost.length).toBe(0);
    expect(await domOrder(pageA)).toEqual(expectSorted("rank"));
    // …and a refresh straight after the unstage doesn't revert it.
    await begin(pageA);
    await pokeRealtime(pageA, gameId);
    const refreshRank = await measure(pageA, "mp: realtime refresh after unstage", results);
    expect(refreshRank.remounted).toEqual([]);
    expect(refreshRank.cardAdded + refreshRank.cardRemoved).toBe(0);
    expect(refreshRank.maxCardStep).toBe(0);
    expect(await domOrder(pageA)).toEqual(expectSorted("rank"));

    // ── (iv) drag-reorder survives a refresh ─────────────────────────────
    const before = await domOrder(pageA);
    const first = handCards.first();
    const last = handCards.last();
    const fb = (await first.boundingBox())!;
    const lb = (await last.boundingBox())!;
    await begin(pageA);
    await pageA.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await pageA.mouse.down();
    await pageA.waitForTimeout(250); // past the long-press threshold
    await pageA.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2, { steps: 12 });
    await pageA.mouse.up();
    await pageA.waitForTimeout(300);
    const dragged = await domOrder(pageA);
    expect(dragged[dragged.length - 1]).toBe(before[0]);
    expect(dragged).not.toEqual(before);
    await pokeRealtime(pageA, gameId);
    const dragRefresh = await measure(pageA, "mp: drag-reorder + refresh", results);
    expect(dragRefresh.remounted).toEqual([]);
    expect(dragRefresh.gained.length + dragRefresh.lost.length).toBe(0);
    expect(await domOrder(pageA)).toEqual(dragged);
    await testInfo.attach("02-sorted-dragged.png", { body: await pageA.screenshot(), contentType: "image/png" });

    // ── (A) run with an ambiguous wild → position picker ─────────────────
    for (const name of ["5 of hearts", "6 of hearts", "7 of hearts", /^2 of spades/]) {
      await dialog.getByRole("button", typeof name === "string" ? { name, exact: true } : { name }).click();
    }
    await dialog.getByRole("button", { name: /group selected cards/i }).click();
    await expect(dialog.getByText(/which card is the wild standing in for/i)).toBeVisible();
    const options = dialog.locator("text=/which card is the wild/i").locator("xpath=following-sibling::div//button");
    expect(await options.count()).toBeGreaterThanOrEqual(3); // ≥2 positions + Cancel
    await testInfo.attach("03-wild-picker.png", { body: await pageA.screenshot(), contentType: "image/png" });
    await options.last().click(); // Cancel — nothing staged
    await expect(dialog.getByText(/which card is the wild standing in for/i)).toHaveCount(0);
    // Deselect leftovers, then stage the unambiguous contract.
    for (const name of ["5 of hearts", "6 of hearts", "7 of hearts", /^2 of spades/]) {
      const b = dialog.getByRole("button", typeof name === "string" ? { name, exact: true } : { name });
      if ((await b.getAttribute("aria-pressed")) === "true") await b.click();
    }

    // ── (A) staged contract: Confirm Meld, rejection, real meld, discard ──
    const stageSet = async (names: string[]) => {
      for (const name of names) await dialog.getByRole("button", { name, exact: true }).click();
      await dialog.getByRole("button", { name: /group selected cards/i }).click();
    };
    await stageSet(["9 of clubs", "9 of spades", "9 of diamonds"]);
    await stageSet(["5 of hearts", "6 of hearts", "7 of hearts", "8 of hearts"]);
    // The combined flow is gone: melding and discarding are separate actions.
    await expect(dialog.getByRole("button", { name: /^meld & discard$/i })).toHaveCount(0);
    const meldBtn = dialog.getByRole("button", { name: /^confirm meld$/i });
    await expect(meldBtn).toBeVisible();
    await expect(meldBtn).toBeEnabled();
    await testInfo.attach("04-contract-staged.png", { body: await pageA.screenshot(), contentType: "image/png" });

    // Server rejection: fake one on the move endpoint (the deployed
    // function's own rejection texts are covered by adapter tests).
    const REJECT = "Test rejection: that meld isn't allowed.";
    let rejected = 0;
    await pageA.route("**/functions/v1/mp/move", async (route) => {
      rejected++;
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: REJECT }) });
    });
    await meldBtn.click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText(REJECT);
    await pageA.waitForTimeout(3000);
    await expect(alert).toContainText(REJECT); // persists (no auto-dismiss)
    await expect(meldBtn).toBeEnabled(); // staged contract kept
    expect(rejected).toBe(1);
    await testInfo.attach("05-rejection.png", { body: await pageA.screenshot(), contentType: "image/png" });
    await pageA.unroute("**/functions/v1/mp/move");

    // Retry for real: Confirm Meld succeeds immediately — the melds are
    // real and visible on the table, and it is still A's turn.
    await begin(pageA);
    await meldBtn.click();
    await expect(pageA.locator("[data-meld-id]")).toHaveCount(2, { timeout: 20_000 });
    const commit = await measure(pageA, "mp: confirm meld", results, 1500);
    expect(commit.remounted).toEqual([]);
    expect(commit.gained.length).toBe(0);
    const afterMeld = (await getMpState(clientA, gameId)).view!;
    expect(afterMeld.melds.length).toBe(2);
    expect(afterMeld.currentSeat).toBe(afterMeld.yourSeat); // turn stays open

    // Then the discard is its own action that ends the turn. (A successful
    // meld closes the drawer on purpose — see the flight effect in
    // multiplayer/play/page.tsx — so reopen it.)
    await pageA.getByRole("button", { name: /jump to your hand/i }).click();
    await dialog.getByRole("button", { name: "3 of clubs", exact: true }).click();
    await dialog.getByRole("button", { name: /discard selected card/i }).click();
    await begin(pageA);
    await dialog.getByRole("button", { name: /^confirm$/i }).click();
    await expect(alert).toHaveCount(0, { timeout: 20_000 });
    const discardM = await measure(pageA, "mp: discard after meld", results, 1500);
    expect(discardM.remounted).toEqual([]);
    const afterDiscard = (await getMpState(clientA, gameId)).view!;
    expect(afterDiscard.currentSeat).not.toBe(afterDiscard.yourSeat);

    // ── (i) opponent (B, then the AI seat) moves while A watches ─────────
    await expect(handCards).toHaveCount(6);
    await pageA.waitForTimeout(900);
    await begin(pageA);
    const bRes = await playOneTurn(clientB, gameId);
    expect(bRes.status).toBe("active");
    await expect(pageA.getByText(/draw a card to start/i)).toBeVisible({ timeout: 20_000 });
    const opp = await measure(pageA, "mp: opponent+AI move arrives", results, 1000);
    expect(opp.remounted).toEqual([]);
    expect(opp.cardAdded + opp.cardRemoved).toBe(0);
    expect(opp.maxCardStep).toBe(0);
    // The hand itself must not move (maxCardStep 0 above). Page content behind
    // the drawer legitimately shifts a little when the "your turn" banner and
    // the opponents' table changes appear: hold it under the Web Vitals "good"
    // CLS bar (0.1) rather than zero.
    expect(opp.cls).toBeLessThan(0.1);
    await testInfo.attach("06-after-opponent.png", { body: await pageA.screenshot(), contentType: "image/png" });

    // Own draw again, now that a real opponent-driven refresh preceded it.
    await begin(pageA);
    await pageA.getByRole("button", { name: /draw from (the )?pile/i }).dispatchEvent("click");
    await expect(handCards).toHaveCount(7, { timeout: 15_000 });
    const draw2 = await measure(pageA, "mp: own draw (turn 2)", results);
    expect(draw2.gained.length).toBe(1);
    expect(draw2.remounted).toEqual([]);

    console.log("\n" + Object.entries(results).map(([k, v]) => fmt(k, v)).join("\n"));
    await testInfo.attach("mp-metrics.json", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
  } finally {
    await pageA.context().close().catch(() => {});
    await pageB.context().close().catch(() => {});
    await adminClient().from("mp_games").delete().eq("id", gameId);
  }
});
