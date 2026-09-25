// @vitest-environment jsdom

// Tests useMpGame's own orchestration — request shapes, view parsing, the
// turn draft, and the sound/haptic feedback added alongside multiplayer's
// sound gap — against a mocked `fetch` and a stub Supabase client, rather
// than a live Edge Function. Everything the hook reaches beyond fetch
// (achievement progress snapshotting, sound/haptics) is mocked out so
// failures here point at useMpGame itself, not those modules. Stats/
// achievement-counter crediting itself now happens server-side (see
// mp/index.ts) — nothing left here to mock for that.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Card } from "@/types";
import type { RedactedView } from "@/mp/types";
import { EMPTY_PROGRESS_STATE } from "@/achievements";

const playCardTap = vi.fn();
const playMeld = vi.fn();
const playRoundWin = vi.fn();
const playGameWin = vi.fn();
const hapticLight = vi.fn();
const hapticMedium = vi.fn();
const hapticSuccess = vi.fn();

vi.mock("./sound", () => ({ playCardTap, playMeld, playRoundWin, playGameWin }));
vi.mock("./haptics", () => ({ hapticLight, hapticMedium, hapticSuccess }));
vi.mock("./loadAchievementProgress", () => ({
  loadAchievementProgressState: vi.fn().mockResolvedValue(EMPTY_PROGRESS_STATE),
}));

const ME = "u-me";
vi.mock("../AuthContext", () => ({ useAuth: () => ({ user: { id: ME } }) }));

function makeChannel() {
  const channel: Record<string, unknown> = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  channel.send = vi.fn();
  return channel;
}

const fakeSupabase = {
  auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })) },
  channel: vi.fn(() => makeChannel()),
  removeChannel: vi.fn(),
};

vi.mock("./supabaseClient", () => ({ supabase: fakeSupabase }));

// Imported after the mocks above so useMpGame picks up the mocked modules.
const { useMpGame } = await import("./useMpGame");

function card(id: string, rank: string, suit: Card["suit"] = "clubs"): Card {
  return { id, rank: rank as Card["rank"], suit, isWild: rank === "2" };
}

const BASE_VIEW: RedactedView = {
  round: 1,
  roundLabel: "1 Book",
  totalRounds: 7,
  contractRounds: [1],
  contract: { books: 1, runs: 0, bookSize: 3, runSize: 3, wholeHandMeld: false },
  players: [
    { seat: 0, name: "Me", isAI: false, userId: ME, handCount: 6, hasMeldedContract: false, cumulativeScore: 0, resigned: false },
    { seat: 1, name: "Ari", isAI: false, userId: "u-ari", handCount: 6, hasMeldedContract: false, cumulativeScore: 0, resigned: false },
  ],
  yourSeat: 0,
  yourHand: [card("c1", "7"), card("c2", "7", "diamonds"), card("c3", "7", "spades"), card("c4", "K", "hearts")],
  currentSeat: 0,
  currentUserId: ME,
  yourTurn: true,
  youHaveDrawn: true,
  drawPileCount: 40,
  discardPile: [],
  discardTop: null,
  melds: [],
  discardHistory: [],
  pickupHistory: [],
  roundOver: false,
  gameOver: false,
  winnerSeat: null,
  roundResults: [],
};

type Handler = () => { status?: number; body: unknown };

function installFetch(handlers: Record<string, Handler>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("/").filter(Boolean).pop()!;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ path, body });
    const handler = handlers[path];
    if (!handler) throw new Error(`useMpGame test: no fetch handler installed for "${path}"`);
    const { status = 200, body: respBody } = handler();
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => respBody,
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMpGame — loading state", () => {
  it("surfaces a pending game and its participants", async () => {
    installFetch({
      state: () => ({
        body: {
          status: "pending",
          seats: [{ seat: 0, kind: "human", userId: ME, name: "Me" }],
          host_id: ME,
          contract_rounds: [1],
          participants: [{ user_id: ME, seat: 0, invite_status: "accepted" }],
        },
      }),
    });

    const { result } = renderHook(() => useMpGame("game-1"));

    await waitFor(() => expect(result.current.status).toBe("pending"));
    expect(result.current.pending?.host_id).toBe(ME);
    expect(result.current.view).toBeNull();
  });

  it("parses a valid active view", async () => {
    installFetch({ state: () => ({ body: { status: "active", view: BASE_VIEW, updated_at: "2026-01-01T00:00:00Z" } }) });

    const { result } = renderHook(() => useMpGame("game-1"));

    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(result.current.view?.round).toBe(1);
    expect(result.current.myTurn).toBe(true);
    expect(result.current.youHaveDrawn).toBe(true);
  });

  it("surfaces a malformed server view as a clean error instead of crashing", async () => {
    installFetch({
      state: () => ({ body: { status: "active", view: { round: "not-a-number" } } }),
    });

    const { result } = renderHook(() => useMpGame("game-1"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/looked wrong/i);
    expect(result.current.view).toBeNull();
  });

  it("does nothing when there's no game id", () => {
    const { result } = renderHook(() => useMpGame(null));
    expect(result.current.status).toBe("loading");
    expect(result.current.view).toBeNull();
  });
});

describe("useMpGame — draw", () => {
  it("posts to /move and gives tap feedback on success", async () => {
    const calls = installFetch({
      state: () => ({ body: { status: "active", view: BASE_VIEW } }),
      move: () => ({ body: { status: "active", view: { ...BASE_VIEW, youHaveDrawn: true }, drawnCard: { id: "c5" } } }),
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    await act(async () => {
      await result.current.draw("stock");
    });

    const moveCall = calls.find((c) => c.path === "move");
    expect(moveCall?.body).toMatchObject({ game_id: "game-1", action: { type: "draw", from: "stock" } });
    expect(playCardTap).toHaveBeenCalled();
    expect(hapticLight).toHaveBeenCalled();
  });

  it("does not play a sound when the draw fails", async () => {
    // The failure path also reconciles with a fresh /state fetch (see
    // run()'s catch in useMpGame.ts) — fail that one too so the surfaced
    // error isn't immediately cleared out from under the assertion below.
    installFetch({
      state: () => ({ status: 500, body: { error: "server unavailable" } }),
      move: () => ({ status: 409, body: { error: "not your turn" } }),
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    await act(async () => {
      await result.current.draw("stock");
    });

    expect(playCardTap).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });
});

describe("useMpGame — staging and committing a turn", () => {
  it("stageGroup validates a real book against the contract", async () => {
    installFetch({ state: () => ({ body: { status: "active", view: BASE_VIEW } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => {
      result.current.toggleCard("c1");
      result.current.toggleCard("c2");
      result.current.toggleCard("c3");
    });
    expect(result.current.selectedIds).toEqual(["c1", "c2", "c3"]);

    act(() => result.current.stageGroup());

    expect(result.current.groupError).toBeNull();
    expect(result.current.draft.groups).toHaveLength(1);
    expect(result.current.draft.groups[0]).toMatchObject({ type: "book", cardIds: ["c1", "c2", "c3"] });
    // Staged cards drop out of the visible hand until committed or unstaged.
    expect(result.current.visibleHand.map((c) => c.id)).not.toContain("c1");
  });

  it("rejects an invalid group with a reason instead of staging it", async () => {
    installFetch({ state: () => ({ body: { status: "active", view: BASE_VIEW } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => result.current.toggleCard("c1")); // a lone 7 — not a complete book
    act(() => result.current.stageGroup());

    expect(result.current.draft.groups).toHaveLength(0);
    expect(result.current.groupError).toBeTruthy();
  });

  it("commitTurn with a staged meld plays the meld sound, not the tap sound", async () => {
    const calls = installFetch({
      state: () => ({ body: { status: "active", view: BASE_VIEW } }),
      move: () => ({ body: { status: "active", view: { ...BASE_VIEW, melds: [] } } }),
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => {
      result.current.toggleCard("c1");
      result.current.toggleCard("c2");
      result.current.toggleCard("c3");
    });
    act(() => result.current.stageGroup());

    await act(async () => {
      await result.current.commitTurn();
    });

    const moveCall = calls.find((c) => c.path === "move");
    expect(moveCall?.body).toMatchObject({
      game_id: "game-1",
      action: { type: "commit", groups: [["c1", "c2", "c3"]] },
    });
    expect(playMeld).toHaveBeenCalled();
    expect(hapticMedium).toHaveBeenCalled();
    expect(playCardTap).not.toHaveBeenCalled();
  });

  it("commitTurn with only a discard plays the tap sound, not the meld sound", async () => {
    installFetch({
      state: () => ({ body: { status: "active", view: BASE_VIEW } }),
      move: () => ({ body: { status: "active", view: BASE_VIEW } }),
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => result.current.setDiscard("c4"));
    await act(async () => {
      await result.current.commitTurn();
    });

    expect(playCardTap).toHaveBeenCalled();
    expect(hapticLight).toHaveBeenCalled();
    expect(playMeld).not.toHaveBeenCalled();
  });
});

describe("useMpGame — round and game over", () => {
  it("plays the round-win chime exactly once on a roundOver transition", async () => {
    let view = BASE_VIEW;
    installFetch({ state: () => ({ body: { status: "active", view } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(playRoundWin).not.toHaveBeenCalled();

    view = { ...BASE_VIEW, roundOver: true };
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.view?.roundOver).toBe(true));

    expect(playRoundWin).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(playGameWin).not.toHaveBeenCalled();

    // Refreshing again while still roundOver doesn't replay the chime.
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.view?.roundOver).toBe(true));
    expect(playRoundWin).toHaveBeenCalledTimes(1);
  });

  it("plays the game-win chime instead when the game itself ends", async () => {
    let view = BASE_VIEW;
    installFetch({ state: () => ({ body: { status: "complete", view } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("complete"));

    view = { ...BASE_VIEW, gameOver: true, roundOver: true, winnerSeat: 0 };
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.view?.gameOver).toBe(true));

    expect(playGameWin).toHaveBeenCalledTimes(1);
    expect(playRoundWin).not.toHaveBeenCalled();
  });
});

describe("useMpGame — nudge, cancel", () => {
  it("nudge() posts to the nudge RPC via supabase and gives feedback on success", async () => {
    installFetch({ state: () => ({ body: { status: "active", view: BASE_VIEW } }) });
    const rpc = vi.fn(async () => ({ error: null }));
    (fakeSupabase as unknown as { rpc: typeof rpc }).rpc = rpc;
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    await act(async () => {
      await result.current.nudge();
    });

    expect(rpc).toHaveBeenCalledWith("mp_nudge", { p_game_id: "game-1" });
    expect(result.current.nudgeState).toBe("sent");
    expect(playCardTap).toHaveBeenCalled();
  });

  it("cancelPending() posts to /cancel and refreshes to the cancelled status", async () => {
    let cancelled = false;
    const calls = installFetch({
      state: () => (cancelled ? { body: { status: "cancelled" } } : { body: { status: "pending", seats: [], host_id: ME, contract_rounds: [1], participants: [] } }),
      cancel: () => {
        cancelled = true;
        return { body: { status: "cancelled" } };
      },
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("pending"));

    await act(async () => {
      await result.current.cancelPending();
    });

    expect(calls.some((c) => c.path === "cancel" && c.body.game_id === "game-1")).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("cancelled"));
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("useMpGame — stable, ordered state (multiplayer smoothness)", () => {
  it("keeps the same view/hand identities when a refresh returns identical content", async () => {
    installFetch({ state: () => ({ body: { status: "active", view: JSON.parse(JSON.stringify(BASE_VIEW)) } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));
    const view0 = result.current.view;
    const hand0 = result.current.visibleHand;

    await act(async () => result.current.refresh());
    await act(async () => result.current.refresh());

    expect(result.current.view).toBe(view0);
    expect(result.current.visibleHand).toBe(hand0);
  });

  it("keeps hand card identities when only another part of the view changes", async () => {
    let discardTop: Card | null = null;
    installFetch({
      state: () => ({
        body: {
          status: "active",
          view: JSON.parse(JSON.stringify({ ...BASE_VIEW, discardTop, discardPile: discardTop ? [discardTop] : [] })),
        },
      }),
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));
    const hand0 = result.current.view!.yourHand;
    const firstCard = hand0[0];

    discardTop = card("d9", "9");
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.view?.discardTop?.id).toBe("d9"));

    expect(result.current.view!.yourHand).toBe(hand0);
    expect(result.current.view!.yourHand[0]).toBe(firstCard);
  });

  it("drops a stale refresh that resolves after your own move's response", async () => {
    const pre = { ...BASE_VIEW, youHaveDrawn: false };
    const post = { ...BASE_VIEW, youHaveDrawn: true, yourHand: [...BASE_VIEW.yourHand, card("c9", "Q")] };
    const slow = deferred<void>();
    let stateCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url).split("/").filter(Boolean).pop()!;
        if (path === "state") {
          stateCalls++;
          if (stateCalls === 2) {
            // The realtime-triggered refresh: server snapshot from BEFORE the draw, delivered late.
            await slow.promise;
            return { ok: true, status: 200, json: async () => ({ status: "active", view: pre }) } as Response;
          }
          return { ok: true, status: 200, json: async () => ({ status: "active", view: stateCalls === 1 ? pre : post }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ status: "active", view: post, drawnCard: { id: "c9" } }) } as Response;
      })
    );
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => result.current.refresh()); // starts, then stalls
    await act(async () => {
      await result.current.draw("stock");
    });
    expect(result.current.youHaveDrawn).toBe(true);
    expect(result.current.lastDrawnCardId).toBe("c9");

    await act(async () => {
      slow.resolve();
      await new Promise((r) => setTimeout(r, 20));
    });

    // The late pre-draw snapshot must not roll the board back (hand loses the
    // drawn card, draft wiped) — and the re-issued refresh converges on `post`.
    expect(result.current.youHaveDrawn).toBe(true);
    expect(result.current.view!.yourHand.map((c) => c.id)).toContain("c9");
  });

  it("does not wipe a staged draft when an equal refresh lands", async () => {
    installFetch({ state: () => ({ body: { status: "active", view: JSON.parse(JSON.stringify(BASE_VIEW)) } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));
    act(() => {
      result.current.toggleCard("c1");
      result.current.toggleCard("c2");
      result.current.toggleCard("c3");
    });
    act(() => result.current.stageGroup());
    expect(result.current.draft.groups).toHaveLength(1);

    await act(async () => result.current.refresh());
    await act(async () => result.current.refresh());

    expect(result.current.draft.groups).toHaveLength(1);
    expect(result.current.contractStaged).toBe(true);
  });

  it("surfaces a rejected commit and keeps it (and the draft) through the reconciling refresh", async () => {
    installFetch({
      state: () => ({ body: { status: "active", view: BASE_VIEW } }),
      move: () => ({ status: 409, body: { error: "that meld doesn't complete this round's contract" } }),
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));
    act(() => {
      result.current.toggleCard("c1");
      result.current.toggleCard("c2");
      result.current.toggleCard("c3");
    });
    act(() => result.current.stageGroup());

    await act(async () => {
      await result.current.commitTurn({ discardCardId: "c4" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30)); // let the reconcile refresh land
    });

    expect(result.current.error).toMatch(/complete this round's contract/);
    expect(result.current.draft.groups).toHaveLength(1);
    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });

  it("keeps the board up (soft sync error) when a background refresh fails", async () => {
    let fail = false;
    installFetch({
      state: () => (fail ? { status: 500, body: { error: "boom" } } : { body: { status: "active", view: BASE_VIEW } }),
    });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    fail = true;
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.syncFailed).toBe(true));
    expect(result.current.status).toBe("active");
    expect(result.current.view).not.toBeNull();

    fail = false;
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.syncFailed).toBe(false));
  });

  it("sends only one move for a rapid double tap", async () => {
    const gate = deferred<void>();
    const moves: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url).split("/").filter(Boolean).pop()!;
        if (path === "move") {
          moves.push(JSON.parse(String(init?.body)));
          await gate.promise;
          return { ok: true, status: 200, json: async () => ({ status: "active", view: { ...BASE_VIEW, youHaveDrawn: true }, drawnCard: { id: "c1" } }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ status: "active", view: { ...BASE_VIEW, youHaveDrawn: false } }) } as Response;
      })
    );
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    const first = result.current.draw("stock");
    const second = result.current.draw("stock");
    gate.resolve();
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(moves).toHaveLength(1);
  });

  it("asks where an ambiguous run's wild sits, then stages it with that choice", async () => {
    const view: RedactedView = {
      ...BASE_VIEW,
      round: 3,
      roundLabel: "2 Runs",
      contract: { books: 0, runs: 2, bookSize: 3, runSize: 4, wholeHandMeld: false },
      yourHand: [
        card("r3", "3", "hearts"),
        card("r4", "4", "hearts"),
        card("r5", "5", "hearts"),
        card("w", "2", "clubs"),
        card("x", "K", "spades"),
      ],
    };
    installFetch({ state: () => ({ body: { status: "active", view } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));

    act(() => {
      ["r3", "r4", "r5", "w"].forEach((id) => result.current.toggleCard(id));
    });
    act(() => result.current.stageGroup());
    expect(result.current.draft.groups).toHaveLength(0);
    expect(result.current.pendingRunChoice?.options.length).toBeGreaterThan(1);

    act(() => result.current.chooseRunStart(result.current.pendingRunChoice!.options[0]));
    expect(result.current.pendingRunChoice).toBeNull();
    expect(result.current.draft.groups).toHaveLength(1);
    expect(result.current.draft.groups[0].runStartIndex).toBeTypeOf("number");
  });

  it("recognises the reported hand (J,J,J + 8,8,wild-2) as a complete 2-book contract", async () => {
    const view: RedactedView = {
      ...BASE_VIEW,
      contract: { books: 2, runs: 0, bookSize: 3, runSize: 4, wholeHandMeld: false },
      yourHand: [
        card("j1", "J", "hearts"), card("j2", "J", "spades"), card("j3", "J", "clubs"),
        card("e1", "8", "hearts"), card("e2", "8", "diamonds"), card("w1", "2", "spades"),
        card("k1", "K", "spades"),
      ],
    };
    installFetch({ state: () => ({ body: { status: "active", view } }) });
    const { result } = renderHook(() => useMpGame("game-1"));
    await waitFor(() => expect(result.current.status).toBe("active"));
    act(() => ["j1", "j2", "j3"].forEach((id) => result.current.toggleCard(id)));
    act(() => result.current.stageGroup());
    act(() => ["e1", "e2", "w1"].forEach((id) => result.current.toggleCard(id)));
    act(() => result.current.stageGroup());

    expect(result.current.groupError).toBeNull();
    expect(result.current.stagedBooks).toBe(2);
    expect(result.current.contractStaged).toBe(true);
  });
});
