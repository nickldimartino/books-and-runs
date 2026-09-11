import { loadLocalSettings } from "./settingsStore";

/**
 * Optional generative background music for the game screens — synthesized
 * entirely with the Web Audio API (same "no audio files, no licensing,
 * works offline" approach sound.ts already uses for SFX). Earlier versions
 * of this were a sustained multi-voice pad — first a D-minor drone, then a
 * brighter C-major one — but a held, reverb-soaked pad chord reads as
 * ambient/exploration-game or choir music no matter how bright its key is,
 * which isn't the right mood for a card game. This version drops the pad
 * almost entirely: a light, bouncy triangle-wave arpeggio is the whole
 * texture, with one quiet sustained root note underneath for warmth and an
 * occasional bright sine "sparkle" note on top. A short slap-delay stands
 * in for reverb — enough space to not sound dry, not enough to read as a
 * cathedral. Calm, not dance-tempo, but constantly moving rather than held.
 * Entirely separate from sound.ts's own AudioContext/volume — see
 * settingsStore.ts's own doc for why this is its own toggle, off by
 * default.
 *
 * Two 4-chord phrases (see CHORDS) rather than one — phrase A's simple
 * root-third-fifth-third bounce, then phrase B, a slightly more ornamented
 * root-fifth-third-octave-fifth-third shape a register brighter — so the
 * ~36s full cycle actually goes somewhere instead of looping one 18s bar
 * over and over. The cycle is built to end on G (the dominant) right
 * before wrapping back to C (the tonic): that's a real authentic cadence
 * landing exactly on the loop point, which is what makes the wrap read as
 * a musical phrase resolving rather than an audible seam.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let mixBus: GainNode | null = null;
let arpFilter: BiquadFilterNode | null = null;
let bassOsc: OscillatorNode | null = null;
let running = false;
let chordStep = 0;
let arpStep = 0;
let sessionId = 0;
let timers: number[] = [];

interface ChordSpec {
  root: number;
  /** The broken-chord pattern this chord's bar plays, in Hz. */
  arp: number[];
  /** How many times that pattern repeats before moving to the next chord —
   * per-chord (not a single global count) so phrase B's longer pattern can
   * repeat fewer times and still land on the same ~4.6s-per-chord pace as
   * phrase A. */
  repeats: number;
}

// Phrase A (I–V–vi–IV, C major) — a simple root-third-fifth-third bounce,
// each chord's own bar in the same bright octave 4–5 band.
// Phrase B (ii–vi–IV–V) — a busier root-fifth-third-octave-fifth-third
// shape, real melodic contrast rather than just different chords, briefly
// reaching a full octave higher (A5) at its peak before phrase B's final
// chord (G, the dominant) resolves back to phrase A's C at the loop point.
const CHORDS: ChordSpec[] = [
  // — Phrase A —
  { root: 130.81, arp: [261.63, 329.63, 392.0, 329.63], repeats: 3 }, // C  — C3 root, C4 E4 G4 E4
  { root: 196.0, arp: [392.0, 493.88, 587.33, 493.88], repeats: 3 }, // G   — G3 root, G4 B4 D5 B4
  { root: 220.0, arp: [440.0, 523.25, 659.25, 523.25], repeats: 3 }, // Am  — A3 root, A4 C5 E5 C5
  { root: 174.61, arp: [349.23, 440.0, 523.25, 440.0], repeats: 3 }, // F   — F3 root, F4 A4 C5 A4
  // — Phrase B —
  { root: 146.83, arp: [293.66, 440.0, 349.23, 587.33, 440.0, 349.23], repeats: 2 }, // Dm — D3 root, D4 A4 F4 D5 A4 F4
  { root: 220.0, arp: [440.0, 659.25, 523.25, 880.0, 659.25, 523.25], repeats: 2 }, // Am  — A3 root, A4 E5 C5 A5 E5 C5
  { root: 174.61, arp: [349.23, 523.25, 440.0, 698.46, 523.25, 440.0], repeats: 2 }, // F   — F3 root, F4 C5 A4 F5 C5 A4
  { root: 196.0, arp: [392.0, 587.33, 493.88, 783.99, 587.33, 493.88], repeats: 2 }, // G   — G3 root, G4 D5 B4 G5 D5 B4
];

// C major pentatonic, an octave above the arpeggio — the occasional bright
// "sparkle" note's pool, kept separate so it's always consonant with
// whichever chord is currently playing.
const SPARKLE_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

const ARPEGGIO_NOTE_MS = 380; // ~4.6s per chord either phrase, ~37s for the full 8-chord cycle
const SPARKLE_MIN_DELAY_MS = 4000;
const SPARKLE_MAX_DELAY_MS = 9000;

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

// A single short, plucked arpeggio note — a triangle oscillator with a fast
// attack and a decay shorter than the note interval, so each note stays
// articulated (a "plink," not a smear) instead of blurring into a pad.
function playArpeggioNote(c: AudioContext, freq: number): void {
  if (!mixBus || !arpFilter) return;
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;

  const gain = c.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(arpFilter);

  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
  gain.gain.linearRampToValueAtTime(0, now + 0.3);
  osc.start(now);
  osc.stop(now + 0.35);
}

// A brighter, longer sine "sparkle" — a bell-like accent dropped in
// occasionally above the arpeggio, timbrally distinct from its triangle
// voice so it reads as a highlight rather than another arpeggio note.
function playSparkleNote(c: AudioContext): void {
  if (!mixBus) return;
  const freq = SPARKLE_SCALE[Math.floor(Math.random() * SPARKLE_SCALE.length)];
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const gain = c.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(mixBus);

  const now = c.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.3);
  gain.gain.linearRampToValueAtTime(0, now + 1.8);
  osc.start(now);
  osc.stop(now + 2.0);
}

// The steady heartbeat of the whole texture: one arpeggio note every
// ARPEGGIO_NOTE_MS, cycling through the current chord's own pattern and
// advancing to the next chord once it's repeated chord.repeats times. The
// (much quieter) sustained bass root glides to match whenever the chord
// changes.
function scheduleNextArpeggioNote(c: AudioContext, mySession: number): void {
  const id = window.setTimeout(() => {
    if (!running || mySession !== sessionId) return;
    const chord = CHORDS[chordStep];
    playArpeggioNote(c, chord.arp[arpStep % chord.arp.length]);
    arpStep += 1;
    if (arpStep >= chord.arp.length * chord.repeats) {
      arpStep = 0;
      chordStep = (chordStep + 1) % CHORDS.length;
      if (bassOsc) {
        const now = c.currentTime;
        bassOsc.frequency.cancelScheduledValues(now);
        bassOsc.frequency.setValueAtTime(bassOsc.frequency.value, now);
        bassOsc.frequency.linearRampToValueAtTime(CHORDS[chordStep].root, now + 0.3);
      }
    }
    scheduleNextArpeggioNote(c, mySession);
  }, ARPEGGIO_NOTE_MS);
  timers.push(id);
}

function scheduleNextSparkle(c: AudioContext, mySession: number): void {
  const delay = SPARKLE_MIN_DELAY_MS + Math.random() * (SPARKLE_MAX_DELAY_MS - SPARKLE_MIN_DELAY_MS);
  const id = window.setTimeout(() => {
    if (!running || mySession !== sessionId) return;
    playSparkleNote(c);
    scheduleNextSparkle(c, mySession);
  }, delay);
  timers.push(id);
}

/** Starts the loop (fades in over ~2s). A no-op if already playing, or if
 * the browser has no Web Audio support at all. Safe to call from a page
 * mount effect — if the AudioContext comes up suspended (no user gesture
 * yet), it quietly retries on the next tap/keypress rather than erroring. */
export function startAmbience(): void {
  if (running) return;
  const c = ensureContext();
  if (!c) return;
  running = true;
  chordStep = 0;
  arpStep = 0;
  sessionId += 1;
  const mySession = sessionId;

  masterGain = c.createGain();
  masterGain.gain.value = 0;

  mixBus = c.createGain();
  mixBus.gain.value = 1;

  arpFilter = c.createBiquadFilter();
  arpFilter.type = "lowpass";
  arpFilter.frequency.value = 3500;
  arpFilter.connect(mixBus);

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

  mixBus.connect(dryGain).connect(masterGain);
  mixBus.connect(delay);
  delay.connect(delayFeedback).connect(delay);
  delay.connect(delayWet).connect(masterGain);
  masterGain.connect(c.destination);

  // The one sustained voice — quiet, single-note, no detune wobble — just
  // enough foundation under the arpeggio without reintroducing a pad.
  bassOsc = c.createOscillator();
  bassOsc.type = "sine";
  bassOsc.frequency.value = CHORDS[0].root;
  const bassGain = c.createGain();
  bassGain.gain.value = 0.14;
  bassOsc.connect(bassGain).connect(mixBus);
  bassOsc.start();

  // The first arpeggio note plays immediately rather than waiting a full
  // interval — otherwise the loop opens with a beat of silence.
  playArpeggioNote(c, CHORDS[0].arp[0]);
  arpStep = 1;

  const vol = clampVolume(loadLocalSettings().ambientVolume);
  const now = c.currentTime;
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(vol, now + 2);

  scheduleNextArpeggioNote(c, mySession);
  scheduleNextSparkle(c, mySession);

  if (c.state === "suspended") {
    const retry = () => c.resume().catch(() => {});
    document.addEventListener("pointerdown", retry, { once: true });
    document.addEventListener("keydown", retry, { once: true });
  }
}

/** Fades out over ~1s and tears down the graph. Safe to call even if
 * nothing's playing. */
export function stopAmbience(): void {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
  sessionId += 1; // invalidates any callback already past its clearTimeout race

  if (!running || !ctx || !masterGain) {
    running = false;
    return;
  }
  const c = ctx;
  const gain = masterGain;
  const now = c.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + 1);

  const toStop = bassOsc;
  setTimeout(() => {
    try {
      toStop?.stop();
    } catch {
      /* already stopped */
    }
  }, 1100);

  bassOsc = null;
  mixBus = null;
  arpFilter = null;
  running = false;
}

/** Re-reads the volume setting and ramps to it smoothly — called when the
 * player moves the slider while ambience is already playing. */
export function setAmbienceVolume(volume: number): void {
  if (!masterGain || !ctx) return;
  masterGain.gain.setTargetAtTime(clampVolume(volume), ctx.currentTime, 0.3);
}
