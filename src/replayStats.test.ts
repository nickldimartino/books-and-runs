import { describe, expect, it } from "vitest";
import {
  discardDeltas,
  drawDeltas,
  finalGameDeltas,
  layOffDeltas,
  meldDeltas,
  mergeDeltas,
  roundWonDeltas,
  tableCompositionDeltas,
} from "./replayStats";
import { makeCard } from "./testHelpers";
import { CONTRACTS, Meld } from "./types";

describe("mergeDeltas", () => {
  it("sums overlapping keys and adds new ones", () => {
    const into = { a: 1, b: 2 };
    mergeDeltas(into, { b: 3, c: 4 });
    expect(into).toEqual({ a: 1, b: 5, c: 4 });
  });
});

describe("tableCompositionDeltas", () => {
  it("credits pass_and_play_games for 2+ humans", () => {
    expect(tableCompositionDeltas([{ isAI: false }, { isAI: false }, { isAI: true }])).toEqual({
      pass_and_play_games: 1,
    });
  });

  it("credits solo_vs_ai_games for exactly 1 human", () => {
    expect(tableCompositionDeltas([{ isAI: false }, { isAI: true }])).toEqual({ solo_vs_ai_games: 1 });
  });

  it("credits large_table_games at 6+ total seats, alongside the human-count counter", () => {
    const configs = Array.from({ length: 6 }, () => ({ isAI: true }));
    configs[0] = { isAI: false };
    expect(tableCompositionDeltas(configs)).toEqual({ solo_vs_ai_games: 1, large_table_games: 1 });
  });

  it("credits nothing for zero humans", () => {
    expect(tableCompositionDeltas([{ isAI: true }, { isAI: true }])).toEqual({});
  });
});

describe("drawDeltas", () => {
  it("credits turns_taken and cards_drawn_blind for a pile draw", () => {
    const card = makeCard("5", "hearts");
    expect(drawDeltas(card, false)).toEqual({ turns_taken: 1, cards_drawn_blind: 1 });
  });

  it("credits cards_drawn_from_discard instead, when from the discard pile", () => {
    const card = makeCard("5", "hearts");
    expect(drawDeltas(card, true)).toEqual({ turns_taken: 1, cards_drawn_from_discard: 1 });
  });

  it("also credits wilds_drawn for a 2, and jokers_drawn for a joker", () => {
    expect(drawDeltas(makeCard("2", "clubs"), false)).toMatchObject({ wilds_drawn: 1 });
    expect(drawDeltas(makeCard("JOKER", "joker"), false)).toMatchObject({ wilds_drawn: 1, jokers_drawn: 1 });
  });
});

describe("meldDeltas", () => {
  const contract = CONTRACTS[0]; // 2 Books, bookSize 3

  it("credits completed_round_N and books_melded per book meld", () => {
    const melds: Meld[] = [
      { id: "m1", type: "book", ownerId: "p1", cards: [makeCard("A", "hearts"), makeCard("A", "clubs"), makeCard("A", "spades")] },
    ];
    expect(meldDeltas(melds, contract)).toEqual({
      completed_round_1: 1,
      books_melded: 1,
      melds_with_zero_wilds: 1,
    });
  });

  it("credits oversized_books_melded when a book exceeds the round's minimum size", () => {
    const melds: Meld[] = [
      {
        id: "m1",
        type: "book",
        ownerId: "p1",
        cards: [makeCard("A", "hearts"), makeCard("A", "clubs"), makeCard("A", "spades"), makeCard("A", "diamonds")],
      },
    ];
    expect(meldDeltas(melds, contract)).toMatchObject({ books_melded: 1, oversized_books_melded: 1 });
  });

  it("credits runs_melded and wilds_used_in_melds for a run containing a wild", () => {
    const melds: Meld[] = [
      {
        id: "m1",
        type: "run",
        ownerId: "p1",
        cards: [makeCard("4", "hearts"), makeCard("5", "hearts"), makeCard("2", "hearts"), makeCard("7", "hearts")],
      },
    ];
    const runContract = CONTRACTS[2]; // 2 Runs
    expect(meldDeltas(melds, runContract)).toEqual({
      completed_round_3: 1,
      runs_melded: 1,
      wilds_used_in_melds: 1,
    });
  });

  it("sums multiple melds in one call", () => {
    const book: Meld = {
      id: "m1",
      type: "book",
      ownerId: "p1",
      cards: [makeCard("A", "hearts"), makeCard("A", "clubs"), makeCard("A", "spades")],
    };
    const run: Meld = {
      id: "m2",
      type: "run",
      ownerId: "p1",
      cards: [makeCard("4", "hearts"), makeCard("5", "hearts"), makeCard("6", "hearts"), makeCard("7", "hearts")],
    };
    const mixedContract = CONTRACTS[1]; // 1 Book + 1 Run
    expect(meldDeltas([book, run], mixedContract)).toEqual({
      completed_round_2: 1,
      books_melded: 1,
      runs_melded: 1,
      melds_with_zero_wilds: 2,
    });
  });
});

describe("layOffDeltas", () => {
  const meld: Meld = { id: "m1", type: "book", ownerId: "owner", cards: [] };

  it("credits cards_laid_off, and laid_off_onto_opponent when the meld isn't the player's own", () => {
    const card = makeCard("5", "hearts");
    expect(layOffDeltas(card, meld, "someone-else", false)).toEqual({
      cards_laid_off: 1,
      laid_off_onto_opponent: 1,
    });
  });

  it("doesn't credit laid_off_onto_opponent when laying onto your own meld", () => {
    const card = makeCard("5", "hearts");
    expect(layOffDeltas(card, meld, "owner", false)).toEqual({ cards_laid_off: 1 });
  });

  it("credits wilds_laid_off for a wild card, and ambiguous_wild_choices_made when flagged", () => {
    const card = makeCard("2", "hearts");
    expect(layOffDeltas(card, meld, "owner", true)).toEqual({
      cards_laid_off: 1,
      wilds_laid_off: 1,
      ambiguous_wild_choices_made: 1,
    });
  });
});

describe("roundWonDeltas", () => {
  it("credits rounds_won_no_discard for a normal round win by melding out", () => {
    expect(roundWonDeltas(CONTRACTS[0], false)).toEqual({ rounds_won: 1, rounds_won_no_discard: 1 });
  });

  it("credits rounds_won_final_round for the wholeHandMeld round", () => {
    const finalRound = CONTRACTS.find((c) => c.wholeHandMeld)!;
    expect(roundWonDeltas(finalRound, false)).toEqual({ rounds_won: 1, rounds_won_final_round: 1 });
  });

  it("credits rounds_won_via_discard when won via discard, regardless of contract", () => {
    expect(roundWonDeltas(CONTRACTS[0], true)).toEqual({ rounds_won: 1, rounds_won_via_discard: 1 });
  });
});

describe("discardDeltas", () => {
  it("credits cards_discarded", () => {
    expect(discardDeltas()).toEqual({ cards_discarded: 1 });
  });
});

describe("finalGameDeltas", () => {
  it("credits zero_penalty_games only when the final score is exactly 0", () => {
    expect(finalGameDeltas(0)).toEqual({ zero_penalty_games: 1 });
    expect(finalGameDeltas(5)).toEqual({});
  });
});
