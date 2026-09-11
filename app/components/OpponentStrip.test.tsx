// @vitest-environment jsdom

// The avatar bug this covers: a human display name can start with an
// emoji (nothing on the Account page stops that), and `name.charAt(0)` —
// the old avatar logic — isn't safe for that: most emoji are a UTF-16
// surrogate pair, so charAt(0) grabs only its leading half, an invalid
// lone surrogate that renders as a mangled glyph instead of the emoji.
// These tests exercise the fix by rendering real chips, not the internal
// helper directly (it isn't exported).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Player } from "@/types";
import { OpponentStrip } from "./OpponentStrip";

afterEach(cleanup);

function player(overrides: Partial<Player>): Player {
  return {
    id: "p1",
    name: "Nick",
    isAI: false,
    hand: [],
    hasMeldedContract: false,
    cumulativeScore: 0,
    ...overrides,
  };
}

function renderStrip(players: Player[]) {
  return render(
    <OpponentStrip
      players={players}
      currentPlayerIndex={0}
      discardHistory={[]}
      pickupHistory={[]}
      aiStatus={null}
      aiThinking={false}
    />
  );
}

describe("OpponentStrip avatar", () => {
  it("shows the emoji itself when a human name starts with one", () => {
    const { container } = renderStrip([player({ name: "😎 Nick" })]);
    // The avatar span is the emoji-styled one (no circle background) —
    // distinguished from the circled-initial span by its class.
    const avatarSpan = container.querySelector('[aria-hidden="true"]');
    expect(avatarSpan?.textContent).toBe("😎");
    expect(avatarSpan?.className).not.toContain("rounded-full");
    // The active player's name label drops the emoji too, so it isn't
    // shown twice on the same chip.
    expect(container.textContent).toContain("Nick");
    expect(container.textContent?.match(/😎/g)?.length).toBe(1);
  });

  it("falls back to a circled first-letter initial when there's no emoji", () => {
    const { container } = renderStrip([player({ name: "Nick" })]);
    const avatarSpan = container.querySelector('[aria-hidden="true"]');
    expect(avatarSpan?.textContent).toBe("N");
    expect(avatarSpan?.className).toContain("rounded-full");
  });

  it("handles a flag emoji (a Regional Indicator pair, not a single codepoint)", () => {
    const flag = String.fromCodePoint(0x1f1fa, 0x1f1f8); // 🇺🇸
    const { container } = renderStrip([player({ name: `${flag} Nick` })]);
    const avatarSpan = container.querySelector('[aria-hidden="true"]');
    expect(avatarSpan?.textContent).toBe(flag);
  });

  it("still gives an AI seat its usual emoji avatar, untouched by this fix", () => {
    const { container } = renderStrip([player({ id: "ai-1", name: "🦉 Hedda", isAI: true })]);
    const avatarSpan = container.querySelector('[aria-hidden="true"]');
    expect(avatarSpan?.textContent).toBe("🦉");
  });
});
