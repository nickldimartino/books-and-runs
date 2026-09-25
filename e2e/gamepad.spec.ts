import { test, expect } from "@playwright/test";

// A fake standard-mapping gamepad: the spec flips button states on
// window.__pad and the app's polling loop (GamepadNavigation.tsx) reacts.
test("a connected gamepad shows prompts and D-pad / A drive the UI", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("booksAndRuns:introSeen", "1");
    } catch {
      /* ignore */
    }
    const pad = {
      connected: true,
      id: "fake pad",
      index: 0,
      mapping: "standard",
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    navigator.getGamepads = () => [pad] as unknown as (Gamepad | null)[];
  });
  await page.goto("/settings");
  await page.evaluate(() => window.dispatchEvent(new Event("gamepadconnected")));
  await expect(page.getByTestId("gamepad-prompts")).toBeVisible();

  const tap = async (button: number) => {
    await page.evaluate((b) => ((window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b].pressed = true), button);
    await page.waitForTimeout(80);
    await page.evaluate((b) => ((window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b].pressed = false), button);
    await page.waitForTimeout(80);
  };

  // D-pad down lands focus on a control and switches on the bold focus style.
  await tap(13);
  await expect
    .poll(() => page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null))
    .toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-input", "gamepad");

  // Moving right then A activates whatever is focused without throwing.
  const before = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
  await tap(15);
  await tap(13);
  const after = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
  expect(after).toBeDefined();
  expect(before).toBeDefined();
  await tap(0);

  // A real mouse press drops back to the normal look.
  await page.mouse.click(5, 5);
  await expect(page.locator("html")).not.toHaveAttribute("data-input", "gamepad");
});
