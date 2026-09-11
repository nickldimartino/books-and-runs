import { loadLocalSettings } from "./settingsStore";

/**
 * Optional generative background music for the game screens — synthesized
 * entirely with the Web Audio API (same "no audio files, no licensing,
 * works offline" approach sound.ts already uses for SFX). Earlier versions
 * of this were a sustained multi-voice pad — first a D-minor drone, then a
 * brighter C-major one — but a held, reverb-soaked pad chord reads as
 * ambient/exploration-game or choir music no matter how bright its key is,
 * which isn't the right mood for a card game. This version drops the pad
 * almost entirely: a light, bouncy arpeggio is the whole texture, with one
 * quiet sustained root note underneath for warmth and an occasional bright
 * sine "sparkle" note on top. A short slap-delay stands in for reverb —
 * enough space to not sound dry, not enough to read as a cathedral. Calm,
 * not dance-tempo, but constantly moving rather than held.
 *
 * Three songs (SONGS below) rotate through, 3–5 minutes each, so a long
 * session doesn't loop the same ~35s progression for the whole game. All
 * three stay in C major (or its closely related ii/vi chords) specifically
 * so any two can overlap during a crossfade without clashing — the same
 * reason each song's own chord cycle is built to end on the dominant (G)
 * right before wrapping, an authentic cadence landing exactly on its own
 * loop point. Rotation crossfades the outgoing song out and the incoming
 * one in together (see startVoice/stopVoice) rather than a hard cut, on
 * every transition including the wrap from the last song back to the
 * first. Entirely separate from sound.ts's own AudioContext/volume — see
 * settingsStore.ts's own doc for why this is its own toggle, off by
 * default.
 */

interface ChordSpec {
  root: number;
  /** The broken-chord pattern this chord's bar plays, in Hz. */
  arp: number[];
  /** How many times that pattern repeats before moving to the next chord —
   * per-chord (not a single global count) so a longer pattern can repeat
   * fewer times and still land on roughly the same pace as a shorter one. */
  repeats: number;
}

interface Song {
  /** ms between arpeggio notes — the main tempo/energy knob per song. */
  noteMs: number;
  waveform: OscillatorType;
  filterHz: number;
  chords: ChordSpec[];
}

// Song 1 "Arpeggio" — the original. Phrase A (I–V–vi–IV) is a simple
// root-third-fifth-third bounce; phrase B (ii–vi–IV–V) is a busier
// root-fifth-third-octave-fifth-third shape, real melodic contrast rather
// than just different chords, briefly reaching a full octave higher (A5)
// at its peak before its final chord (G, the dominant) resolves back to
// phrase A's C.
const SONG_ARPEGGIO: Song = {
  noteMs: 380,
  waveform: "triangle",
  filterHz: 3500,
  chords: [
    { root: 130.81, arp: [261.63, 329.63, 392.0, 329.63], repeats: 3 }, // C  — C3 root, C4 E4 G4 E4
    { root: 196.0, arp: [392.0, 493.88, 587.33, 493.88], repeats: 3 }, // G   — G3 root, G4 B4 D5 B4
    { root: 220.0, arp: [440.0, 523.25, 659.25, 523.25], repeats: 3 }, // Am  — A3 root, A4 C5 E5 C5
    { root: 174.61, arp: [349.23, 440.0, 523.25, 440.0], repeats: 3 }, // F   — F3 root, F4 A4 C5 A4
    { root: 146.83, arp: [293.66, 440.0, 349.23, 587.33, 440.0, 349.23], repeats: 2 }, // Dm — D3 root, D4 A4 F4 D5 A4 F4
    { root: 220.0, arp: [440.0, 659.25, 523.25, 880.0, 659.25, 523.25], repeats: 2 }, // Am  — A3 root, A4 E5 C5 A5 E5 C5
    { root: 174.61, arp: [349.23, 523.25, 440.0, 698.46, 523.25, 440.0], repeats: 2 }, // F   — F3 root, F4 C5 A4 F5 C5 A4
    { root: 196.0, arp: [392.0, 587.33, 493.88, 783.99, 587.33, 493.88], repeats: 2 }, // G   — G3 root, G4 D5 B4 G5 D5 B4
  ],
};

// Song 2 "Pop Run" — vi–IV–I–V (Am–F–C–G, the classic "pop" progression),
// played twice. A softer sine voice (rather than song 1's triangle) and a
// strictly ascending root-third-fifth-octave run each bar — no bounce-back
// — give it a lighter, more twinkling character; a touch faster than song 1
// for a little extra lift.
const SONG_POP_RUN: Song = {
  noteMs: 340,
  waveform: "sine",
  filterHz: 4200,
  chords: [
    { root: 220.0, arp: [440.0, 523.25, 659.25, 880.0], repeats: 3 }, // Am — A3 root, A4 C5 E5 A5
    { root: 174.61, arp: [349.23, 440.0, 523.25, 698.46], repeats: 3 }, // F  — F3 root, F4 A4 C5 F5
    { root: 130.81, arp: [261.63, 329.63, 392.0, 523.25], repeats: 3 }, // C  — C3 root, C4 E4 G4 C5
    { root: 196.0, arp: [392.0, 493.88, 587.33, 783.99], repeats: 3 }, // G  — G3 root, G4 B4 D5 G5
    { root: 220.0, arp: [440.0, 523.25, 659.25, 880.0], repeats: 3 }, // Am
    { root: 174.61, arp: [349.23, 440.0, 523.25, 698.46], repeats: 3 }, // F
    { root: 130.81, arp: [261.63, 329.63, 392.0, 523.25], repeats: 3 }, // C
    { root: 196.0, arp: [392.0, 493.88, 587.33, 783.99], repeats: 3 }, // G — dominant, resolves the wrap
  ],
};

// Song 3 "Skip" — ii–V–I–vi (Dm–G–C–Am), played twice. A zigzagging
// root-octave-third-fifth shape (jump up an octave, then step back down
// through the chord) reads as syncopated/skipping rather than either song's
// smooth contour; a touch slower and back to triangle, but a slightly
// brighter filter for a bit more shimmer.
const SONG_SKIP: Song = {
  noteMs: 420,
  waveform: "triangle",
  filterHz: 3800,
  chords: [
    { root: 146.83, arp: [293.66, 587.33, 349.23, 440.0], repeats: 3 }, // Dm — D3 root, D4 D5 F4 A4
    { root: 196.0, arp: [392.0, 783.99, 493.88, 587.33], repeats: 3 }, // G   — G3 root, G4 G5 B4 D5
    { root: 130.81, arp: [261.63, 523.25, 329.63, 392.0], repeats: 3 }, // C   — C3 root, C4 C5 E4 G4
    { root: 220.0, arp: [440.0, 880.0, 523.25, 659.25], repeats: 3 }, // Am    — A3 root, A4 A5 C5 E5
    { root: 146.83, arp: [293.66, 587.33, 349.23, 440.0], repeats: 3 }, // Dm
    { root: 196.0, arp: [392.0, 783.99, 493.88, 587.33], repeats: 3 }, // G
    { root: 130.81, arp: [261.63, 523.25, 329.63, 392.0], repeats: 3 }, // C
    { root: 220.0, arp: [440.0, 880.0, 523.25, 659.25], repeats: 3 }, // Am — resolves the wrap back to Dm/song 1's C
  ],
};

const SONGS: Song[] = [SONG_ARPEGGIO, SONG_POP_RUN, SONG_SKIP];

// C major pentatonic, an octave above the arpeggios' own register — the
// occasional bright "sparkle" note's pool. Every chord in every song above
// is diatonic to C major, so this stays consonant against all of them,
// which is what lets it run as one continuous layer straight through every
// song and every crossfade rather than needing its own per-song variant.
const SPARKLE_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const SPARKLE_MIN_DELAY_MS = 4000;
const SPARKLE_MAX_DELAY_MS = 9000;

// How long one song plays before crossfading into the next — randomized
// within the range so the rotation doesn't feel like a metronome.
const MIN_SONG_MS = 3 * 60 * 1000;
const MAX_SONG_MS = 5 * 60 * 1000;
// How long the outgoing/incoming songs overlap during a rotation — long
// enough to read as a deliberate blend, not a cut. Also reused as the
// "leaving a game screen" fade-out length (see stopAmbience) — the same
// duration was reported as reading like an abrupt cut at its old 1s length.
const CROSSFADE_MS = 4000;

interface Voice {
  songIndex: number;
  gain: GainNode;
  mixBus: GainNode;
  bassOsc: OscillatorNode;
  chordStep: number;
  arpStep: number;
  timers: number[];
  stopped: boolean;
}

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let running = false;
let voices: Voice[] = [];
let rotationTimer: number | null = null;
let sparkleTimers: number[] = [];
let sparkleSessionId = 0;

function clampVolume(v: number): number {
  // Capped well below sound.ts's own ceiling — even "100%" on this slider
  // should read as a quiet backdrop, never compete with table SFX.
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) * 0.35 : 0.12;
}

export function isAmbienceSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
}

export function isAmbiencePlaying(): boolean {
  return running;
}

function ensureContext(): AudioContext | null {
  if (!isAmbienceSupported()) return null;
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
  if (!ctx) ctx = new AudioContextClass();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// A single short, plucked arpeggio note — a fast attack and a decay shorter
// than the note interval, so each note stays articulated (a "plink," not a
// smear) instead of blurring into a pad. Waveform is per-song.
function playArpeggioNote(c: AudioContext, voice: Voice, waveform: OscillatorType, freq: number): void {
  const osc = c.createOscillator();
  osc.type = waveform;
  osc.frequency.value = freq;

  const gain = c.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(voice.mixBus);

  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
  gain.gain.linearRampToValueAtTime(0, now + 0.3);
  osc.start(now);
  osc.stop(now + 0.35);
}

// A brighter, longer sine "sparkle" — a bell-like accent, timbrally
// distinct from any song's own arpeggio voice so it reads as a highlight
// rather than another arpeggio note. Runs as one continuous layer straight
// into masterGain, independent of which song (or songs, mid-crossfade) are
// currently playing underneath it.
function playSparkleNote(c: AudioContext): void {
  if (!masterGain) return;
  const freq = SPARKLE_SCALE[Math.floor(Math.random() * SPARKLE_SCALE.length)];
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const gain = c.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(masterGain);

  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.3);
  gain.gain.linearRampToValueAtTime(0, now + 1.8);
  osc.start(now);
  osc.stop(now + 2.0);
}

// The steady heartbeat of one voice: one arpeggio note every song.noteMs,
// cycling through the current chord's own pattern and advancing to the
// next chord once it's repeated chord.repeats times. The (much quieter)
// sustained bass root glides to match whenever the chord changes.
function scheduleNextArpeggioNote(c: AudioContext, voice: Voice, song: Song): void {
  const id = window.setTimeout(() => {
    if (voice.stopped) return;
    const chord = song.chords[voice.chordStep];
    playArpeggioNote(c, voice, song.waveform, chord.arp[voice.arpStep % chord.arp.length]);
    voice.arpStep += 1;
    if (voice.arpStep >= chord.arp.length * chord.repeats) {
      voice.arpStep = 0;
      voice.chordStep = (voice.chordStep + 1) % song.chords.length;
      const now = c.currentTime;
      voice.bassOsc.frequency.cancelScheduledValues(now);
      voice.bassOsc.frequency.setValueAtTime(voice.bassOsc.frequency.value, now);
      voice.bassOsc.frequency.linearRampToValueAtTime(song.chords[voice.chordStep].root, now + 0.3);
    }
    scheduleNextArpeggioNote(c, voice, song);
  }, song.noteMs);
  voice.timers.push(id);
}

function scheduleNextSparkle(c: AudioContext, mySession: number): void {
  const delay = SPARKLE_MIN_DELAY_MS + Math.random() * (SPARKLE_MAX_DELAY_MS - SPARKLE_MIN_DELAY_MS);
  const id = window.setTimeout(() => {
    if (!running || mySession !== sparkleSessionId) return;
    playSparkleNote(c);
    scheduleNextSparkle(c, mySession);
  }, delay);
  sparkleTimers.push(id);
}

// Builds one song's own audio graph (arp + filter + slap-delay + bass) and
// fades its dedicated gain node in over fadeInMs. Multiple voices exist
// simultaneously only during a crossfade — see rotate() below.
function startVoice(c: AudioContext, songIndex: number, fadeInMs: number): Voice {
  const song = SONGS[songIndex];

  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain!);

  const mixBus = c.createGain();
  mixBus.gain.value = 1;

  const arpFilter = c.createBiquadFilter();
  arpFilter.type = "lowpass";
  arpFilter.frequency.value = song.filterHz;
  arpFilter.connect(gain);

  // Dry signal straight through, plus a short slap-delay (not a hall
  // reverb) for a touch of space without a cathedral-like tail.
  const dryGain = c.createGain();
  dryGain.gain.value = 0.85;
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.18;
  const delayFeedback = c.createGain();
  delayFeedback.gain.value = 0.22;
  const delayWet = c.createGain();
  delayWet.gain.value = 0.3;

  mixBus.connect(arpFilter);
  arpFilter.connect(dryGain).connect(gain);
  arpFilter.connect(delay);
  delay.connect(delayFeedback).connect(delay);
  delay.connect(delayWet).connect(gain);

  // The one sustained voice per song — quiet, single-note, no detune
  // wobble — just enough foundation under the arpeggio without
  // reintroducing a pad.
  const bassOsc = c.createOscillator();
  bassOsc.type = "sine";
  bassOsc.frequency.value = song.chords[0].root;
  const bassGain = c.createGain();
  bassGain.gain.value = 0.14;
  bassOsc.connect(bassGain).connect(mixBus);
  bassOsc.start();

  const voice: Voice = {
    songIndex,
    gain,
    mixBus,
    bassOsc,
    chordStep: 0,
    arpStep: 1, // the first note plays immediately below, not on the first scheduled tick
    timers: [],
    stopped: false,
  };

  // The first arpeggio note plays immediately rather than waiting a full
  // interval — otherwise the voice opens with a beat of silence.
  playArpeggioNote(c, voice, song.waveform, song.chords[0].arp[0]);

  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fadeInMs / 1000);

  scheduleNextArpeggioNote(c, voice, song);
  return voice;
}

function stopVoice(c: AudioContext, voice: Voice, fadeOutMs: number): void {
  voice.stopped = true;
  voice.timers.forEach((id) => window.clearTimeout(id));
  voice.timers = [];

  const now = c.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + fadeOutMs / 1000);

  const bassOsc = voice.bassOsc;
  setTimeout(() => {
    try {
      bassOsc.stop();
    } catch {
      /* already stopped */
    }
  }, fadeOutMs + 100);
}

function scheduleRotation(c: AudioContext): void {
  const duration = MIN_SONG_MS + Math.random() * (MAX_SONG_MS - MIN_SONG_MS);
  rotationTimer = window.setTimeout(() => {
    if (!running) return;
    const current = voices[voices.length - 1];
    const nextIndex = (current.songIndex + 1) % SONGS.length;
    const incoming = startVoice(c, nextIndex, CROSSFADE_MS);
    voices.push(incoming);
    stopVoice(c, current, CROSSFADE_MS);
    voices = voices.filter((v) => v === incoming || !v.stopped);
    scheduleRotation(c);
  }, duration);
}

/** Starts the loop (fades in over ~2s) and begins the song rotation. A
 * no-op if already playing, or if the browser has no Web Audio support at
 * all. Safe to call from a page mount effect — if the AudioContext comes up
 * suspended (no user gesture yet), it quietly retries on the next
 * tap/keypress rather than erroring. */
export function startAmbience(): void {
  if (running) return;
  const c = ensureContext();
  if (!c) return;
  running = true;
  voices = [];

  masterGain = c.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(c.destination);

  // The very first voice's own gain fades in near-instantly — masterGain's
  // ramp just below is what actually provides the perceptible fade-in, so
  // stacking a second slow fade on top of it would just make the opening
  // feel muted for longer than intended.
  voices.push(startVoice(c, 0, 50));

  const vol = clampVolume(loadLocalSettings().ambientVolume);
  const now = c.currentTime;
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(vol, now + 2);

  sparkleSessionId += 1;
  scheduleNextSparkle(c, sparkleSessionId);
  scheduleRotation(c);

  if (c.state === "suspended") {
    const retry = () => c.resume().catch(() => {});
    document.addEventListener("pointerdown", retry, { once: true });
    document.addEventListener("keydown", retry, { once: true });
  }
}

/** Fades out over CROSSFADE_MS (~4s — long enough to read as the music
 * actually dying away, not cutting off, when leaving a game screen) and
 * tears down the graph. Safe to call even if nothing's playing. */
export function stopAmbience(): void {
  if (rotationTimer !== null) {
    window.clearTimeout(rotationTimer);
    rotationTimer = null;
  }
  sparkleSessionId += 1;
  sparkleTimers.forEach((id) => window.clearTimeout(id));
  sparkleTimers = [];
  voices.forEach((v) => {
    v.stopped = true;
    v.timers.forEach((id) => window.clearTimeout(id));
    v.timers = [];
  });

  if (!running || !ctx || !masterGain) {
    running = false;
    voices = [];
    return;
  }
  const c = ctx;
  const gain = masterGain;
  const now = c.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_MS / 1000);

  const bassOscs = voices.map((v) => v.bassOsc);
  setTimeout(() => {
    bassOscs.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    });
  }, CROSSFADE_MS + 100);

  voices = [];
  running = false;
}

/** Re-reads the volume setting and ramps to it smoothly — called when the
 * player moves the slider while ambience is already playing. */
export function setAmbienceVolume(volume: number): void {
  if (!masterGain || !ctx) return;
  masterGain.gain.setTargetAtTime(clampVolume(volume), ctx.currentTime, 0.3);
}
