import { describe, expect, it } from "vitest";
import { applyResign, dealGame } from "./adapter";
import { autoPlayTurn } from "./autoPlay";
import {
  DEFAULT_TURN_LIMIT_HOURS,
  expiryAction,
  formatRemaining,
  normalizeTurnLimit,
  timerState,
} from "./turnTimer";
import { checkEmoteRate, EMOTE_BURST_LIMIT, EMOTE_COOLDOWN_MS, EMOTE_IDS, isEmoteId } from "./emotes";
import type { MpConfig } from "./types";

const H = 3_600_000;

describe("normalizeTurnLimit", () => {
  it("accepts the offered options, including explicit off", () => {
    for (const v of [0, 24, 48, 72]) expect(normalizeTurnLimit(v)).toBe(v);
  });
  it("falls back to the default for anything else", () => {
    for (const v of [undefined, null, "24", 5, -1, 1e9, NaN, {}, [], 72.5]) {
      expect(normalizeTurnLimit(v)).toBe(DEFAULT_TURN_LIMIT_HOURS);
    }
  });
});

describe("timerState", () => {
  const t0 = 1_000_000_000_000;
  it("is off without a limit or start", () => {
    expect(timerState(t0, t0, 0).phase).toBe("off");
    expect(timerState(t0, null, 72).phase).toBe("off");
    expect(timerState(t0, t0, null).phase).toBe("off");
  });
  it("moves ok → warn at 75% → expired at 100%", () => {
    expect(timerState(t0 + 10 * H, t0, 24).phase).toBe("ok");
    expect(timerState(t0 + 18 * H, t0, 24).phase).toBe("warn");
    expect(timerState(t0 + 24 * H - 1, t0, 24).phase).toBe("warn");
    const e = timerState(t0 + 24 * H, t0, 24);
    expect(e.phase).toBe("expired");
    expect(e.remainingMs).toBe(0);
    expect(timerState(t0 + 90 * H, t0, 24).remainingMs).toBe(0);
  });
  it("reports remaining time and the deadline", () => {
    const s = timerState(t0 + 4 * H, t0, 24);
    expect(s.remainingMs).toBe(20 * H);
    expect(s.deadlineMs).toBe(t0 + 24 * H);
  });
  it("a clock that starts in the future (skewed) never shows more than the limit", () => {
    expect(timerState(t0, t0 + 2 * H, 24).phase).toBe("ok");
  });
});

describe("expiryAction / formatRemaining", () => {
  it("auto-plays the first miss and forfeits the second in a row", () => {
    expect(expiryAction(0)).toBe("autoplay");
    expect(expiryAction(1)).toBe("resign");
    expect(expiryAction(5)).toBe("resign");
  });
  it("rounds up into minutes / hours / days", () => {
    expect(formatRemaining(30_000)).toEqual({ unit: "minutes", value: 1 });
    expect(formatRemaining(59 * 60_000)).toEqual({ unit: "minutes", value: 59 });
    expect(formatRemaining(14 * H - 1)).toEqual({ unit: "hours", value: 14 });
    expect(formatRemaining(47 * H)).toEqual({ unit: "hours", value: 47 });
    expect(formatRemaining(50 * H)).toEqual({ unit: "days", value: 3 });
    expect(formatRemaining(0)).toEqual({ unit: "minutes", value: 1 });
  });
});

function twoHumans(): MpConfig {
  return {
    contractRounds: [1, 2, 3],
    seats: [
      { seat: 0, kind: "human", userId: "u0", name: "A" },
      { seat: 1, kind: "human", userId: "u1", name: "B" },
    ],
  };
}

describe("autoPlayTurn", () => {
  it("draws from the stock and discards a non-wild high card, passing the turn", () => {
    const eng = dealGame(twoHumans());
    const seat = eng.state.currentPlayerIndex;
    const before = eng.state.players[seat].hand.length;
    const res = autoPlayTurn(eng, seat);
    expect(res.error).toBeUndefined();
    const s = res.engine.state;
    expect(s.players[seat].hand.length).toBe(before); // +1 draw, -1 discard
    expect(s.currentPlayerIndex).not.toBe(seat);
    expect(res.engine.turnDrawn).toBe(false);
    expect(s.players[seat].hasMeldedContract).toBe(false); // never melds for them
  });
  it("continues a half-finished turn (already drew) without drawing again", () => {
    const eng = dealGame(twoHumans());
    const seat = eng.state.currentPlayerIndex;
    const stock = structuredClone(eng);
    stock.turnDrawn = true;
    stock.state.players[seat].hand.push(stock.state.drawPile.pop()!);
    const size = stock.state.players[seat].hand.length;
    const res = autoPlayTurn(stock, seat);
    expect(res.error).toBeUndefined();
    expect(res.engine.state.players[seat].hand.length).toBe(size - 1);
  });
  it("refuses when it isn't that seat's turn or the game is over", () => {
    const eng = dealGame(twoHumans());
    const other = 1 - eng.state.currentPlayerIndex;
    expect(autoPlayTurn(eng, other).error).toBeTruthy();
    const done = structuredClone(eng);
    done.state.gameOver = true;
    expect(autoPlayTurn(done, done.state.currentPlayerIndex).error).toBeTruthy();
  });
  it("never discards a wild while a non-wild card is available", () => {
    const eng = dealGame(twoHumans());
    const seat = eng.state.currentPlayerIndex;
    eng.state.players[seat].hand = eng.state.players[seat].hand.map((c, i) =>
      i === 0 ? { ...c, rank: "JOKER", suit: "joker", isWild: true } : c
    );
    const jokerId = eng.state.players[seat].hand[0].id;
    const res = autoPlayTurn(eng, seat);
    expect(res.engine.state.players[seat].hand.some((c) => c.id === jokerId)).toBe(true);
  });
  it("resigning after a second miss ends a 2-human game", () => {
    const eng = dealGame(twoHumans());
    const done = applyResign(eng, twoHumans(), eng.state.currentPlayerIndex);
    expect(done.state.gameOver).toBe(true);
  });
});

describe("emotes", () => {
  it("only accepts the fixed preset ids", () => {
    for (const id of EMOTE_IDS) expect(isEmoteId(id)).toBe(true);
    for (const bad of ["", "NICE_MELD", "<script>", 3, null, undefined, "nice_meld "]) expect(isEmoteId(bad)).toBe(false);
  });
  it("enforces a cooldown and a burst cap", () => {
    const now = 10_000_000;
    expect(checkEmoteRate([], now)).toEqual({ ok: true });
    expect(checkEmoteRate([now - EMOTE_COOLDOWN_MS + 1], now)).toEqual({ ok: false, reason: "cooldown" });
    expect(checkEmoteRate([now - EMOTE_COOLDOWN_MS], now)).toEqual({ ok: true });
    const burst = Array.from({ length: EMOTE_BURST_LIMIT }, (_, i) => now - 60_000 - i * 10_000);
    expect(checkEmoteRate(burst, now)).toEqual({ ok: false, reason: "burst" });
    expect(checkEmoteRate(burst.map((t) => t - 11 * 60_000), now)).toEqual({ ok: true });
  });
});

describe("migration 0061 mirror", () => {
  it("allows exactly the emote ids the client/server accept", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../supabase/migrations/0061_mp_turn_timer_emotes.sql", import.meta.url), "utf8");
    for (const id of EMOTE_IDS) expect(sql).toContain(`'${id}'`);
    for (const h of [0, 24, 48, 72]) expect(sql).toContain(String(h));
  });
});
