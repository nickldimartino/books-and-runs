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
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(function AudioContextCtor() {
    lastContext = new FakeAudioContext();
    return lastContext;
  });
});

afterEach(() => {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, "AudioContext");
  window.localStorage.clear();
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

  it("keeps every chord — phrase A's 4-note pattern and phrase B's longer one alike — to the same ~4.56s bar", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();
      const bassOsc = lastContext!.createOscillator.mock.results[0].value as FakeOscillator;

      // 8 chords in the full cycle (see CHORDS) — advance through all of
      // them and count how many times the bass root glides. Each chord's
      // own repeats count is tuned so every bar is exactly 12 notes long
      // regardless of its pattern's length, so this should land on exactly
      // 8 glides (the 8th being the wrap back to chord 0), not drift.
      await vi.advanceTimersByTimeAsync(8 * 4560 + 200);

      expect(bassOsc.frequency.linearRampToValueAtTime.mock.calls.length).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rotates into a new song every 3 minutes, crossfading rather than cutting the old one off", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();
      const firstBass = lastContext!.createOscillator.mock.results[0].value as FakeOscillator;
      expect(lastContext!.createBiquadFilter).toHaveBeenCalledTimes(1);
      expect(firstBass.stop).not.toHaveBeenCalled();

      // Comfortably past the module's own 3-minute rotation interval, plus
      // the crossfade length that follows it.
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 5000);

      // A second voice — its own filter/delay graph — has started for the
      // incoming song, and the outgoing one's bass root has actually been
      // torn down (not left playing forever underneath the new one).
      expect(lastContext!.createBiquadFilter.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(firstBass.stop).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("wraps from the third song back to the first after three rotations", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience } = await import("./ambience");
      startAmbience();

      await vi.advanceTimersByTimeAsync(3 * (3 * 60 * 1000 + 5000));

      // Every song's bass root sits at or below 220Hz (A3); every arpeggio
      // note and sparkle sits at C4 (261.63Hz) or higher — so filtering by
      // that boundary reliably picks out just the one-per-voice bass roots.
      const bassRoots = lastContext!.createOscillator.mock.results
        .map((r) => (r.value as FakeOscillator).frequency.value)
        .filter((f) => f > 0 && f <= 220);

      // Song 1 ("Arpeggio")'s own first chord root (C3, 130.81Hz) is unique
      // to it — neither "Bounce" nor "Skip" starts on C — so it reappearing
      // is proof the rotation wrapped song 0 -> 1 -> 2 -> back to 0, not
      // just proof of the very first voice at start.
      const song1RootCount = bassRoots.filter((f) => f === 130.81).length;
      expect(song1RootCount).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pins to just one song (no rotation) when Settings has chosen one instead of \"rotate\"", async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem("booksAndRuns:settings", JSON.stringify({ ambientTrack: "bounce" }));
      const { startAmbience } = await import("./ambience");
      startAmbience();

      // Past what would have been a full rotation interval, had one been
      // scheduled.
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 5000);

      // Still exactly one voice's worth of filter/delay graph — no second
      // song ever started.
      expect(lastContext!.createBiquadFilter).toHaveBeenCalledTimes(1);
      const firstBass = lastContext!.createOscillator.mock.results[0].value as FakeOscillator;
      expect(firstBass.stop).not.toHaveBeenCalled();
      // "Bounce" was the one actually requested, not the rotation's default
      // starting point (song 0, "Arpeggio").
      expect(firstBass.frequency.value).toBe(174.61);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("previewSong / stopPreview", () => {
    it("plays a specific song independent of the real startAmbience/isAmbiencePlaying state", async () => {
      const { previewSong, isAmbiencePlaying, isPreviewing } = await import("./ambience");
      expect(isAmbiencePlaying()).toBe(false);

      previewSong("skip");

      expect(isPreviewing("skip")).toBe(true);
      expect(isPreviewing("bounce")).toBe(false);
      // A preview is deliberately not "ambience playing" — it's a Settings-
      // page audition, not the real in-game loop.
      expect(isAmbiencePlaying()).toBe(false);
      // Its own gain node (destination) plus the voice's own graph — same
      // shape as a real voice, just not routed through masterGain.
      expect(lastContext!.createBiquadFilter).toHaveBeenCalledTimes(1);
    });

    it("switching to a different preview tears down the first one", async () => {
      vi.useFakeTimers();
      try {
        const { previewSong, isPreviewing } = await import("./ambience");
        previewSong("bounce");
        const firstBass = lastContext!.createOscillator.mock.results[0].value as FakeOscillator;

        previewSong("skip");
        expect(isPreviewing("skip")).toBe(true);
        expect(isPreviewing("bounce")).toBe(false);

        // The outgoing preview's own short fade-out (300ms) plus its
        // buffer before the oscillator is actually stopped.
        await vi.advanceTimersByTimeAsync(500);
        expect(firstBass.stop).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("stopPreview is a harmless no-op when nothing is previewing", async () => {
      const { stopPreview, isPreviewing } = await import("./ambience");
      expect(() => stopPreview()).not.toThrow();
      expect(isPreviewing()).toBe(false);
    });
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
