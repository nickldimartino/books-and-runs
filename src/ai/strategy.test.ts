import { describe, expect, it, vi } from "vitest";
import {
  cautiousWildLayOffPlan,
  dangerScore,
  deadCards,
  isCloseToOut,
  leaderPressure,
  maybeMistakeBool,
  maybeMistakeDiscard,
  minRunDistance,
  selfWildLayOffPlan,
} from "./strategy";
import { easyStrategy } from "./easy";
import { beginnerStrategy } from "./beginner";
import { mediumStrategy } from "./medium";
import { hardStrategy } from "./hard";
import { expertStrategy } from "./expert";
import { CONTRACTS, Meld } from "../types";
import { makeCard, makeGameState, makeHand, makePlayer } from "../testHelpers";

// Every mistake roll in strategy.ts checks `rng() < chance` — 1 is never
// less than any chance in (0, 1), so this rng guarantees a mistake never
// fires. Existing exact-outcome tests below pass this explicitly so they
// stay deterministic regardless of the tier's real mistake chance.
const NEVER_MISTAKE = () => 1;

// Regression coverage for the contract-aware discard fix: deadCards() used to
// judge "dead" purely by duplicate-rank count, with zero concept of runs, so
// run-heavy rounds (3, 5, 7) would happily discard the only card building
// toward a run the AI badly needed. It's now scoped to the round's actual
// contract shape.
describe("deadCards", () => {
  it("treats run-building cards as dead when the round only needs books", () => {
    const hand = [...makeHand([["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]), makeCard("2", "clubs")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 1, players: [player] }); // 2 Books, 0 Runs

    const dead = deadCards(player, state);

    expect(dead.map((c) => c.rank).sort()).toEqual(["5", "6", "7"]);
  });

  it("keeps the same run-building cards alive when the round needs runs", () => {
    const hand = [...makeHand([["5", "hearts"], ["6", "hearts"], ["7", "hearts"]]), makeCard("2", "clubs")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 3, players: [player] }); // 2 Runs

    const dead = deadCards(player, state);

    expect(dead).toHaveLength(0);
  });

  it("never marks wild cards as dead", () => {
    const player = makePlayer({ hand: [makeCard("2", "clubs"), makeCard("JOKER", "joker")] });
    const state = makeGameState({ round: 1, players: [player] });
    expect(deadCards(player, state)).toHaveLength(0);
  });

  it("keeps a book-building card alive on a book round when one wild can complete it", () => {
    const hand = [...makeHand([["9", "hearts"], ["9", "clubs"]]), makeCard("2", "clubs")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 1, players: [player] }); // needs bookSize 3, has 2 natural 9s + 1 wild

    const dead = deadCards(player, state);

    expect(dead).toHaveLength(0); // the 9s are one wild-fill away from a full book
  });

  it("marks a lone natural dead when completing its book would need more wilds than naturals", () => {
    const hand = [makeCard("9", "hearts"), makeCard("2", "clubs"), makeCard("2", "spades")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 1, players: [player] }); // needs bookSize 3, has 1 natural 9 + 2 wilds

    const dead = deadCards(player, state);

    // A meld can't use more wild cards than natural ones, so a lone natural
    // can't be completed into a book — it's genuinely dead now.
    expect(dead.map((c) => c.rank)).toEqual(["9"]);
  });

  it("marks a truly unrelated card dead even on a mixed book+run round", () => {
    const hand = [
      ...makeHand([["K", "hearts"], ["K", "clubs"], ["K", "spades"]]), // complete book
      makeCard("3", "diamonds"), // isolated, no run/book potential, no wilds
    ];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 2, players: [player] }); // 1 Book + 1 Run

    const dead = deadCards(player, state);

    expect(dead.map((c) => c.id)).toEqual([hand[3].id]);
  });
});

describe("easyStrategy.chooseDiscard (integration with contract-aware deadCards)", () => {
  it("prefers discarding a genuinely dead card over a run-building one on a run round", () => {
    const runBuilder = makeCard("5", "hearts", { id: "run-builder" });
    const isolated = makeCard("K", "diamonds", { id: "isolated" }); // face card, high penalty, unrelated suit
    const player = makePlayer({ hand: [runBuilder, makeCard("6", "hearts"), makeCard("7", "hearts"), isolated] });
    const state = makeGameState({ round: 3, currentPlayerIndex: 0, players: [player] });

    const discard = easyStrategy.chooseDiscard(state, player, NEVER_MISTAKE);

    expect(discard.id).toBe("isolated");
  });
});

describe("minRunDistance", () => {
  it("treats King and Ace as adjacent (ace-high), not 12 apart", () => {
    expect(minRunDistance("K", "A")).toBe(1);
  });

  it("treats 2 and Ace as adjacent (ace-low)", () => {
    expect(minRunDistance("A", "3")).toBe(2); // A(low)->2->3, 2 slots apart via the wild-only "2" slot
    expect(minRunDistance("2", "A")).toBe(1); // "2" itself is always wild, but the slot still counts for distance
  });

  it("returns 0 for the same rank and grows with real distance", () => {
    expect(minRunDistance("7", "7")).toBe(0);
    expect(minRunDistance("4", "7")).toBe(3);
  });
});

describe("beginnerStrategy.chooseDiscard", () => {
  it("can discard a wild — picks randomly across the whole hand, not just naturals", () => {
    const wild = makeCard("JOKER", "joker", { id: "the-wild" });
    const hand = [makeCard("5", "hearts"), wild, makeCard("9", "clubs")];
    const player = makePlayer({ hand });
    const state = makeGameState({ round: 1, players: [player] });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.4); // index 1 of 3 -> the wild
    try {
      const discard = beginnerStrategy.chooseDiscard(state, player);
      expect(discard.id).toBe("the-wild");
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("selfWildLayOffPlan (medium)", () => {
  it("lays a natural off onto anyone's meld but keeps a wild off an opponent's meld", () => {
    const ownMeld: Meld = {
      id: "own-book",
      type: "book",
      ownerId: "self",
      cards: makeHand([["9", "hearts"], ["9", "clubs"], ["9", "spades"]]),
    };
    const opponentMeld: Meld = {
      id: "opp-book",
      type: "book",
      ownerId: "opponent",
      cards: makeHand([["5", "hearts"], ["5", "clubs"], ["5", "spades"]]),
    };
    const naturalFive = makeCard("5", "diamonds", { id: "natural-5" }); // only fits the opponent's book
    const wildJoker = makeCard("JOKER", "joker", { id: "wild-joker" }); // a wild can join any book

    const player = makePlayer({
      id: "self",
      hand: [naturalFive, wildJoker],
      hasMeldedContract: true,
    });
    const state = makeGameState({
      round: 1,
      currentPlayerIndex: 0,
      players: [player, makePlayer({ id: "opponent" })],
      melds: [ownMeld, opponentMeld],
    });

    const moves = selfWildLayOffPlan(state, player);

    const naturalMove = moves.find((m) => m.cardId === "natural-5");
    const wildMove = moves.find((m) => m.cardId === "wild-joker");

    expect(naturalMove?.meldId).toBe("opp-book"); // naturals go wherever they fit
    expect(wildMove?.meldId).toBe("own-book"); // wild only ever targets its own meld
  });

  it("skips laying a wild off entirely when only an opponent's meld fits it", () => {
    const opponentMeld: Meld = {
      id: "opp-book",
      type: "book",
      ownerId: "opponent",
      cards: makeHand([["6", "hearts"], ["6", "clubs"], ["6", "spades"]]),
    };
    const wildJoker = makeCard("JOKER", "joker", { id: "wild-joker" });
    const player = makePlayer({ id: "self", hand: [wildJoker], hasMeldedContract: true });
    const state = makeGameState({
      round: 1,
      currentPlayerIndex: 0,
      players: [player, makePlayer({ id: "opponent" })],
      melds: [opponentMeld],
    });

    const moves = selfWildLayOffPlan(state, player);

    expect(moves).toHaveLength(0);
  });
});

describe("isCloseToOut / leaderPressure", () => {
  it("reads a small non-empty hand as close, but not an empty one on its own", () => {
    expect(isCloseToOut(makePlayer({ hand: makeHand(["9", "9"]) }))).toBe(true); // 2 cards
    expect(isCloseToOut(makePlayer({ hand: makeHand(["9", "9", "9", "9"]) }))).toBe(false); // 4 cards
    // An empty hand with no meld isn't a real "about to win" state (mid-round
    // that would already be over) — it's what a test fixture gets by default
    // when it never bothers to set one, and shouldn't silently read as urgent.
    expect(isCloseToOut(makePlayer({ hand: [] }))).toBe(false);
  });

  it("already-melded reads as close regardless of remaining hand size", () => {
    expect(isCloseToOut(makePlayer({ hand: makeHand(["9", "9", "9", "9", "9"]), hasMeldedContract: true }))).toBe(
      true
    );
  });

  it("scales up as a close hand shrinks, and jumps further once melded", () => {
    const threeLeft = leaderPressure(makePlayer({ hand: makeHand(["9", "9", "9"]) }));
    const oneLeft = leaderPressure(makePlayer({ hand: makeHand(["9"]) }));
    const meldedOneLeft = leaderPressure(makePlayer({ hand: makeHand(["9"]), hasMeldedContract: true }));
    expect(oneLeft).toBeGreaterThan(threeLeft);
    expect(meldedOneLeft).toBeGreaterThan(oneLeft);
  });

  it("is 0 for anyone not close", () => {
    expect(leaderPressure(makePlayer({ hand: makeHand(["9", "9", "9", "9", "9"]) }))).toBe(0);
  });
});

describe("dangerScore — weights toward whoever's closing in on going out", () => {
  it("scores the same pickup higher coming from a close opponent than a far one", () => {
    const card = makeCard("7", "hearts");
    const self = makePlayer({ id: "self", hand: makeHand(["9", "9"]) });
    const farOpponent = makePlayer({ id: "far", hand: makeHand(["9", "9", "9", "9", "9", "9"]) });
    const closeOpponent = makePlayer({ id: "close", hand: makeHand(["9"]) }); // 1 card left

    const farScore = dangerScore(
      makeGameState({ players: [self, farOpponent], pickupHistory: [{ playerId: "far", card: makeCard("7", "clubs") }] }),
      self,
      card
    );
    const closeScore = dangerScore(
      makeGameState({
        players: [self, closeOpponent],
        pickupHistory: [{ playerId: "close", card: makeCard("7", "clubs") }],
      }),
      self,
      card
    );

    expect(closeScore).toBeGreaterThan(farScore);
  });
});

describe("cautiousWildLayOffPlan (hard/expert)", () => {
  it("holds a wild back when a natural could do the same job and nobody's close to out", () => {
    const ownMeld: Meld = {
      id: "own-book",
      type: "book",
      ownerId: "self",
      cards: makeHand([["6", "hearts"], ["6", "clubs"], ["6", "spades"]]),
    };
    const naturalSix = makeCard("6", "diamonds", { id: "natural-6" });
    const wildJoker = makeCard("JOKER", "joker", { id: "wild-joker" });
    // A big hand and not yet melded — well clear of isCloseToOut — so the
    // "still holding back" branch is what's under test, not the
    // close-to-out escalation (which triggers on either signal on its own).
    const player = makePlayer({
      id: "self",
      hand: [naturalSix, wildJoker, ...makeHand(["2", "3", "4", "5", "8"])],
    });
    const state = makeGameState({ round: 1, players: [player], melds: [ownMeld] });

    const moves = cautiousWildLayOffPlan(state, player);

    expect(moves.some((m) => m.cardId === "wild-joker")).toBe(false);
    expect(moves.some((m) => m.cardId === "natural-6")).toBe(true);
  });

  it("lays the wild off too once the player is themself closing in on going out", () => {
    const ownMeld: Meld = {
      id: "own-book",
      type: "book",
      ownerId: "self",
      cards: makeHand([["6", "hearts"], ["6", "clubs"], ["6", "spades"]]),
    };
    const naturalSix = makeCard("6", "diamonds", { id: "natural-6" });
    const wildJoker = makeCard("JOKER", "joker", { id: "wild-joker" });
    // Only these two cards left — reads as close to going out even though a
    // natural alternative for the book still technically exists in hand.
    const player = makePlayer({ id: "self", hand: [naturalSix, wildJoker], hasMeldedContract: true });
    const state = makeGameState({ round: 1, players: [player], melds: [ownMeld] });

    const moves = cautiousWildLayOffPlan(state, player);

    expect(moves.some((m) => m.cardId === "wild-joker")).toBe(true);
  });
});

describe("hardStrategy — ace-high run adjacency", () => {
  it("recognizes an Ace as run-adjacent to a King when deciding to take the discard", () => {
    const aceOfSpades = makeCard("A", "spades");
    const player = makePlayer({ hand: [makeCard("K", "spades"), makeCard("Q", "spades"), makeCard("J", "spades")] });
    const state = makeGameState({
      round: 1,
      players: [player],
      discardPile: [aceOfSpades],
    });

    expect(hardStrategy.wantsDiscardPileDraw(state, player, NEVER_MISTAKE)).toBe(true);
  });
});

describe("mediumStrategy.wantsDiscardPileDraw", () => {
  it("always wants a wild off the discard pile", () => {
    const player = makePlayer({ hand: makeHand(["9", "K", "3"]) });
    const state = makeGameState({ round: 1, players: [player], discardPile: [makeCard("2", "clubs")] });
    expect(mediumStrategy.wantsDiscardPileDraw(state, player, NEVER_MISTAKE)).toBe(true);
  });
});

describe("easyStrategy.wantsDiscardPileDraw", () => {
  it("takes a wild off the discard pile — doesn't hold back to hide need, unlike hard/expert", () => {
    const player = makePlayer({ hand: makeHand(["9", "K", "3"]) });
    const state = makeGameState({ round: 1, players: [player], discardPile: [makeCard("2", "clubs")] });
    expect(easyStrategy.wantsDiscardPileDraw(state, player, NEVER_MISTAKE)).toBe(true);
  });

  it("recognizes run-adjacency, not just an exact rank match", () => {
    const player = makePlayer({ hand: [makeCard("4", "hearts"), makeCard("5", "hearts")] });
    const state = makeGameState({ round: 1, players: [player], discardPile: [makeCard("6", "hearts")] });
    expect(easyStrategy.wantsDiscardPileDraw(state, player, NEVER_MISTAKE)).toBe(true);
  });
});

describe("mediumStrategy.chooseDiscard — light opponent awareness", () => {
  it("avoids discarding a rank an opponent just picked up, when an equally-safe alternative exists", () => {
    const kingCard = makeCard("K", "hearts", { id: "king" });
    const threeCard = makeCard("3", "diamonds", { id: "three" });
    const player = makePlayer({ id: "self", hand: [kingCard, threeCard] });
    const state = makeGameState({
      round: 1,
      currentPlayerIndex: 0,
      players: [player, makePlayer({ id: "opponent" })],
      pickupHistory: [{ playerId: "opponent", card: makeCard("3", "clubs") }],
    });

    const discard = mediumStrategy.chooseDiscard(state, player, NEVER_MISTAKE);

    expect(discard.id).toBe("king"); // higher penalty, and not the rank the opponent just showed interest in
  });

  it("still discards the just-wanted rank if it's the only option available", () => {
    const threeCard = makeCard("3", "diamonds", { id: "three" });
    const player = makePlayer({ id: "self", hand: [threeCard] });
    const state = makeGameState({
      round: 1,
      currentPlayerIndex: 0,
      players: [player, makePlayer({ id: "opponent" })],
      pickupHistory: [{ playerId: "opponent", card: makeCard("3", "clubs") }],
    });

    const discard = mediumStrategy.chooseDiscard(state, player, NEVER_MISTAKE);

    expect(discard.id).toBe("three");
  });

  it("avoids a rank a close-to-out opponent picked up a while ago, not just their latest pickup", () => {
    const kingCard = makeCard("K", "hearts", { id: "king" });
    const threeCard = makeCard("3", "diamonds", { id: "three" });
    const player = makePlayer({ id: "self", hand: [kingCard, threeCard] });
    const closeOpponent = makePlayer({ id: "opponent", hand: makeHand(["9"]) }); // 1 card left — visibly close
    const state = makeGameState({
      round: 1,
      currentPlayerIndex: 0,
      players: [player, closeOpponent],
      // Not their most recent pickup (that's the clubs 9 below) — only
      // medium's ordinary opponentJustPickedUpThisRank wouldn't catch this
      // on its own; the close-opponent whole-history check is what should.
      pickupHistory: [
        { playerId: "opponent", card: makeCard("3", "clubs") },
        { playerId: "opponent", card: makeCard("9", "clubs") },
      ],
    });

    const discard = mediumStrategy.chooseDiscard(state, player, NEVER_MISTAKE);

    expect(discard.id).toBe("king");
  });
});

describe("hardStrategy.chooseDiscard — treats a wild as extra risky in the all-live fallback", () => {
  it("prefers discarding a natural over a Joker when both are otherwise equally safe", () => {
    const king1 = makeCard("K", "hearts", { id: "king1" });
    const king2 = makeCard("K", "clubs", { id: "king2" });
    const joker = makeCard("JOKER", "joker", { id: "joker" });
    const player = makePlayer({ hand: [king1, king2, joker] });
    // Round 1 needs 2 books; the two natural Kings plus this one wild are
    // exactly enough to complete a book, so nothing here is "dead" —
    // forces the fallback pool to be the whole hand, wild included.
    const state = makeGameState({ round: 1, players: [player] });

    const discard = hardStrategy.chooseDiscard(state, player, NEVER_MISTAKE);

    expect(discard.id).not.toBe("joker");
  });
});

describe("expertStrategy.wantsDiscardPileDraw — holds wilds back like hard, with a calculated exception", () => {
  it("declines a wild with low opponent demand, same principle as hard", () => {
    const player = makePlayer({ id: "self", hand: makeHand(["9", "K", "3"]) });
    const state = makeGameState({
      round: 1,
      players: [player, makePlayer({ id: "opponent" })],
      discardPile: [makeCard("2", "clubs")],
    });
    expect(expertStrategy.wantsDiscardPileDraw(state, player, NEVER_MISTAKE)).toBe(false);
  });

  it("takes a wild anyway once opponent demand is high enough to be worth denying", () => {
    const wildOnTop = makeCard("2", "diamonds");
    const player = makePlayer({ id: "self", hand: makeHand(["9", "K", "3"]) });
    const state = makeGameState({
      round: 1,
      players: [player, makePlayer({ id: "opponent" })],
      discardPile: [wildOnTop],
      // Two opponent pickups matching this rank/suit region push demand
      // comfortably above the higher, wild-specific denial bar.
      pickupHistory: [
        { playerId: "opponent", card: makeCard("2", "diamonds") },
        { playerId: "opponent", card: makeCard("3", "diamonds") },
      ],
    });
    expect(expertStrategy.wantsDiscardPileDraw(state, player, NEVER_MISTAKE)).toBe(true);
  });

  it("denies a wild over a single pickup that wouldn't otherwise clear the bar, once that opponent is close to out", () => {
    const wildOnTop = makeCard("2", "diamonds");
    const player = makePlayer({ id: "self", hand: makeHand(["9", "K", "3"]) });
    const farState = makeGameState({
      round: 1,
      players: [player, makePlayer({ id: "opponent", hand: makeHand(["9", "9", "9", "9", "9", "9"]) })],
      discardPile: [wildOnTop],
      pickupHistory: [{ playerId: "opponent", card: makeCard("2", "diamonds") }],
    });
    // A single matching pickup, on its own, doesn't clear the deny bar for a
    // wild — same as the "declines a wild with low opponent demand" case.
    expect(expertStrategy.wantsDiscardPileDraw(farState, player, NEVER_MISTAKE)).toBe(false);

    const closeState = makeGameState({
      round: 1,
      players: [player, makePlayer({ id: "opponent", hand: makeHand(["9"]) })], // 1 card left now
      discardPile: [wildOnTop],
      pickupHistory: [{ playerId: "opponent", card: makeCard("2", "diamonds") }],
    });
    // The exact same single pickup, from an opponent now visibly one card
    // from going out, is worth denying.
    expect(expertStrategy.wantsDiscardPileDraw(closeState, player, NEVER_MISTAKE)).toBe(true);
  });
});

describe("expertStrategy.chooseDiscard — treats a wild as extra costly in the all-live fallback", () => {
  it("prefers discarding a natural over a Joker when both are otherwise equally low-demand", () => {
    const king1 = makeCard("K", "hearts", { id: "king1" });
    const king2 = makeCard("K", "clubs", { id: "king2" });
    const joker = makeCard("JOKER", "joker", { id: "joker" });
    const player = makePlayer({ id: "self", hand: [king1, king2, joker] });
    const state = makeGameState({ round: 1, players: [player, makePlayer({ id: "opponent" })] });

    const discard = expertStrategy.chooseDiscard(state, player, NEVER_MISTAKE);

    expect(discard.id).not.toBe("joker");
  });
});

describe("mistake chance (maybeMistakeDiscard / maybeMistakeBool)", () => {
  it("maybeMistakeDiscard returns null (no mistake) when the roll doesn't clear the chance", () => {
    const hand = makeHand(["5", "9", "K"]);
    const rng = () => 0.5; // 0.5 >= chance for every tier, so this never fires
    expect(maybeMistakeDiscard(hand, 0.2, rng)).toBeNull();
  });

  it("maybeMistakeDiscard returns a hand card, ignoring heuristics, when the roll clears the chance", () => {
    const hand = makeHand(["5", "9", "K"]);
    const rng = () => 0; // 0 < any nonzero chance, and picks index 0
    expect(maybeMistakeDiscard(hand, 0.2, rng)).toBe(hand[0]);
  });

  it("maybeMistakeBool returns null (no mistake) when the roll doesn't clear the chance", () => {
    expect(maybeMistakeBool(0.2, () => 0.5)).toBeNull();
  });

  it("maybeMistakeBool flips a coin when the roll clears the chance", () => {
    // Two rng calls: the first (0) clears the mistake-chance roll, the
    // second (0.9) decides the coin flip itself.
    const rng = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.9);
    expect(maybeMistakeBool(0.2, rng)).toBe(false); // 0.9 is not < 0.5
  });

  it("easyStrategy.chooseDiscard takes the mistake path — a random hand card, not the heuristic pick", () => {
    const runBuilder = makeCard("5", "hearts", { id: "run-builder" });
    const isolated = makeCard("K", "diamonds", { id: "isolated" }); // what the heuristic would normally pick
    const player = makePlayer({ hand: [runBuilder, makeCard("6", "hearts"), makeCard("7", "hearts"), isolated] });
    const state = makeGameState({ round: 3, currentPlayerIndex: 0, players: [player] });

    const alwaysMistake = () => 0; // clears the mistake roll, then picks index 0 of the hand
    const discard = easyStrategy.chooseDiscard(state, player, alwaysMistake);

    expect(discard.id).toBe("run-builder"); // not "isolated" — the heuristic never ran
  });

  it("mediumStrategy.wantsDiscardPileDraw takes the mistake path — a coin flip, not real judgment", () => {
    const player = makePlayer({ hand: makeHand(["9", "K", "3"]) });
    // A plain natural the strategy's own judgment would decline (no rank/run
    // match), so a `true` result can only have come from the mistake path.
    const state = makeGameState({ round: 1, players: [player], discardPile: [makeCard("Q", "diamonds")] });

    const forceTrue = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0); // clears roll, coin flip < 0.5
    expect(mediumStrategy.wantsDiscardPileDraw(state, player, forceTrue)).toBe(true);
  });
});
