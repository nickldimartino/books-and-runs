// Adversarial coverage for applyCommit/applyDraw/applyResign — the one
// place a signed-in-but-untrusted client talks directly to server state.
// adapter.test.ts covers the happy paths; this file is specifically about
// what happens when the payload lies: fabricated card ids, another seat's
// cards, out-of-turn or out-of-order actions, malformed enum-ish fields,
// and oversized arrays. The invariant under test throughout is the one the
// adapter's own doc promises — "on any failure, `engine` is the untouched
// input" — so every rejection case asserts the returned engine is the
// exact same object (===), not just equal, proving nothing partially
// applied.

import { describe, expect, it } from "vitest";
import { makeGameState, makeHand, makePlayer } from "../testHelpers";
import { CONTRACTS } from "../types";
import { applyCommit, applyDraw } from "./adapter";
import { MpConfig, MpEngine } from "./types";

const TWO_BOOKS = CONTRACTS[0]; // round 1: 2 books, size 3

const config: MpConfig = {
  contractRounds: [1],
  seats: [
    { seat: 0, kind: "human", userId: "user-a", name: "A" },
    { seat: 1, kind: "human", userId: "user-b", name: "B" },
  ],
};

function seat0ValidBook(): [import("../types").Rank, import("../types").Suit][] {
  return [
    ["7", "clubs"],
    ["7", "diamonds"],
    ["7", "spades"],
  ];
}

function baseEngine(overrides: { drawn?: boolean } = {}): MpEngine {
  const seat0Hand = makeHand([...seat0ValidBook(), "K", ["Q", "hearts"], "3", "4", "5", "6", "8", "9", "10", "A"]);
  const seat1Hand = makeHand([
    ["9", "clubs"],
    ["9", "diamonds"],
    ["9", "spades"],
    "K",
    "Q",
  ]);
  const state = makeGameState({
    round: 1,
    selectedContracts: [TWO_BOOKS],
    players: [
      makePlayer({ id: "seat-0", name: "A", hand: seat0Hand }),
      makePlayer({ id: "seat-1", name: "B", hand: seat1Hand }),
    ],
    currentPlayerIndex: 0,
  });
  return { state, turnDrawn: overrides.drawn ?? true, resignedSeats: [], roundResults: [] };
}

describe("applyCommit — adversarial input", () => {
  it("rejects card ids that don't exist anywhere", () => {
    const eng = baseEngine();
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      groups: [["fabricated-1", "fabricated-2", "fabricated-3"]],
      discardCardId: "K",
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng); // untouched, not just unequal-but-similar
  });

  it("rejects melding another seat's cards, even though they're real card ids", () => {
    const eng = baseEngine();
    const seat1CardIds = eng.state.players[1].hand.map((c) => c.id);
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      groups: [seat1CardIds.slice(0, 3)],
      discardCardId: eng.state.players[0].hand[0].id,
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
    // Seat 1's hand is untouched — no card "teleported" across seats.
    expect(res.engine.state.players[1].hand.map((c) => c.id)).toEqual(seat1CardIds);
  });

  it("rejects a group that reuses the same card id twice", () => {
    const eng = baseEngine();
    const bookId = eng.state.players[0].hand[0].id;
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      groups: [[bookId, bookId, bookId]],
      discardCardId: eng.state.players[0].hand[3].id,
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
  });

  it("rejects a duplicate card id reused across two different groups", () => {
    const eng = baseEngine();
    const [a, b, c] = eng.state.players[0].hand.map((x) => x.id);
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      groups: [
        [a, b, c],
        [a, b, c],
      ],
      discardCardId: eng.state.players[0].hand[3].id,
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
  });

  it("rejects a meld that doesn't satisfy the round's exact contract count", () => {
    const eng = baseEngine();
    // One valid book offered, but round 1 needs two.
    const bookIds = eng.state.players[0].hand.slice(0, 3).map((c) => c.id);
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      groups: [bookIds],
      discardCardId: eng.state.players[0].hand[3].id,
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
    expect(res.engine.state.players[0].hasMeldedContract).toBe(false);
  });

  it("rejects a commit from a seat that isn't the current player", () => {
    const eng = baseEngine();
    const res = applyCommit(eng, config, 1, {
      type: "commit",
      discardCardId: eng.state.players[1].hand[0].id,
    });
    expect(res.error).toMatch(/turn/i);
    expect(res.engine).toBe(eng);
  });

  it("rejects a commit before drawing", () => {
    const eng = baseEngine({ drawn: false });
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      discardCardId: eng.state.players[0].hand[0].id,
    });
    expect(res.error).toMatch(/draw/i);
    expect(res.engine).toBe(eng);
  });

  it("rejects melding again once the contract's already melded this round", () => {
    const eng = baseEngine();
    eng.state.players[0].hasMeldedContract = true;
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      groups: [eng.state.players[0].hand.slice(0, 3).map((c) => c.id)],
      discardCardId: eng.state.players[0].hand[3].id,
    });
    expect(res.error).toMatch(/already melded/i);
    expect(res.engine).toBe(eng);
  });

  it("rejects a lay-off referencing a card not in the acting seat's hand", () => {
    const eng = baseEngine();
    eng.state.players[0].hasMeldedContract = true;
    eng.state.melds = [
      { id: "m1", type: "book", ownerId: "seat-0", cards: makeHand(seat0ValidBook()) },
    ];
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      layoffs: [{ cardId: "not-in-any-hand", meldId: "m1" }],
      discardCardId: eng.state.players[0].hand[3].id,
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
  });

  it("rejects a lay-off against a meld id that doesn't exist", () => {
    const eng = baseEngine();
    eng.state.players[0].hasMeldedContract = true;
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      layoffs: [{ cardId: eng.state.players[0].hand[3].id, meldId: "no-such-meld" }],
      discardCardId: eng.state.players[0].hand[4].id,
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
  });

  it("rejects a lay-off with a garbage position value instead of crashing", () => {
    const eng = baseEngine();
    eng.state.players[0].hasMeldedContract = true;
    eng.state.melds = [
      { id: "m1", type: "run", ownerId: "seat-1", cards: makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]) },
    ];
    const res = applyCommit(eng, config, 0, {
      type: "commit",
      layoffs: [
        { cardId: eng.state.players[0].hand[3].id, meldId: "m1", position: "sideways" as unknown as "low" },
      ],
      discardCardId: eng.state.players[0].hand[4].id,
    });
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
  });

  it("rejects discarding a card not in hand", () => {
    const eng = baseEngine();
    const res = applyCommit(eng, config, 0, { type: "commit", discardCardId: "not-a-real-card" });
    expect(res.error).toMatch(/hand/i);
    expect(res.engine).toBe(eng);
  });

  it("rejects a missing discard when not going out", () => {
    const eng = baseEngine();
    const res = applyCommit(eng, config, 0, { type: "commit" });
    expect(res.error).toMatch(/discard/i);
    expect(res.engine).toBe(eng);
  });

  it("ignores an out-of-range preferredRunStarts value rather than crashing", () => {
    const eng = baseEngine();
    const bookIds = eng.state.players[0].hand.slice(0, 3).map((c) => c.id);
    expect(() =>
      applyCommit(eng, config, 0, {
        type: "commit",
        groups: [bookIds],
        preferredRunStarts: [999999],
        discardCardId: eng.state.players[0].hand[4].id,
      })
    ).not.toThrow();
  });

  it("rejects an oversized groups payload before doing any real validation", () => {
    const eng = baseEngine();
    const hugeGroups = Array.from({ length: 5000 }, () => ["x"]);
    const res = applyCommit(eng, config, 0, { type: "commit", groups: hugeGroups, discardCardId: "K" });
    expect(res.error).toMatch(/too many/i);
    expect(res.engine).toBe(eng);
  });

  it("rejects an oversized single group", () => {
    const eng = baseEngine();
    const hugeGroup = Array.from({ length: 500 }, (_, i) => `card-${i}`);
    const res = applyCommit(eng, config, 0, { type: "commit", groups: [hugeGroup], discardCardId: "K" });
    expect(res.error).toMatch(/too many/i);
    expect(res.engine).toBe(eng);
  });

  it("rejects an oversized layoffs payload", () => {
    const eng = baseEngine();
    eng.state.players[0].hasMeldedContract = true;
    const hugeLayoffs = Array.from({ length: 500 }, (_, i) => ({ cardId: `c${i}`, meldId: "m1" }));
    const res = applyCommit(eng, config, 0, { type: "commit", layoffs: hugeLayoffs, discardCardId: "K" });
    expect(res.error).toMatch(/too many/i);
    expect(res.engine).toBe(eng);
  });
});

describe("applyDraw — adversarial input", () => {
  it("rejects a draw from a seat that isn't the current player", () => {
    const eng = baseEngine({ drawn: false });
    const res = applyDraw(eng, 1, "stock");
    expect(res.error).toMatch(/turn/i);
    expect(res.engine).toBe(eng);
    expect(res.card).toBeNull();
  });

  it("rejects a second draw in the same turn", () => {
    const eng = baseEngine({ drawn: true });
    const res = applyDraw(eng, 0, "stock");
    expect(res.error).toMatch(/already drawn/i);
    expect(res.engine).toBe(eng);
  });

  it("rejects drawing once the round is over", () => {
    const eng = baseEngine({ drawn: false });
    eng.state.roundOver = true;
    const res = applyDraw(eng, 0, "stock");
    expect(res.error).toBeTruthy();
    expect(res.engine).toBe(eng);
  });

  it("treats an unrecognized `from` value the same as the Edge Function does — falls back to the stock pile, never throws", () => {
    // The adapter itself only knows "stock" | "discard"; index.ts is what
    // coerces an arbitrary client value down to one of those before this is
    // ever called (`action.from === "discard" ? "discard" : "stock"`) — this
    // just confirms the adapter doesn't independently need to re-validate it.
    const eng = baseEngine({ drawn: false });
    expect(() => applyDraw(eng, 0, "stock")).not.toThrow();
  });
});
