// @vitest-environment jsdom

// End-to-end-ish test of the multiplayer play screen against a mocked Edge
// Function (`fetch`): the "I staged my whole contract but couldn't meld"
// report. Nothing is real in multiplayer until commitTurn, so the screen has
// to (a) say a staged contract still needs a discard, (b) offer one clear
// "Meld & discard" action, and (c) show a server rejection *inside the hand
// drawer* — where the user is — and keep it (and the draft) on screen.

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

describe("multiplayer play screen — meld & discard", () => {
  it("tells you a staged contract still needs a discard, and commits meld + discard in one move", async () => {
    moveResponse = () => ({ status: 200, body: { status: "active", view: { ...VIEW, yourTurn: false, currentSeat: 1, youHaveDrawn: false } } });
    const dialog = await openDrawerAndStageContract();

    expect(within(dialog).getByText(/Contract: 2\/2 books · 0\/0 runs/)).toBeTruthy();
    expect(within(dialog).getByTestId("contract-ready-hint").textContent).toMatch(/discard/i);

    const meldBtn = within(dialog).getByRole("button", { name: "Meld & discard" });
    expect((meldBtn as HTMLButtonElement).disabled).toBe(true); // no card chosen yet

    pick("King of spades");
    expect((meldBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(meldBtn);
    expect(within(dialog).getByText(/Lay down your meld and discard/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    });

    await waitFor(() => expect(moveBodies).toHaveLength(1));
    expect(moveBodies[0].action).toMatchObject({
      type: "commit",
      groups: [["j1", "j2", "j3"], ["e1", "e2", "w1"]],
      discardCardId: "k1",
    });
  });

  it("shows a server rejection inside the drawer and keeps it (and the staged groups) on screen", async () => {
    moveResponse = () => ({ status: 409, body: { error: "that meld doesn't complete this round's contract" } });
    const dialog = await openDrawerAndStageContract();

    pick("King of spades");
    fireEvent.click(within(dialog).getByRole("button", { name: "Meld & discard" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
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
  });

  it("holds back the discard step while staged groups don't match the contract yet", async () => {
    moveResponse = () => ({ status: 200, body: { status: "active", view: VIEW } });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Jump to your hand" }));
    const dialog = await screen.findByRole("dialog");
    for (const l of ["Jack of hearts", "Jack of spades", "Jack of clubs"]) pick(l);
    fireEvent.click(within(dialog).getByRole("button", { name: "Group selected cards" }));
    pick("King of spades");

    expect(within(dialog).getByText(/don't match this round's contract yet/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Discard selected card" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
