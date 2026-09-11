// @vitest-environment jsdom

// CardFace is the one component all six card-face styles funnel through —
// an explicit `style` prop must always win (the Settings picker relies on
// this to preview every option regardless of which one is active), the
// live store default must be `classic` (brought back as the default after
// a "make the icons bigger, I can't see them" request), and every style
// must render every card shape (number, court, joker) without throwing.

import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { Card } from "@/types";
import { CardFace } from "./CardFace";
import { CARD_FACES, saveLocalCardFace } from "../lib/cardFaceStore";

const NUMBER_CARD: Card = { id: "c1", suit: "hearts", rank: "7", isWild: false };
const COURT_CARD: Card = { id: "c2", suit: "spades", rank: "K", isWild: false };
const JOKER_CARD: Card = { id: "c3", suit: "joker", rank: "JOKER", isWild: true };

afterEach(() => {
  window.localStorage.clear();
});

describe("CardFace", () => {
  it("defaults to the classic style when nothing is stored", () => {
    const { container } = render(<CardFace card={NUMBER_CARD} />);
    // classic draws exactly one rank <text> (no corner indices) — realistic
    // would draw two (top-left + bottom-right).
    expect(container.querySelectorAll("text")).toHaveLength(1);
  });

  it("an explicit style prop overrides whatever is stored", () => {
    saveLocalCardFace("realistic");
    const { container } = render(<CardFace card={NUMBER_CARD} style="classic" />);
    expect(container.querySelectorAll("text")).toHaveLength(1);
  });

  it.each(CARD_FACES.map((f) => f.id))("renders every card shape without throwing — style: %s", (style) => {
    for (const card of [NUMBER_CARD, COURT_CARD, JOKER_CARD]) {
      expect(() => render(<CardFace card={card} style={style} />)).not.toThrow();
    }
  });
});
