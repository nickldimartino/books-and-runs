import { expect, type Locator, type Page } from "@playwright/test";

/** The container holding the hand + meld/discard controls. On wide screens
 * (>= 1024px) that's the always-visible dock beside the table; on phones it's
 * the "Manage your hand" drawer, opened from the preview bar. */
export async function openHand(page: Page): Promise<Locator> {
  const dock = page.getByTestId("hand-dock");
  if (await dock.isVisible().catch(() => false)) return dock;
  await page.locator('[data-tutorial="hand-bar"]').click();
  const dialog = page.getByRole("dialog", { name: /manage your hand/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Waits until it's the human's turn again (no pass-the-device screen exists
 * with a single human — the board just comes back after the AIs play). */
export async function waitForMyTurn(page: Page): Promise<void> {
  await expect(page.locator('[data-tutorial="draw-piles"] button').first()).toBeEnabled({ timeout: 15_000 });
}
