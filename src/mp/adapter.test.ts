import { describe, expect, it } from "vitest";
import { makeGameState, makeHand, makePlayer } from "../testHelpers";
import { CONTRACTS } from "../types";
import {
  advanceThroughAi,
  applyCommit,
  applyDraw,
  applyResign,
  dealGame,
  publicColumns,
  redactFor,
  RESIGN_PENALTY,
} from "./adapter";
import { MpConfig, MpEngine } from "./types";

function humanConfig(n: number): MpConfig {
  return {
    contractRounds: [1, 2, 3, 4, 5, 6, 7],
    seats: Array.from({ length: n }, (_, i) => ({
      seat: i,
      kind: "human" as const,
      userId: `user-${i}`,
      name: `Player ${i}`,
    })),
  };
}

describe("dealGame", () => {
  it("deals 13-card hands to every seat and starts on seat 0", () => {
    const eng = dealGame(humanConfig(3));
    expect(eng.state.players).toHaveLength(3);
    for (const p of eng.state.players) expect(p.hand).toHaveLength(13);
    expect(eng.state.currentPlayerIndex).toBe(0);
    expect(eng.turnDrawn).toBe(false);
    expect(eng.state.discardPile).toHaveLength(1);
  });

  it("rejects non-contiguous seats", () => {
    expect(() =>
      dealGame({
        contractRounds: [1],
        seats: [
          { seat: 0, kind: "human", userId: "a", name: "A" },
          { seat: 2, kind: "human", userId: "b", name: "B" },
        ],
      })
    ).toThrow();
  });

  it("auto-plays an AI in seat 0 so the first turn belongs to a human", () => {
    const config: MpConfig = {
      contractRounds: [1, 2, 3],
      seats: [
        { seat: 0, kind: "ai", difficulty: "beginner", name: "Bot" },
        { seat: 1, kind: "human", userId: "u1", name: "Human" },
      ],
    };
    const eng = dealGame(config);
    expect(eng.state.currentPlayerIndex).toBe(1);
    expect(eng.state.players[1].isAI).toBe(false);
  });
});

describe("redactFor", () => {
  it("shows the viewer their own hand and nobody else's", () => {
    const seat0 = makeHand([["3", "spades"], ["4", "spades"], ["5", "spades"]]);
    const seat1 = makeHand([["7", "hearts"], ["7", "diamonds"], ["7", "clubs"]]);
    const seat2 = makeHand([["K", "clubs"], ["Q", "clubs"], ["J", "clubs"]]);
    const drawPile = makeHand([["A", "hearts"], ["A", "spades"]]);
    const eng: MpEngine = {
      state: makeGameState({
        players: [
          makePlayer({ id: "seat-0", hand: seat0 }),
          makePlayer({ id: "seat-1", hand: seat1 }),
          makePlayer({ id: "seat-2", hand: seat2 }),
        ],
        drawPile,
      }),
      turnDrawn: false,
      resignedSeats: [],
      roundResults: [],
    };
    const view = redactFor(eng, humanConfig(3), 1);
    const json = JSON.stringify(view);

    expect(view.yourHand.map((c) => c.id)).toEqual(seat1.map((c) => c.id));
    for (const c of [...seat0, ...seat2, ...drawPile]) {
      expect(json).not.toContain(c.id);
    }
    expect(view.players.map((p) => p.handCount)).toEqual([3, 3, 3]);
    expect(view.drawPileCount).toBe(2);
  });

  it("marks yourTurn only for the active, non-resigned seat", () => {
    const eng = dealGame(humanConfig(3));
    expect(redactFor(eng, humanConfig(3), 0).yourTurn).toBe(true);
    expect(redactFor(eng, humanConfig(3), 1).yourTurn).toBe(false);
  });
});

describe("applyDraw", () => {
  it("adds a card to the drawing seat's hand and blocks a second draw", () => {
    const config = humanConfig(2);
    const eng0 = dealGame(config);
    const before = eng0.state.players[0].hand.length;

    const r1 = applyDraw(eng0, 0, "stock");
    expect(r1.error).toBeUndefined();
    expect(r1.card).not.toBeNull();
    expect(r1.engine.state.players[0].hand).toHaveLength(before + 1);
    expect(r1.engine.turnDrawn).toBe(true);

    const r2 = applyDraw(r1.engine, 0, "stock");
    expect(r2.error).toMatch(/already drawn/);
    expect(r2.engine).toBe(r1.engine);
  });

  it("rejects a draw from the wrong seat", () => {
    const eng = dealGame(humanConfig(2));
    const r = applyDraw(eng, 1, "stock");
    expect(r.error).toMatch(/isn't your turn/);
  });
});

describe("applyCommit", () => {
  function meldableEngine() {
    const hand = makeHand([
      ["7", "hearts"],
      ["7", "diamonds"],
      ["7", "clubs"],
      ["9", "hearts"],
      ["9", "diamonds"],
      ["9", "clubs"],
      ["K", "spades"], // discard
      ["4", "hearts"], // leftover — keeps the hand non-empty so the round doesn't end
    ]);
    const eng: MpEngine = {
      state: makeGameState({
        selectedContracts: CONTRACTS,
        round: 1, // 2 Books
        players: [
          makePlayer({ id: "seat-0", hand }),
          makePlayer({ id: "seat-1", hand: makeHand([["3", "spades"]]) }),
        ],
        drawPile: makeHand([["A", "hearts"]]),
      }),
      turnDrawn: true,
      resignedSeats: [],
      roundResults: [],
    };
    return { eng, hand };
  }

  it("requires a draw first", () => {
    const { eng, hand } = meldableEngine();
    eng.turnDrawn = false;
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [],
      discardCardId: hand[6].id,
    });
    expect(r.error).toMatch(/draw a card first/);
  });

  it("lays the contract and discards, advancing to the next human", () => {
    const { eng, hand } = meldableEngine();
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [
        [hand[0].id, hand[1].id, hand[2].id],
        [hand[3].id, hand[4].id, hand[5].id],
      ],
      discardCardId: hand[6].id,
    });
    expect(r.error).toBeUndefined();
    expect(r.engine.state.players[0].hasMeldedContract).toBe(true);
    expect(r.engine.state.melds).toHaveLength(2);
    expect(r.engine.state.players[0].hand.map((c) => c.id)).toEqual([hand[7].id]);
    expect(r.engine.state.currentPlayerIndex).toBe(1);
    expect(r.engine.turnDrawn).toBe(false);
    expect(r.engine.state.discardPile.at(-1)!.id).toBe(hand[6].id);
  });

  it("rejects an invalid meld without changing state", () => {
    const { eng, hand } = meldableEngine();
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [[hand[0].id, hand[1].id]], // only 2 of a book, and only 1 book
      discardCardId: hand[6].id,
    });
    expect(r.error).toMatch(/contract/);
    expect(r.engine).toBe(eng);
    expect(eng.state.players[0].hasMeldedContract).toBe(false);
  });

  it("rejects a discard of a card not in hand", () => {
    const { eng } = meldableEngine();
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [],
      discardCardId: "not-a-real-card",
    });
    expect(r.error).toMatch(/isn't in your hand/);
    expect(r.engine).toBe(eng);
  });

  it("is all-or-nothing when a lay-off in the batch fails", () => {
    const { eng, hand } = meldableEngine();
    // meld first so lay-offs are allowed, then a bogus lay-off
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [
        [hand[0].id, hand[1].id, hand[2].id],
        [hand[3].id, hand[4].id, hand[5].id],
      ],
      layoffs: [{ cardId: hand[6].id, meldId: "no-such-meld" }],
      discardCardId: hand[6].id,
    });
    expect(r.error).toMatch(/lay-off/);
    expect(r.engine).toBe(eng);
    expect(eng.state.melds).toHaveLength(0);
  });

  // mp/index.ts's achievement-counter crediting reads these two fields
  // instead of diffing the returned engine's own state — advanceThroughAi
  // (bundled into the same return) can redeal a whole new round on top of
  // exactly what these need to see, the instant this commit ends the
  // current one. See applyCommit's own doc for why.
  it("reports the melds actually laid via meldedThisCommit, distinct from state.melds after a round transition", () => {
    const { eng, hand } = meldableEngine();
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [
        [hand[0].id, hand[1].id, hand[2].id],
        [hand[3].id, hand[4].id, hand[5].id],
      ],
      discardCardId: hand[6].id,
    });
    expect(r.error).toBeUndefined();
    expect(r.meldedThisCommit).toHaveLength(2);
    expect(r.meldedThisCommit?.every((m) => m.type === "book")).toBe(true);
    expect(r.wentOutThisCommit).toBe(false); // one leftover card, round continues
  });

  it("reports wentOutThisCommit true when melding down to an empty hand ends the round", () => {
    // Exactly 2 books, no leftover — melding the whole hand ends the round
    // immediately (gameEngine.ts's own "hasMeldedContract && hand empty"
    // rule), same as GameContext.tsx's finishIfWentOut for solo play.
    const hand = makeHand([
      ["7", "hearts"], ["7", "diamonds"], ["7", "clubs"],
      ["9", "hearts"], ["9", "diamonds"], ["9", "clubs"],
    ]);
    const eng: MpEngine = {
      state: makeGameState({
        selectedContracts: CONTRACTS,
        round: 1,
        players: [
          makePlayer({ id: "seat-0", hand }),
          makePlayer({ id: "seat-1", hand: makeHand([["3", "spades"]]) }),
        ],
      }),
      turnDrawn: true,
      resignedSeats: [],
      roundResults: [],
    };
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [
        [hand[0].id, hand[1].id, hand[2].id],
        [hand[3].id, hand[4].id, hand[5].id],
      ],
    });
    expect(r.error).toBeUndefined();
    expect(r.wentOutThisCommit).toBe(true);
    expect(r.meldedThisCommit).toHaveLength(2);
    // The round-ending redeal already happened inside advanceThroughAi —
    // exactly the state a naive post-hoc diff would misread as "no melds,
    // no round win," which is what meldedThisCommit/wentOutThisCommit exist
    // to avoid depending on.
    expect(r.engine.state.round).toBe(2);
  });
});

describe("two-human turn hand-off", () => {
  it("does not auto-play the next human's turn", () => {
    const config = humanConfig(2);
    let eng = dealGame(config);
    const drawn = applyDraw(eng, 0, "stock");
    eng = drawn.engine;
    const discardId = eng.state.players[0].hand[0].id;
    const committed = applyCommit(eng, config, 0, { type: "commit", groups: [], discardCardId: discardId });
    expect(committed.error).toBeUndefined();
    expect(committed.engine.state.currentPlayerIndex).toBe(1);
    expect(committed.engine.state.players[1].hand.length).toBe(13); // untouched — B hasn't moved
  });
});

describe("all-AI game via advanceThroughAi", () => {
  it("plays a full 3-round game to completion", () => {
    const config: MpConfig = {
      contractRounds: [1, 2, 3],
      seats: [
        { seat: 0, kind: "ai", difficulty: "easy", name: "A" },
        { seat: 1, kind: "ai", difficulty: "easy", name: "B" },
        { seat: 2, kind: "ai", difficulty: "easy", name: "C" },
      ],
    };
    const eng = dealGame(config);
    expect(eng.state.gameOver).toBe(true);
    expect(eng.state.winnerId).toMatch(/^seat-\d$/);
    expect(eng.roundResults).toHaveLength(3);
    const cols = publicColumns(eng, config);
    expect(cols.status).toBe("complete");
    expect(cols.winner_user_id).toBeNull(); // all AI
  });
});

describe("applyResign", () => {
  it("finalizes the game when fewer than two humans remain", () => {
    const config = humanConfig(2);
    const eng = dealGame(config);
    const after = applyResign(eng, config, 1);
    expect(after.state.gameOver).toBe(true);
    expect(after.state.players[1].cumulativeScore).toBeGreaterThanOrEqual(RESIGN_PENALTY);
    expect(after.resignedSeats).toContain(1);
  });

  it("keeps going with 2+ humans left, skipping the resigned seat's turns", () => {
    const config = humanConfig(3);
    let eng = dealGame(config); // seat 0's turn
    eng = applyResign(eng, config, 1); // seat 1 resigns; still seat 0's turn
    expect(eng.state.gameOver).toBe(false);
    expect(eng.state.currentPlayerIndex).toBe(0);

    // seat 0 plays; turn should skip resigned seat 1 and land on seat 2
    const drawn = applyDraw(eng, 0, "stock");
    const discardId = drawn.engine.state.players[0].hand[0].id;
    const committed = applyCommit(drawn.engine, config, 0, {
      type: "commit",
      groups: [],
      discardCardId: discardId,
    });
    expect(committed.engine.state.currentPlayerIndex).toBe(2);
  });
});

describe("publicColumns", () => {
  it("exposes hand counts and whose turn, never any card", () => {
    const config = humanConfig(3);
    const eng = dealGame(config);
    const cols = publicColumns(eng, config);
    expect(cols.turn_seat).toBe(0);
    expect(cols.turn_user_id).toBe("user-0");
    expect(cols.hand_counts).toEqual({ 0: 13, 1: 13, 2: 13 });
    expect(JSON.stringify(cols)).not.toMatch(/"suit"/);
  });
});

describe("applyCommit — the reported 'couldn't meld' hand", () => {
  // Round 1 "2 Books": Book 1 = J,J,J and Book 2 = 8,8 + a wild 2, with
  // leftovers to discard. Everything the client stages must round-trip
  // through JSON (as the real Edge Function request does) and commit.
  function reportedEngine() {
    const hand = makeHand([
      ["J", "hearts"], ["J", "spades"], ["J", "clubs"],
      ["8", "hearts"], ["8", "diamonds"], ["2", "spades"],
      ["K", "spades"], ["4", "hearts"], ["6", "clubs"],
    ]);
    const eng: MpEngine = {
      state: makeGameState({
        selectedContracts: CONTRACTS,
        round: 1,
        players: [
          makePlayer({ id: "seat-0", hand }),
          makePlayer({ id: "seat-1", hand: makeHand([["3", "spades"]]) }),
        ],
        drawPile: makeHand([["A", "hearts"]]),
      }),
      turnDrawn: true,
      resignedSeats: [],
      roundResults: [],
    };
    return { eng, hand };
  }

  it("commits J,J,J + 8,8,wild-2 with a discard", () => {
    const { eng, hand } = reportedEngine();
    const payload = JSON.parse(
      JSON.stringify({
        type: "commit",
        groups: [[hand[0].id, hand[1].id, hand[2].id], [hand[3].id, hand[4].id, hand[5].id]],
        preferredRunStarts: [undefined, undefined], // serialises to [null, null]
        discardCardId: hand[6].id,
      })
    );
    const r = applyCommit(eng, humanConfig(2), 0, payload);
    expect(r.error).toBeUndefined();
    expect(r.engine.state.players[0].hasMeldedContract).toBe(true);
    expect(r.engine.state.currentPlayerIndex).toBe(1);
  });

  it("refuses to commit the melds without a discard (the step players miss)", () => {
    const { eng, hand } = reportedEngine();
    const r = applyCommit(eng, humanConfig(2), 0, {
      type: "commit",
      groups: [[hand[0].id, hand[1].id, hand[2].id], [hand[3].id, hand[4].id, hand[5].id]],
    });
    expect(r.error).toMatch(/discard/);
    expect(r.engine).toBe(eng);
  });

  it("tolerates JSON-null preferredRunStarts on an ambiguous run (client sends undefined -> null)", () => {
    const hand = makeHand([
      ["3", "hearts"], ["4", "hearts"], ["5", "hearts"], ["2", "clubs"],
      ["9", "hearts"], ["9", "spades"], ["9", "clubs"],
      ["K", "spades"], ["4", "clubs"],
    ]);
    const eng: MpEngine = {
      state: makeGameState({
        selectedContracts: CONTRACTS,
        round: 2, // 1 Book + 1 Run
        players: [
          makePlayer({ id: "seat-0", hand }),
          makePlayer({ id: "seat-1", hand: makeHand([["3", "spades"]]) }),
        ],
        drawPile: makeHand([["A", "hearts"]]),
      }),
      turnDrawn: true,
      resignedSeats: [],
      roundResults: [],
    };
    // 3-4-5 + wild is ambiguous (2-3-4-5 vs 3-4-5-6); the player picked start 1 (3 is index 1).
    const r = applyCommit(
      eng,
      humanConfig(2),
      0,
      JSON.parse(
        JSON.stringify({
          type: "commit",
          groups: [[hand[4].id, hand[5].id, hand[6].id], [hand[0].id, hand[1].id, hand[2].id, hand[3].id]],
          preferredRunStarts: [undefined, 1],
          discardCardId: hand[7].id,
        })
      )
    );
    expect(r.error).toBeUndefined();
  });
});
