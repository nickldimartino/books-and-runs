// @vitest-environment jsdom

// End-to-end-ish test of the multiplayer play screen against a mocked Edge
// Function (`fetch`): the "I staged my whole contract but couldn't meld"
// report. The turn is individual actions mirroring solo: "Group selected
// cards" stages, a separate "Confirm Meld" commits it for real (visible to
// everyone at once), then "Discard selected card" is its own action that ends
// the turn. A server rejection must show *inside the hand drawer* — where the
// user is — and stay (with the staged draft) on screen.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Card } from "@/types";
import type { RedactedView } from "@/mp/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../AuthContext", () => ({ useAuth: () => ({ user: { id: "u-me" }, loading: false }) }));
vi.mock("../../PlayerLevelContext", () => ({ usePlayerLevel: () => ({ level: null }) }));
vi.mock("../../lib/sound", () => ({ playCardTap: vi.fn(), playMeld: vi.fn(), playRoundWin: vi.fn(), playGameWin: vi.fn() }));
vi.mock("../../lib/haptics", () => ({ hapticLight: vi.fn(), hapticMedium: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock("../../lib/ambience", () => ({ startAmbience: vi.fn(), stopAmbience: vi.fn() }));
vi.mock("../../lib/loadAchievementProgress", () => ({ loadAchievementProgressState: vi.fn(async () => ({})) }));
vi.mock("../../lib/leaderboardStore", () => ({
  fetchBiosFor: vi.fn(async () => ({})),
  fetchDisplayNamesFor: vi.fn(async () => ({})),
}));
vi.mock("../../lib/tournamentsStore", () => ({ getTournamentForGame: vi.fn(async () => null) }));
vi.mock("../../lib/mpStore", async (orig) => ({
  ...(await orig<typeof import("../../lib/mpStore")>()),
  getMpParticipantUserIds: vi.fn(async () => ({})),
}));

function makeChannel() {
  const channel: Record<string, unknown> = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  return channel;
}
vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })) },
    channel: vi.fn(() => makeChannel()),
    removeChannel: vi.fn(),
  },
}));

const { default: Page } = await import("./page");

const card = (id: string, rank: string, suit: Card["suit"]): Card => ({
  id,
  rank: rank as Card["rank"],
  suit,
  isWild: rank === "2",
});

// The exact hand from the report: Book 1 = J,J,J and Book 2 = 8,8 + a wild 2,
// with two spare cards to discard.
const HAND = [
  card("j1", "J", "hearts"),
  card("j2", "J", "spades"),
  card("j3", "J", "clubs"),
  card("e1", "8", "hearts"),
  card("e2", "8", "diamonds"),
  card("w1", "2", "spades"),
  card("k1", "K", "spades"),
  card("f1", "4", "hearts"),
];

const VIEW: RedactedView = {
  round: 1,
  roundLabel: "2 Books",
  totalRounds: 5,
  contractRounds: [1, 2, 3, 4, 5],
  contract: { books: 2, runs: 0, bookSize: 3, runSize: 4, wholeHandMeld: false },
  players: [
    { seat: 0, name: "Me", isAI: false, userId: "u-me", handCount: 8, hasMeldedContract: false, cumulativeScore: 0, resigned: false },
    { seat: 1, name: "Ari", isAI: false, userId: "u-ari", handCount: 7, hasMeldedContract: false, cumulativeScore: 0, resigned: false },
  ],
  yourSeat: 0,
  yourHand: HAND,
  currentSeat: 0,
  currentUserId: "u-me",
  yourTurn: true,
  youHaveDrawn: true,
  drawPileCount: 40,
  discardPile: [card("d1", "9", "clubs")],
  discardTop: card("d1", "9", "clubs"),
  melds: [],
  discardHistory: [],
  pickupHistory: [],
  roundOver: false,
  gameOver: false,
  winnerSeat: null,
  roundResults: [],
};

let moveResponse: () => { status: number; body: unknown };
const moveBodies: Record<string, unknown>[] = [];

beforeEach(() => {
  // jsdom lacks the Web Animations API DraggableHand's FLIP effect uses.
  (HTMLElement.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [];
  localStorage.clear();
  moveBodies.length = 0;
  window.history.pushState({}, "", "/multiplayer/play?g=game-1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).split("/").filter(Boolean).pop()!;
      const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
      let out: { status: number; body: unknown };
      if (path === "state") out = { status: 200, body: { status: "active", view: VIEW } };
      else if (path === "move") {
        moveBodies.push(reqBody);
        out = moveResponse();
      } else out = { status: 404, body: { error: "unexpected" } };
      return { ok: out.status < 300, status: out.status, json: async () => out.body } as Response;
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pick = (label: string) => fireEvent.keyDown(screen.getByRole("button", { name: label }), { key: "Enter" });

async function openDrawerAndStageContract() {
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Jump to your hand" }));
  const dialog = await screen.findByRole("dialog");
  for (const l of ["Jack of hearts", "Jack of spades", "Jack of clubs"]) pick(l);
  fireEvent.click(within(dialog).getByRole("button", { name: "Group selected cards" }));
  for (const l of ["8 of hearts", "8 of diamonds", "2 of spades, wild"]) pick(l);
  fireEvent.click(within(dialog).getByRole("button", { name: "Group selected cards" }));
  return dialog;
}

const MELDED_VIEW: RedactedView = {
  ...VIEW,
  yourHand: [HAND[6], HAND[7]],
  players: VIEW.players.map((p) => (p.seat === 0 ? { ...p, hasMeldedContract: true, handCount: 2 } : p)),
  melds: [
    { id: "seat-0-meld-0-book", type: "book", ownerId: "seat-0", cards: [HAND[0], HAND[1], HAND[2]] },
    { id: "seat-0-meld-1-book", type: "book", ownerId: "seat-0", cards: [HAND[3], HAND[4], HAND[5]] },
  ],
};

describe("multiplayer play screen — individual actions like solo", () => {
  it("stage -> Confirm Meld (immediate, real) -> then a separate discard ends the turn", async () => {
    const responses: (() => { status: number; body: unknown })[] = [
      () => ({ status: 200, body: { status: "active", view: MELDED_VIEW } }),
      () => ({ status: 200, body: { status: "active", view: { ...MELDED_VIEW, yourTurn: false, currentSeat: 1, youHaveDrawn: false, yourHand: [HAND[7]] } } }),
    ];
    moveResponse = () => responses.shift()!();
    const dialog = await openDrawerAndStageContract();

    expect(within(dialog).getByText(/Contract: 2\/2 books · 0\/0 runs/)).toBeTruthy();
    // No combined flow any more.
    expect(within(dialog).queryByRole("button", { name: "Meld & discard" })).toBeNull();

    const confirmMeld = within(dialog).getByRole("button", { name: "Confirm Meld" }) as HTMLButtonElement;
    expect(confirmMeld.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirmMeld);
    });

    await waitFor(() => expect(moveBodies).toHaveLength(1));
    expect(moveBodies[0].action).toMatchObject({
      type: "meld",
      groups: [["j1", "j2", "j3"], ["e1", "e2", "w1"]],
    });
    expect(moveBodies[0].action).not.toHaveProperty("discardCardId");

    // The meld is now real: on the table for everyone, and it is still my turn.
    await waitFor(() => expect(document.querySelectorAll("[data-meld-id]").length).toBe(2));
    expect(screen.queryByRole("button", { name: "Confirm Meld" })).toBeNull(); // melded — builder gone

    // Discard is its own action (reopen the drawer — melding closes it, as in solo).
    fireEvent.click(await screen.findByRole("button", { name: "Jump to your hand" }));
    const dialog2 = await screen.findByRole("dialog");
    pick("King of spades");
    fireEvent.click(within(dialog2).getByRole("button", { name: "Discard selected card" }));
    expect(within(dialog2).getByRole("button", { name: "Confirm" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog2).getByRole("button", { name: "Confirm" }));
    });
    await waitFor(() => expect(moveBodies).toHaveLength(2));
    expect(moveBodies[1].action).toEqual({ type: "discard", discardCardId: "k1" });
  });

  it("Confirm Meld stays disabled until the staged groups complete the contract", async () => {
    moveResponse = () => ({ status: 200, body: { status: "active", view: VIEW } });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Jump to your hand" }));
    const dialog = await screen.findByRole("dialog");
    for (const l of ["Jack of hearts", "Jack of spades", "Jack of clubs"]) pick(l);
    fireEvent.click(within(dialog).getByRole("button", { name: "Group selected cards" }));

    expect((within(dialog).getByRole("button", { name: "Confirm Meld" }) as HTMLButtonElement).disabled).toBe(true);
    // Discarding is a separate, always-available action (not held back).
    pick("King of spades");
    expect((within(dialog).getByRole("button", { name: "Discard selected card" }) as HTMLButtonElement).disabled).toBe(false);
    expect(moveBodies).toHaveLength(0);
  });

  it("shows a server rejection inside the drawer and keeps it (and the staged groups) on screen", async () => {
    moveResponse = () => ({ status: 409, body: { error: "that meld doesn't complete this round's contract" } });
    const dialog = await openDrawerAndStageContract();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Meld" }));
    });

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toMatch(/doesn't complete this round's contract/);

    // The reconciling refresh that follows a failed move must not wipe it…
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(within(dialog).getByRole("alert").textContent).toMatch(/contract/);
    // …nor the staged draft, so the player can fix and retry.
    expect(within(dialog).getByText(/Contract: 2\/2 books/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Confirm Meld" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
