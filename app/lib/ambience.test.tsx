// @vitest-environment jsdom

// Exercises ambience.ts against a fake AudioContext (jsdom has no real Web
// Audio implementation) — mainly that start/stop/idempotency, the
// supported-browser check, and the arpeggio/chord/sparkle scheduling
// behave, not the actual sound.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function fakeNode() {
  return { connect: vi.fn(() => fakeNode()), disconnect: vi.fn() };
}

class FakeOscillator {
  type = "sine";
  frequency = fakeParam();
  detune = fakeParam();
  started = false;
  stopped = false;
  connect = vi.fn(() => fakeNode());
  start = vi.fn(() => {
    this.started = true;
  });
  stop = vi.fn(() => {
    if (this.stopped) throw new Error("already stopped");
    this.stopped = true;
  });
}

class FakeGain {
  gain = fakeParam();
  connect = vi.fn(() => fakeNode());
}

class FakeFilter {
  type = "lowpass";
  frequency = fakeParam();
  Q = fakeParam();
  connect = vi.fn(() => fakeNode());
}

class FakeDelay {
  delayTime = fakeParam();
  connect = vi.fn(() => fakeNode());
}

class FakeAudioContext {
  state: "running" | "suspended" = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = fakeNode();
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());
  createBiquadFilter = vi.fn(() => new FakeFilter());
  createDelay = vi.fn(() => new FakeDelay());
  resume = vi.fn(async () => {
    this.state = "running";
  });
}

let lastContext: FakeAudioContext | null = null;

beforeEach(() => {
  vi.resetModules();
  lastContext = null;
  (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(function AudioContextCtor() {
    lastContext = new FakeAudioContext();
    return lastContext;
  });
});

afterEach(() => {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, "AudioContext");
});

describe("ambience", () => {
  it("reports supported/unsupported based on AudioContext availability", async () => {
    const { isAmbienceSupported } = await import("./ambience");
    expect(isAmbienceSupported()).toBe(true);

    Reflect.deleteProperty(window as unknown as Record<string, unknown>, "AudioContext");
    vi.resetModules();
    const reimported = await import("./ambience");
    expect(reimported.isAmbienceSupported()).toBe(false);
  });

  it("starts the loop, building the bass root + the first arpeggio note", async () => {
    const { startAmbience, isAmbiencePlaying } = await import("./ambience");
    expect(isAmbiencePlaying()).toBe(false);

    startAmbience();

    expect(isAmbiencePlaying()).toBe(true);
    expect(lastContext).not.toBeNull();
    // The sustained bass root, plus the very first arpeggio note (it plays
    // immediately rather than waiting a full interval).
    expect(lastContext!.createOscillator).toHaveBeenCalledTimes(2);
    expect(lastContext!.createBiquadFilter).toHaveBeenCalledTimes(1);
    // The slap-delay standing in for reverb, built once at start.
    expect(lastContext!.createDelay).toHaveBeenCalledTimes(1);
  });

  it("plays a new arpeggio note roughly every 380ms", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();
      const oscillatorsAtStart = lastContext!.createOscillator.mock.calls.length;

      await vi.advanceTimersByTimeAsync(1200); // ~3 more notes

      expect(lastContext!.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(oscillatorsAtStart + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("glides the bass root once a full chord's worth of arpeggio notes has played", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();
      // Oscillator 0 is the sustained bass root (created before the first
      // arpeggio note).
      const bassOsc = lastContext!.createOscillator.mock.results[0].value as FakeOscillator;
      expect(bassOsc.frequency.linearRampToValueAtTime.mock.calls.length).toBe(0);

      // 4-note pattern × 3 repeats × 380ms, plus a safety margin.
      await vi.advanceTimersByTimeAsync(4600);

      expect(bassOsc.frequency.linearRampToValueAtTime.mock.calls.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("occasionally drops in a brighter sine sparkle note above the triangle arpeggio", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();

      // Comfortably past the module's own max sparkle delay (9s) — one is
      // guaranteed to have fired by now.
      await vi.advanceTimersByTimeAsync(9500);

      const sineOscillators = lastContext!.createOscillator.mock.results.filter(
        (r) => (r.value as FakeOscillator).type === "sine"
      );
      // The sustained bass root is also a sine oscillator — a sparkle note
      // means there's at least one more beyond it.
      expect(sineOscillators.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() cancels pending arpeggio/sparkle timers — nothing fires afterward", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience, stopAmbience } = await import("./ambience");
      startAmbience();
      stopAmbience();
      const oscillatorsAfterStop = lastContext!.createOscillator.mock.calls.length;

      await vi.advanceTimersByTimeAsync(60_000);

      expect(lastContext!.createOscillator.mock.calls.length).toBe(oscillatorsAfterStop);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is idempotent — calling start again while playing doesn't rebuild the graph", async () => {
    const { startAmbience } = await import("./ambience");
    startAmbience();
    const callsAfterFirstStart = lastContext!.createOscillator.mock.calls.length;

    startAmbience();

    expect(lastContext!.createOscillator.mock.calls.length).toBe(callsAfterFirstStart);
  });

  it("stop() flips isAmbiencePlaying() off immediately", async () => {
    const { startAmbience, stopAmbience, isAmbiencePlaying } = await import("./ambience");
    startAmbience();
    expect(isAmbiencePlaying()).toBe(true);

    stopAmbience();

    expect(isAmbiencePlaying()).toBe(false);
  });

  it("stop() without a prior start() is a harmless no-op", async () => {
    const { stopAmbience, isAmbiencePlaying } = await import("./ambience");
    expect(() => stopAmbience()).not.toThrow();
    expect(isAmbiencePlaying()).toBe(false);
  });

  it("does nothing when the browser has no Web Audio support", async () => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, "AudioContext");
    vi.resetModules();
    const { startAmbience, isAmbiencePlaying } = await import("./ambience");

    expect(() => startAmbience()).not.toThrow();
    expect(isAmbiencePlaying()).toBe(false);
  });
});
