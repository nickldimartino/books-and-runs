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
  destination = fakeNode();
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());
  createBiquadFilter = vi.fn(() => new FakeFilter());
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
