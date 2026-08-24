import { describe, expect, it } from "vitest";
import {
  attemptMeldContract,
  buyDiscard,
  createGame,
  discardAndAdvance,
  drawFromDiscard,
  drawFromPile,
  eligibleBuyers,
  layOffCard,
  meldChosenGroups,
  startNextRound,
} from "./gameEngine";
import { CONTRACTS, GameState, Meld, SHORT_GAME_CONTRACTS } from "./types";
import { makeCard, makeGameState, makeHand, makePlayer } from "./testHelpers";

describe("createGame", () => {
  it("scales deck count to player count and deals 13 cards each", () => {
    const state = createGame([
      { id: "p1", name: "A", isAI: false },
      { id: "p2", name: "B", isAI: false },
      { id: "p3", name: "C", isAI: true, difficulty: "medium" },
    ]);
    // ceil(3/2) = 2 decks -> 108 cards total
    const totalCards =
      state.players.reduce((sum, p) => sum + p.hand.length, 0) +
      state.drawPile.length +
      state.discardPile.length;
    expect(totalCards).toBe(108);
    expect(state.players.every((p) => p.hand.length === 13)).toBe(true);
    expect(state.round).toBe(1);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.melds).toHaveLength(0);
    expect(state.selectedContracts).toBe(CONTRACTS);
  });

  it("uses 2 decks even for just 2 players, not 1 — a single deck runs out of specific ranks too easily", () => {
    const state = createGame([
      { id: "p1", name: "A", isAI: false },
      { id: "p2", name: "B", isAI: false },
    ]);
    const totalCards =
      state.players.reduce((sum, p) => sum + p.hand.length, 0) +
      state.drawPile.length +
      state.discardPile.length;
    expect(totalCards).toBe(108); // 2 decks, not ceil(2/2) = 1
  });

  it("uses a custom contract list when one is given, instead of the full 7 rounds", () => {
    const state = createGame(
      [
        { id: "p1", name: "A", isAI: false },
        { id: "p2", name: "B", isAI: false },
      ],
      SHORT_GAME_CONTRACTS
    );
    expect(state.selectedContracts).toBe(SHORT_GAME_CONTRACTS);
    expect(state.selectedContracts).toHaveLength(5);
  });
});

describe("drawFromPile", () => {
  it("moves the top card from the draw pile into the current player's hand", () => {
    const drawCard = makeCard("7", "hearts");
    const state = makeGameState({
      players: [makePlayer({ id: "p1", hand: [] })],
      drawPile: [drawCard],
    });
    const drawn = drawFromPile(state);
    expect(drawn).toBe(drawCard);
    expect(state.players[0].hand).toContain(drawCard);
    expect(state.drawPile).toHaveLength(0);
  });

  it("reshuffles the discard pile (minus its top card) into the draw pile when empty", () => {
    const bottom = makeCard("3", "clubs", { id: "bottom" });
    const middle = makeCard("4", "clubs", { id: "middle" });
    const top = makeCard("5", "clubs", { id: "top" }); // last element = top of pile
    const state = makeGameState({
      players: [makePlayer({ id: "p1", hand: [] })],
      drawPile: [],
      discardPile: [bottom, middle, top],
    });

    const drawn = drawFromPile(state);
    if (!drawn) throw new Error("expected a card, not a pile-exhaustion round end");

    // the old top card becomes the sole new discard pile card
    expect(state.discardPile).toEqual([top]);
    // the drawn card came from the reshuffled remainder, and the other one is left in drawPile
    expect([bottom.id, middle.id]).toContain(drawn.id);
    expect(state.drawPile).toHaveLength(1);
    expect(state.players[0].hand).toHaveLength(1);
  });

  it("ends the round instead of drawing when both piles are truly exhausted", () => {
    const p1 = makePlayer({ id: "p1", hand: makeHand(["3", "5"]), cumulativeScore: 10 });
    const p2 = makePlayer({ id: "p2", hand: makeHand(["7"]), cumulativeScore: 20 });
    const state = makeGameState({
      players: [p1, p2],
      currentPlayerIndex: 0,
      drawPile: [],
      discardPile: [makeCard("9", "clubs")], // only the top card — nothing to reshuffle
    });

    const drawn = drawFromPile(state);

    expect(drawn).toBeNull();
    expect(state.roundOver).toBe(true);
    // No winner exemption — nobody actually went out, so every player
    // (including whoever's turn it was) scores their hand as-is.
    expect(state.players[0].cumulativeScore).toBe(20); // 10 + (5+5)
    expect(state.players[1].cumulativeScore).toBe(25); // 20 + 5
  });
});

describe("drawFromDiscard", () => {
  it("moves the top discard card into the current player's hand and records a pickup", () => {
    const top = makeCard("9", "spades");
    const state = makeGameState({
      players: [makePlayer({ id: "p1", hand: [] })],
      discardPile: [top],
    });
    const drawn = drawFromDiscard(state);
    expect(drawn).toBe(top);
    expect(state.players[0].hand).toContain(top);
    expect(state.discardPile).toHaveLength(0);
    expect(state.pickupHistory).toEqual([{ playerId: "p1", card: top }]);
  });

  it("returns null without mutating state when the discard pile is empty", () => {
    const state = makeGameState({ players: [makePlayer({ id: "p1", hand: [] })], discardPile: [] });
    expect(drawFromDiscard(state)).toBeNull();
    expect(state.players[0].hand).toHaveLength(0);
  });
});

describe("attemptMeldContract", () => {
  it("melds the round's contract and leaves only leftover cards in hand", () => {
    const bookCards = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]);
    const otherBookCards = makeHand([
      ["9", "hearts"],
      ["9", "clubs"],
      ["9", "spades"],
    ]);
    const leftover = makeCard("K", "diamonds");
    const state = makeGameState({
      round: 1, // 2 Books
      players: [makePlayer({ id: "p1", hand: [...bookCards, ...otherBookCards, leftover] })],
    });

    const melds = attemptMeldContract(state);

    expect(melds).toHaveLength(2);
    expect(state.players[0].hasMeldedContract).toBe(true);
    expect(state.players[0].hand).toEqual([leftover]);
    expect(state.melds).toHaveLength(2);
  });

  it("returns null and does not touch hand when the contract can't be met yet", () => {
    const hand = makeHand([
      ["5", "hearts"],
      ["9", "clubs"],
    ]);
    const state = makeGameState({ round: 1, players: [makePlayer({ id: "p1", hand })] });

    const melds = attemptMeldContract(state);

    expect(melds).toBeNull();
    expect(state.players[0].hasMeldedContract).toBe(false);
    expect(state.players[0].hand).toEqual(hand);
  });

  it("refuses to meld again once the player has already melded this round", () => {
    const state = makeGameState({
      round: 1,
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: makeHand(["5", "5", "5"]) })],
    });
    expect(attemptMeldContract(state)).toBeNull();
  });

  it("round 7 (wholeHandMeld): melds only once the entire hand fits into exactly 3 runs", () => {
    const runs = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    const state = makeGameState({ round: 7, players: [makePlayer({ id: "p1", hand: runs })] });

    const melds = attemptMeldContract(state);

    expect(melds).toHaveLength(3);
    expect(state.players[0].hasMeldedContract).toBe(true);
    expect(state.players[0].hand).toEqual([]);
  });

  it("round 7 (wholeHandMeld): refuses a meld that would strand cards in hand", () => {
    const runs = [
      ...makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]),
      ...makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]),
      ...makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]),
    ];
    const leftover = makeCard("K", "diamonds");
    const state = makeGameState({
      round: 7,
      players: [makePlayer({ id: "p1", hand: [...runs, leftover] })],
    });

    expect(attemptMeldContract(state)).toBeNull();
    expect(state.players[0].hasMeldedContract).toBe(false);
    expect(state.players[0].hand).toHaveLength(13);
  });
});

describe("meldChosenGroups", () => {
  it("melds exactly the player-chosen groups and leaves the rest in hand", () => {
    const fives = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]);
    const nines = makeHand([
      ["9", "hearts"],
      ["9", "clubs"],
      ["9", "spades"],
    ]);
    const leftover = makeCard("K", "diamonds");
    const state = makeGameState({
      round: 1, // 2 Books
      players: [makePlayer({ id: "p1", hand: [...fives, ...nines, leftover] })],
    });

    const melds = meldChosenGroups(state, [fives.map((c) => c.id), nines.map((c) => c.id)]);

    expect(melds).toHaveLength(2);
    expect(state.players[0].hasMeldedContract).toBe(true);
    expect(state.players[0].hand).toEqual([leftover]);
    expect(state.melds).toHaveLength(2);
  });

  it("rejects groups that don't match the round's required book/run counts", () => {
    // Round 1 needs 2 books, but only one group is offered.
    const fives = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]);
    const state = makeGameState({ round: 1, players: [makePlayer({ id: "p1", hand: fives })] });

    expect(meldChosenGroups(state, [fives.map((c) => c.id)])).toBeNull();
    expect(state.players[0].hasMeldedContract).toBe(false);
    expect(state.players[0].hand).toEqual(fives);
  });

  it("rejects a group that isn't actually a valid book or run", () => {
    const junk = makeHand([
      ["4", "hearts"],
      ["7", "clubs"],
      ["K", "spades"],
    ]);
    const otherBook = makeHand([
      ["9", "hearts"],
      ["9", "clubs"],
      ["9", "spades"],
    ]);
    const state = makeGameState({
      round: 1,
      players: [makePlayer({ id: "p1", hand: [...junk, ...otherBook] })],
    });

    const result = meldChosenGroups(state, [junk.map((c) => c.id), otherBook.map((c) => c.id)]);

    expect(result).toBeNull();
    expect(state.players[0].hasMeldedContract).toBe(false);
  });

  it("rejects a card id that doesn't belong to the player's hand", () => {
    const fives = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]);
    const state = makeGameState({ round: 1, players: [makePlayer({ id: "p1", hand: fives })] });

    expect(meldChosenGroups(state, [["not-a-real-card-id", fives[0].id, fives[1].id]])).toBeNull();
  });

  it("rejects the same card id used in two groups", () => {
    const fives = makeHand([
      ["5", "hearts"],
      ["5", "clubs"],
      ["5", "spades"],
    ]);
    const state = makeGameState({ round: 1, players: [makePlayer({ id: "p1", hand: fives })] });

    const result = meldChosenGroups(state, [
      [fives[0].id, fives[1].id, fives[2].id],
      [fives[0].id, fives[1].id, fives[2].id],
    ]);

    expect(result).toBeNull();
  });

  it("refuses to meld again once the player has already melded this round", () => {
    const state = makeGameState({
      round: 1,
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: makeHand(["5", "5", "5"]) })],
    });
    expect(meldChosenGroups(state, [state.players[0].hand.map((c) => c.id)])).toBeNull();
  });

  it("round 7 (wholeHandMeld): rejects 3 valid runs that leave a card ungrouped", () => {
    const run1 = makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]);
    const run2 = makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]);
    const run3 = makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]);
    const leftover = makeCard("K", "diamonds");
    const state = makeGameState({
      round: 7,
      players: [makePlayer({ id: "p1", hand: [...run1, ...run2, ...run3, leftover] })],
    });

    const result = meldChosenGroups(state, [
      run1.map((c) => c.id),
      run2.map((c) => c.id),
      run3.map((c) => c.id),
    ]);

    expect(result).toBeNull();
    expect(state.players[0].hasMeldedContract).toBe(false);
  });

  it("round 7 (wholeHandMeld): accepts 3 runs that use every card in hand", () => {
    const run1 = makeHand([["4", "hearts"], ["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]);
    const run2 = makeHand([["4", "clubs"], ["5", "clubs"], ["6", "clubs"], ["7", "clubs"]]);
    const run3 = makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]);
    const state = makeGameState({
      round: 7,
      players: [makePlayer({ id: "p1", hand: [...run1, ...run2, ...run3] })],
    });

    const result = meldChosenGroups(state, [
      run1.map((c) => c.id),
      run2.map((c) => c.id),
      run3.map((c) => c.id),
    ]);

    expect(result).toHaveLength(3);
    expect(state.players[0].hasMeldedContract).toBe(true);
    expect(state.players[0].hand).toEqual([]);
  });

  it("rejects an ambiguous run when no preferredRunStarts is given", () => {
    const three = makeCard("3", "hearts");
    const four = makeCard("4", "hearts");
    const five = makeCard("5", "hearts");
    const wild = makeCard("2", "clubs");
    const otherRun = makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]);
    const state = makeGameState({
      round: 3, // 2 Runs
      players: [makePlayer({ id: "p1", hand: [three, four, five, wild, ...otherRun] })],
    });

    const result = meldChosenGroups(state, [[three.id, four.id, five.id, wild.id], otherRun.map((c) => c.id)]);

    expect(result).toBeNull();
    expect(state.players[0].hasMeldedContract).toBe(false);
  });

  it("accepts the same ambiguous run once given the player's chosen runStartIndex", () => {
    const three = makeCard("3", "hearts");
    const four = makeCard("4", "hearts");
    const five = makeCard("5", "hearts");
    const wild = makeCard("2", "clubs");
    const otherRun = makeHand([["4", "spades"], ["5", "spades"], ["6", "spades"], ["7", "spades"]]);
    const state = makeGameState({
      round: 3,
      players: [makePlayer({ id: "p1", hand: [three, four, five, wild, ...otherRun] })],
    });

    const result = meldChosenGroups(
      state,
      [[three.id, four.id, five.id, wild.id], otherRun.map((c) => c.id)],
      [2, undefined] // wild stands for "6", the high end
    );

    expect(result).toHaveLength(2);
    expect(state.players[0].hasMeldedContract).toBe(true);
    const heartsRun = result!.find((m) => m.cards.some((c) => c.suit === "hearts"));
    expect(heartsRun?.cards.map((c) => c.rank)).toEqual(["3", "4", "5", "2"]);
    expect(heartsRun?.runStartIndex).toBe(2);
  });
});

describe("layOffCard", () => {
  function stateWithMeld() {
    const meld: Meld = {
      id: "meld1",
      type: "book",
      ownerId: "p1",
      cards: makeHand([
        ["5", "hearts"],
        ["5", "clubs"],
        ["5", "spades"],
      ]),
    };
    const layOffable = makeCard("5", "diamonds", { id: "layoff" });
    return { meld, layOffable };
  }

  it("requires the player to have melded their own contract first", () => {
    const { meld, layOffable } = stateWithMeld();
    const state = makeGameState({
      melds: [meld],
      players: [makePlayer({ id: "p1", hasMeldedContract: false, hand: [layOffable] })],
    });
    expect(layOffCard(state, layOffable.id, meld.id)).toBe(false);
    expect(state.players[0].hand).toContain(layOffable);
  });

  it("moves a valid card from hand onto the target meld", () => {
    const { meld, layOffable } = stateWithMeld();
    const state = makeGameState({
      melds: [meld],
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: [layOffable] })],
    });
    expect(layOffCard(state, layOffable.id, meld.id)).toBe(true);
    expect(state.players[0].hand).toHaveLength(0);
    expect(meld.cards).toContain(layOffable);
  });

  it("rejects a card that doesn't fit the meld", () => {
    const { meld } = stateWithMeld();
    const badCard = makeCard("6", "diamonds", { id: "bad" });
    const state = makeGameState({
      melds: [meld],
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: [badCard] })],
    });
    expect(layOffCard(state, badCard.id, meld.id)).toBe(false);
    expect(state.players[0].hand).toContain(badCard);
  });

  function stateWithRun() {
    const run: Meld = {
      id: "run1",
      type: "run",
      ownerId: "p1",
      runStartIndex: 4, // "5"
      cards: makeHand([
        ["5", "diamonds"],
        ["6", "diamonds"],
        ["7", "diamonds"],
        ["8", "diamonds"],
      ]),
    };
    return run;
  }

  it("inserts a natural card at the low end and shifts runStartIndex down", () => {
    const run = stateWithRun();
    const originalIds = run.cards.map((c) => c.id);
    const four = makeCard("4", "diamonds", { id: "four" });
    const state = makeGameState({
      melds: [run],
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: [four] })],
    });
    expect(layOffCard(state, four.id, run.id)).toBe(true);
    expect(run.cards.map((c) => c.id)).toEqual(["four", ...originalIds]);
    expect(run.runStartIndex).toBe(3); // "4"
  });

  it("appends a natural card at the high end without touching runStartIndex", () => {
    const run = stateWithRun();
    const nine = makeCard("9", "diamonds", { id: "nine" });
    const state = makeGameState({
      melds: [run],
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: [nine] })],
    });
    const originalIds = run.cards.map((c) => c.id);
    expect(layOffCard(state, nine.id, run.id)).toBe(true);
    expect(run.cards.map((c) => c.id)).toEqual([...originalIds, "nine"]);
    expect(run.runStartIndex).toBe(4); // unchanged
  });

  it("rejects an ambiguous wild lay-off onto a run when no position is given", () => {
    const run = stateWithRun();
    const wild = makeCard("2", "clubs", { id: "wild" });
    const state = makeGameState({
      melds: [run],
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: [wild] })],
    });
    expect(layOffCard(state, wild.id, run.id)).toBe(false);
    expect(state.players[0].hand).toContain(wild);
  });

  it("lays a wild off at the requested end and keeps the run sorted", () => {
    const run = stateWithRun();
    const wild = makeCard("2", "clubs", { id: "wild" });
    const state = makeGameState({
      melds: [run],
      players: [makePlayer({ id: "p1", hasMeldedContract: true, hand: [wild] })],
    });
    expect(layOffCard(state, wild.id, run.id, "low")).toBe(true);
    expect(run.cards[0].id).toBe("wild");
    expect(run.runStartIndex).toBe(3); // "4" slot, now wild-filled
  });
});

describe("eligibleBuyers / buyDiscard", () => {
  function threePlayerStateAfterDiscard() {
    // p1 discards, currentPlayerIndex advances to p2 (index 1) — p2 has
    // normal free priority; p3 is the only one who could buy.
    const discarded = makeCard("7", "hearts", { id: "disc" });
    return makeGameState({
      currentPlayerIndex: 1,
      discardPile: [discarded],
      discardHistory: [{ playerId: "p1", card: discarded }],
      drawPile: [makeCard("K", "clubs", { id: "penalty" })],
      players: [
        makePlayer({ id: "p1", hand: [] }),
        makePlayer({ id: "p2", hand: [] }),
        makePlayer({ id: "p3", hand: [] }),
      ],
    });
  }

  it("offers the buy to everyone except the discarder and current player, in turn order", () => {
    const state = threePlayerStateAfterDiscard();
    expect(eligibleBuyers(state).map((p) => p.id)).toEqual(["p3"]);
  });

  it("offers nobody in a 2-player game", () => {
    const discarded = makeCard("7", "hearts", { id: "disc" });
    const state = makeGameState({
      currentPlayerIndex: 1,
      discardPile: [discarded],
      discardHistory: [{ playerId: "p1", card: discarded }],
      players: [makePlayer({ id: "p1", hand: [] }), makePlayer({ id: "p2", hand: [] })],
    });
    expect(eligibleBuyers(state)).toEqual([]);
  });

  it("gives the buyer the discarded card plus one penalty card, without changing whose turn it is", () => {
    const state = threePlayerStateAfterDiscard();

    const bought = buyDiscard(state, "p3");

    expect(bought).toBe(true);
    expect(state.players.find((p) => p.id === "p3")?.hand.map((c) => c.id).sort()).toEqual(
      ["disc", "penalty"].sort()
    );
    expect(state.discardPile).toHaveLength(0);
    expect(state.drawPile).toHaveLength(0);
    expect(state.currentPlayerIndex).toBe(1); // still p2's turn — buying isn't a turn
  });

  it("rejects a buy from the current player (they get it free via their own turn)", () => {
    const state = threePlayerStateAfterDiscard();
    expect(buyDiscard(state, "p2")).toBe(false);
    expect(state.discardPile).toHaveLength(1);
  });

  it("rejects a buy from the discarder themself", () => {
    const state = threePlayerStateAfterDiscard();
    expect(buyDiscard(state, "p1")).toBe(false);
    expect(state.discardPile).toHaveLength(1);
  });

  it("rejects a buy when the discard pile is empty", () => {
    const state = threePlayerStateAfterDiscard();
    state.discardPile = [];
    expect(buyDiscard(state, "p3")).toBe(false);
  });
});

describe("discardAndAdvance", () => {
  it("moves the card to the discard pile, records history, and advances the turn", () => {
    const card = makeCard("7", "hearts", { id: "disc" });
    const keep = makeCard("8", "hearts", { id: "keep" });
    const state = makeGameState({
      round: 1,
      currentPlayerIndex: 0,
      players: [makePlayer({ id: "p1", hand: [card, keep] }), makePlayer({ id: "p2", hand: [] })],
    });

    const roundEnded = discardAndAdvance(state, card.id);

    expect(roundEnded).toBe(false);
    expect(state.players[0].hand).toEqual([keep]);
    expect(state.discardPile).toEqual([card]);
    expect(state.discardHistory).toEqual([{ playerId: "p1", card }]);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it("ends the round when the discard empties a melded player's hand", () => {
    const card = makeCard("7", "hearts", { id: "last-card" });
    const state = makeGameState({
      round: 1,
      currentPlayerIndex: 0,
      players: [
        makePlayer({ id: "p1", hand: [card], hasMeldedContract: true, cumulativeScore: 0 }),
        makePlayer({ id: "p2", hand: makeHand(["K", "Q"]), cumulativeScore: 0 }),
      ],
    });

    const roundEnded = discardAndAdvance(state, card.id);

    expect(roundEnded).toBe(true);
    expect(state.roundOver).toBe(true);
    expect(state.players[0].cumulativeScore).toBe(0); // winner scores nothing
    expect(state.players[1].cumulativeScore).toBeGreaterThan(0); // penalized for remaining hand
  });

  it("Round 7: skips the discard entirely when melding empties the hand", () => {
    const state = makeGameState({
      round: 7,
      currentPlayerIndex: 0,
      players: [
        makePlayer({ id: "p1", hand: [], hasMeldedContract: true, cumulativeScore: 0 }),
        makePlayer({ id: "p2", hand: makeHand(["K", "Q", "J"]), cumulativeScore: 0 }),
      ],
    });

    const roundEnded = discardAndAdvance(state, "unused-card-id");

    expect(roundEnded).toBe(true);
    expect(state.roundOver).toBe(true);
    expect(state.discardHistory).toHaveLength(0); // no discard was ever recorded
    expect(state.gameOver).toBe(true); // round 7 is the last round
    expect(state.winnerId).toBe("p1");
  });

  it("skips the discard on an empty hand in ANY round, not just the last one", () => {
    // Regression test: this used to only work in round 7 (via a
    // noDiscardOnGoOut flag on the contract) — a player who melded and then
    // laid off their remaining cards in an earlier round had no way to end
    // their turn, since there was nothing left to discard.
    const state = makeGameState({
      round: 1, // 2 Books — an ordinary, non-final round
      currentPlayerIndex: 0,
      players: [
        makePlayer({ id: "p1", hand: [], hasMeldedContract: true, cumulativeScore: 0 }),
        makePlayer({ id: "p2", hand: makeHand(["K", "Q", "J"]), cumulativeScore: 0 }),
      ],
    });

    const roundEnded = discardAndAdvance(state, "unused-card-id");

    expect(roundEnded).toBe(true);
    expect(state.roundOver).toBe(true);
    expect(state.discardHistory).toHaveLength(0);
    expect(state.gameOver).toBe(false); // round 1 of 7 — the game continues
    expect(state.winnerId).toBeUndefined();
  });

  it("ends the game after the last round of a shorter, custom-selected sequence", () => {
    const customContracts = [CONTRACTS[0], CONTRACTS[2]]; // just 2 rounds this game
    const card = makeCard("7", "hearts", { id: "last-card" });
    const state = makeGameState({
      round: 2, // the last round in this custom 2-round sequence
      selectedContracts: customContracts,
      currentPlayerIndex: 0,
      players: [
        makePlayer({ id: "p1", hand: [card], hasMeldedContract: true, cumulativeScore: 0 }),
        makePlayer({ id: "p2", hand: makeHand(["K"]), cumulativeScore: 0 }),
      ],
    });

    discardAndAdvance(state, card.id);

    expect(state.roundOver).toBe(true);
    expect(state.gameOver).toBe(true); // round 2 of 2 — this custom game is over
    expect(state.winnerId).toBe("p1");
  });

  it("marks the game over and picks the lowest cumulative score as winner after round 7", () => {
    const card = makeCard("3", "clubs", { id: "final-card" });
    const state = makeGameState({
      round: 7,
      currentPlayerIndex: 0,
      players: [
        makePlayer({ id: "p1", hand: [card], hasMeldedContract: true, cumulativeScore: 40 }),
        makePlayer({ id: "p2", hand: makeHand(["K"]), cumulativeScore: 10 }),
      ],
    });

    discardAndAdvance(state, card.id);

    expect(state.gameOver).toBe(true);
    // p2 had a lower score before this round's penalty and takes no further penalty (not the one who went out)
    // but p1 (winner) keeps their pre-round score of 40 with no addition, p2 gets penalized further.
    expect(state.winnerId).toBe(state.players.reduce((a, b) => (a.cumulativeScore <= b.cumulativeScore ? a : b)).id);
  });
});

describe("startNextRound", () => {
  it("does nothing if the round isn't over", () => {
    const state = makeGameState({ roundOver: false });
    expect(startNextRound(state)).toBe(state);
  });

  it("advances to the next round with a fresh deal and reset melding state", () => {
    const state = makeGameState({
      round: 2,
      roundOver: true,
      gameOver: false,
      melds: [{ id: "m", type: "book", ownerId: "p1", cards: [] }],
      discardHistory: [{ playerId: "p1", card: makeCard("5") }],
      players: [
        makePlayer({ id: "p1", hasMeldedContract: true, cumulativeScore: 15 }),
        makePlayer({ id: "p2", hasMeldedContract: false, cumulativeScore: 30 }),
      ],
    });

    const next = startNextRound(state);

    expect(next.round).toBe(3);
    expect(next.roundOver).toBe(false);
    expect(next.melds).toHaveLength(0);
    expect(next.discardHistory).toHaveLength(0);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.players.every((p) => p.hasMeldedContract === false)).toBe(true);
    expect(next.players.every((p) => p.hand.length === 13)).toBe(true);
    // scores carry over across rounds
    expect(next.players.find((p) => p.id === "p1")?.cumulativeScore).toBe(15);
    expect(next.players.find((p) => p.id === "p2")?.cumulativeScore).toBe(30);
  });

  it("carries the selected contract sequence forward into the next round", () => {
    const customContracts = [CONTRACTS[0], CONTRACTS[2], CONTRACTS[5]];
    const state = makeGameState({
      round: 1,
      roundOver: true,
      gameOver: false,
      selectedContracts: customContracts,
      players: [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })],
    });

    const next = startNextRound(state);

    expect(next.selectedContracts).toBe(customContracts);
    expect(next.round).toBe(2);
  });
});
