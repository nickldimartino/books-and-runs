import { describe, expect, it } from "vitest";
import { THEME_ITEMS } from "@/store/catalog";
import { THEMES } from "./themeStore";

// The Sept 2026 "themes as a Boutique category" pass: exactly 8 of the 38
// table themes stay free forever (midnight — the DEFAULT_THEME, so a guest
// always gets a free theme — plus daylight/casino/pastel/noir/sakura/
// ember/lagoon); the other 30 become purchasable. themeStore.ts's own
// `unlock` field and src/store/catalog.ts's THEME_ITEMS must agree exactly,
// or a theme could show as purchasable in the Boutique but never actually
// lock in the picker (or vice versa).
const ALWAYS_FREE_THEME_IDS = ["midnight", "daylight", "casino", "pastel", "noir", "sakura", "ember", "lagoon"];

describe("theme Boutique gating — themeStore.ts vs. THEME_ITEMS agree", () => {
  it("THEME_ITEMS has exactly 30 items", () => {
    expect(THEME_ITEMS).toHaveLength(30);
  });

  it("THEMES has exactly 38 entries (8 free + 30 paid)", () => {
    expect(THEMES).toHaveLength(38);
  });

  it("every one of the 8 always-free theme ids has no `unlock` field", () => {
    for (const id of ALWAYS_FREE_THEME_IDS) {
      const theme = THEMES.find((t) => t.id === id);
      expect(theme, `missing theme ${id}`).toBeDefined();
      expect(theme!.unlock, `${id} should be free (no unlock)`).toBeUndefined();
    }
  });

  it("midnight (DEFAULT_THEME) is one of the free ones", () => {
    const midnight = THEMES.find((t) => t.id === "midnight");
    expect(midnight!.unlock).toBeUndefined();
  });

  it("every theme NOT in the always-free list has a `{ kind: \"boutique\" }` unlock rule with a matching category/itemId", () => {
    const paidThemes = THEMES.filter((t) => !ALWAYS_FREE_THEME_IDS.includes(t.id));
    expect(paidThemes).toHaveLength(30);
    for (const theme of paidThemes) {
      expect(theme.unlock?.kind, `${theme.id} should be gated`).toBe("boutique");
      if (theme.unlock?.kind === "boutique") {
        expect(theme.unlock.category).toBe("theme");
        expect(theme.unlock.itemId).toBe(theme.id);
      }
    }
  });

  it("every paid theme id has a real, distinct THEME_ITEMS entry — and vice versa", () => {
    const paidThemeIds = new Set(THEMES.filter((t) => !ALWAYS_FREE_THEME_IDS.includes(t.id)).map((t) => t.id));
    const catalogIds = new Set(THEME_ITEMS.map((i) => i.id));
    expect(catalogIds).toEqual(paidThemeIds);
    // Distinct — no duplicate catalog entries for the same theme id.
    expect(THEME_ITEMS.map((i) => i.id)).toHaveLength(new Set(THEME_ITEMS.map((i) => i.id)).size);
  });

  it("no always-free theme id ever appears in THEME_ITEMS", () => {
    const catalogIds = new Set(THEME_ITEMS.map((i) => i.id));
    for (const id of ALWAYS_FREE_THEME_IDS) expect(catalogIds.has(id)).toBe(false);
  });
});
