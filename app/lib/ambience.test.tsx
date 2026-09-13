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

// A rotation no longer fires at a flat SONG_DURATION_MS — it waits for the
// currently-playing voice to also finish its own chord phrase first (see
// ambience.ts's msUntilPhraseEnd), so a song beginning its rotation timer
// can take up to roughly its own full chord progression longer to actually
// crossfade. Computed from the song data itself (not hand-copied) so this
// stays correct if the chords/noteMs ever change.
function worstCasePhraseMs(song: { noteMs: number; chords: { arp: number[]; repeats: number }[] }): number {
  const totalNotes = song.chords.reduce((sum, c) => sum + c.arp.length * c.repeats, 0);
  return totalNotes * song.noteMs;
}

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

  it("waits for the current song's own chord phrase to resolve before crossfading, not a flat 3 minutes", async () => {
    // The bug this guards: crossfading at a flat SONG_DURATION_MS landed at
    // an arbitrary point in whichever chord happened to be playing, so the
    // outgoing and incoming songs could clash on unrelated chords rather
    // than the outgoing one resolving into the incoming one's tonic.
    vi.useFakeTimers();
    try {
      const { startAmbience, AMBIENT_SONGS } = await import("./ambience");
      startAmbience();
      const firstBass = lastContext!.createOscillator.mock.results[0].value as FakeOscillator;

      // Right at the 3-minute floor — song 0 (Arpeggio) is nowhere near the
      // end of its own 8-chord phrase this soon, so nothing should have
      // crossfaded yet.
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      expect(lastContext!.createBiquadFilter).toHaveBeenCalledTimes(1);
      expect(firstBass.stop).not.toHaveBeenCalled();

      // Now past the floor *and* the longest this phrase could still take.
      await vi.advanceTimersByTimeAsync(worstCasePhraseMs(AMBIENT_SONGS[0]) + 1000);
      expect(lastContext!.createBiquadFilter.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(firstBass.stop).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rotates into a new song every 3 minutes, crossfading rather than cutting the old one off", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience, AMBIENT_SONGS } = await import("./ambience");
      startAmbience();
      const firstBass = lastContext!.createOscillator.mock.results[0].value as FakeOscillator;
      expect(lastContext!.createBiquadFilter).toHaveBeenCalledTimes(1);
      expect(firstBass.stop).not.toHaveBeenCalled();

      // Comfortably past the module's own 3-minute rotation floor, plus the
      // longest this song's own chord phrase could still take to resolve
      // (see msUntilPhraseEnd), plus the crossfade length that follows it.
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + worstCasePhraseMs(AMBIENT_SONGS[0]) + 5000);

      // A second voice — its own filter/delay graph — has started for the
      // incoming song, and the outgoing one's bass root has actually been
      // torn down (not left playing forever underneath the new one).
      expect(lastContext!.createBiquadFilter.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(firstBass.stop).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ping-pongs forward through all ten songs then back, instead of wrapping straight to the first", async () => {
    vi.useFakeTimers();
    try {
      const { startAmbience, AMBIENT_SONGS } = await import("./ambience");
      startAmbience();

      // 11 rotation firings: song index 0,1,2,...,9 (forward through all
      // ten), then turns around into 8, 7 — never straight back to 0. Each
      // waits up to its own *currently playing* song's full phrase length
      // past the 3-minute floor (see msUntilPhraseEnd) — summing each
      // step's own worst case (rather than the longest song's for every
      // step) so this lands just past exactly 11 rotations, not 12.
      const fromSongIndexPerRotation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8];
      const totalWaitMs = fromSongIndexPerRotation.reduce(
        (sum, i) => sum + 3 * 60 * 1000 + worstCasePhraseMs(AMBIENT_SONGS[i]),
        2000
      );
      await vi.advanceTimersByTimeAsync(totalWaitMs);

      // Every song's bass root sits at or below 220Hz (A3); every arpeggio
      // note and sparkle sits at C4 (261.63Hz) or higher — so filtering by
      // that boundary reliably picks out just the one-per-voice bass roots,
      // in the order each voice (song) was started.
      const bassRoots = lastContext!.createOscillator.mock.results
        .map((r) => (r.value as FakeOscillator).frequency.value)
        .filter((f) => f > 0 && f <= 220);

      // The initial voice plus 11 rotations.
      expect(bassRoots.length).toBe(12);
      // Forward leg: every song's own first chord root, index 0 through 9.
      expect(bassRoots.slice(0, 10)).toEqual(AMBIENT_SONGS.map((s) => s.chords[0].root));
      // Turnaround: back into song 8 then song 7 — not a wrap to song 0,
      // even though song 0 and song 7 happen to share the same root (both
      // start on C), this is really index 8's distinct root that proves it.
      expect(bassRoots[10]).toBe(AMBIENT_SONGS[8].chords[0].root);
      expect(bassRoots[11]).toBe(AMBIENT_SONGS[7].chords[0].root);
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
