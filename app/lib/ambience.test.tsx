// @vitest-environment jsdom

// Exercises ambience.ts against a fake AudioContext (jsdom has no real Web
// Audio implementation) — mainly that start/stop/idempotency and the
// supported-browser check behave, not the actual sound.

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

class FakeAudioContext {
  state: "running" | "suspended" = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = fakeNode();
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());
  createBiquadFilter = vi.fn(() => new FakeFilter());
  createConvolver = vi.fn(() => ({ buffer: null, connect: vi.fn(() => fakeNode()) }));
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));
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

  it("starts the pad, building the oscillator graph", async () => {
    const { startAmbience, isAmbiencePlaying } = await import("./ambience");
    expect(isAmbiencePlaying()).toBe(false);

    startAmbience();

    expect(isAmbiencePlaying()).toBe(true);
    expect(lastContext).not.toBeNull();
    // One oscillator + one detune LFO per chord voice (4 voices), plus the
    // filter's own sweep LFO.
    expect(lastContext!.createOscillator).toHaveBeenCalledTimes(9);
    expect(lastContext!.createBiquadFilter).toHaveBeenCalledTimes(1);
    // The synthetic reverb — one impulse-response buffer fed to one
    // ConvolverNode, built once at start.
    expect(lastContext!.createConvolver).toHaveBeenCalledTimes(1);
    expect(lastContext!.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("glides every pad voice to the next chord once the hold period elapses", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();
      const oscillatorsAtStart = lastContext!.createOscillator.mock.results.map((r) => r.value as FakeOscillator);

      // Hold (20s) + morph (5s), from the module's own constants — none of
      // these oscillators' frequencies have been touched since creation.
      await vi.advanceTimersByTimeAsync(25_000);

      const glided = oscillatorsAtStart.filter((osc) => osc.frequency.linearRampToValueAtTime.mock.calls.length > 0);
      // Exactly the 4 pad voices glide on a chord change — their detune
      // LFOs and the filter-sweep LFO never touch .frequency.
      expect(glided).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("occasionally drops in a sparse melody note", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();
      const oscillatorsAtStart = lastContext!.createOscillator.mock.calls.length;

      // Comfortably past the module's own max melody-note delay (14s).
      await vi.advanceTimersByTimeAsync(15_000);

      expect(lastContext!.createOscillator.mock.calls.length).toBeGreaterThan(oscillatorsAtStart);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() cancels pending chord/melody timers — nothing fires afterward", async () => {
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
