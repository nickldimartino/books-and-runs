import { describe, expect, it } from "vitest";
import {
  attemptMeldContract,
  createGame,
  discardAndAdvance,
  drawFromDiscard,
  drawFromPile,
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

    // the old top card becomes the sole new discard pile card
    expect(state.discardPile).toEqual([top]);
    // the drawn card came from the reshuffled remainder, and the other one is left in drawPile
    expect([bottom.id, middle.id]).toContain(drawn.id);
    expect(state.drawPile).toHaveLength(1);
    expect(state.players[0].hand).toHaveLength(1);
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
    const req = CONTRACTS[6];
    expect(req.noDiscardOnGoOut).toBe(true);

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
