import { describe, expect, it } from "vitest";
import type { Card, Meld } from "@/types";
import en from "./i18n/dictionaries/en";
import ja from "./i18n/dictionaries/ja";
import ru from "./i18n/dictionaries/ru";
import { meldLabel } from "./meldLabel";

// Same translator() stub as cosmeticRequirementText.test.tsx — the real
// dictionaries, no mocked t().
function translator(d: Record<string, string>) {
  const interp = (s: string, v?: Record<string, string | number>) =>
    s.replace(/\{(\w+)\}/g, (m, n) => (v && n in v ? String(v[n]) : m));
  return { t: (k: string, v?: Record<string, string | number>) => interp(d[k] ?? k, v) };
}

const card = (id: string, rank: Card["rank"], suit: Card["suit"]): Card => ({ id, rank, suit, isWild: false });

const book: Meld = {
  id: "m1",
  type: "book",
  ownerId: "p1",
  cards: [card("c1", "6", "clubs"), card("c2", "6", "hearts"), card("c3", "6", "diamonds")],
};

describe("meldLabel", () => {
  it("names the meld type and every card, in English", () => {
    const { t } = translator(en as Record<string, string>);
    expect(meldLabel(book, t, "en")).toBe("Book: 6 of clubs, 6 of hearts, and 6 of diamonds");
  });

  it("resolves with no raw keys or unfilled placeholders in every checked locale", () => {
    for (const [dict, locale] of [
      [en, "en"],
      [ja, "ja"],
      [ru, "ru"],
    ] as const) {
      const { t } = translator(dict as Record<string, string>);
      const label = meldLabel(book, t, locale);
      expect(label).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(label).not.toMatch(/^game\./);
    }
  });

  it("labels a run the same way", () => {
    const run: Meld = {
      id: "m2",
      type: "run",
      ownerId: "p1",
      cards: [card("c1", "4", "spades"), card("c2", "5", "spades"), card("c3", "6", "spades")],
    };
    const { t } = translator(en as Record<string, string>);
    expect(meldLabel(run, t, "en")).toBe("Run: 4 of spades, 5 of spades, and 6 of spades");
  });
});
