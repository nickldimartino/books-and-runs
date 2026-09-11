import { loadLocalSettings } from "./settingsStore";

/**
 * Optional generative ambient music for the game screens — synthesized
 * entirely with the Web Audio API (same "no audio files, no licensing,
 * works offline" approach sound.ts already uses for SFX), aiming for a
 * calm but upbeat backdrop rather than a single static tone: a four-voice
 * pad that glides between a brighter C-major progression (I–V–vi–IV) in a
 * higher register, a sparse plucked melody drawn from the major pentatonic
 * scale and dropped in fairly often, and a touch of synthetic hall reverb
 * so the whole thing has some space instead of sounding like a dry lab
 * tone. Deliberately not the previous D-minor version — that read as slow
 * and melancholy; this stays calm (no dance-tempo rhythm section) while
 * moving and resolving noticeably more often. Entirely separate from
 * sound.ts's own AudioContext/volume — see settingsStore.ts's own doc for
 * why this is its own toggle, off by default.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let padFilter: BiquadFilterNode | null = null;
let voices: { osc: OscillatorNode; lfo: OscillatorNode }[] = [];
let filterLfo: OscillatorNode | null = null;
let mixBus: GainNode | null = null;
let running = false;
let chordStep = 0;
let sessionId = 0;
let timers: number[] = [];

// Each chord is the four pad voices' target frequency (bass → soprano) —
// C → G → Am → F, the classic I–V–vi–IV "upbeat" progression, three major
// chords against one gentle relative minor for a touch of shade rather
// than the previous all-minor loop. Voiced a clear register higher than
// the old D-minor version throughout (this pad's lowest note is now C3;
// its highest reaches A4) — brighter both harmonically and tonally.
const CHORDS: [number, number, number, number][] = [
  [130.81, 196.0, 261.63, 329.63], // C  — C3 G3 C4 E4
  [146.83, 196.0, 246.94, 392.0], // G  — D3 G3 B3 G4
  [130.81, 220.0, 329.63, 440.0], // Am — C3 A3 E4 A4
  [174.61, 220.0, 261.63, 349.23], // F  — F3 A3 C4 F4
];

// C major pentatonic (no half-steps at all, so nothing can land "wrong")
// across two octaves — the sparse melody's note pool, kept separate from
// the pad's own voices so a melody note is always consonant with whichever
// chord happens to be holding underneath it.
const MELODY_SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

const CHORD_HOLD_SECONDS = 9;
const CHORD_MORPH_SECONDS = 2.5;
const MELODY_MIN_DELAY_MS = 2500;
const MELODY_MAX_DELAY_MS = 7000;

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

// A short synthetic impulse response (exponentially-decaying white noise)
// fed to a ConvolverNode — the cheapest way to get a real sense of space
// out of Web Audio without shipping an actual recorded IR file.
function createReverbImpulse(c: AudioContext): AudioBuffer {
  const seconds = 2.8;
  const decay = 3.2;
  const length = Math.floor(c.sampleRate * seconds);
  const impulse = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

// Glides every pad voice to the next chord in the progression over
// CHORD_MORPH_SECONDS, holds there, then schedules the next change —
// this (not a hard cut) is what keeps the pad from ever repeating the
// original single-drone complaint: it's always slowly on its way
// somewhere else.
function scheduleNextChord(c: AudioContext, mySession: number): void {
  const id = window.setTimeout(
    () => {
      if (!running || mySession !== sessionId) return;
      chordStep = (chordStep + 1) % CHORDS.length;
      const chord = CHORDS[chordStep];
      const now = c.currentTime;
      voices.forEach((v, i) => {
        v.osc.frequency.cancelScheduledValues(now);
        v.osc.frequency.setValueAtTime(v.osc.frequency.value, now);
        v.osc.frequency.linearRampToValueAtTime(chord[i], now + CHORD_MORPH_SECONDS);
      });
      scheduleNextChord(c, mySession);
    },
    (CHORD_HOLD_SECONDS + CHORD_MORPH_SECONDS) * 1000
  );
  timers.push(id);
}

// A single soft, plucked note — a triangle oscillator with a quick swell
// and a slow decay, the same shape a harp or kalimba note has, dropped
// through the shared reverb bus. Short-lived: it disconnects itself once
// it's done, nothing here needs tearing down from stopAmbience.
function playMelodyNote(c: AudioContext): void {
  if (!mixBus) return;
  const freq = MELODY_SCALE[Math.floor(Math.random() * MELODY_SCALE.length)];
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;

  const noteFilter = c.createBiquadFilter();
  noteFilter.type = "lowpass";
  noteFilter.frequency.value = 2200;

  const noteGain = c.createGain();
  noteGain.gain.value = 0;

  osc.connect(noteFilter).connect(noteGain).connect(mixBus);

  const now = c.currentTime;
  noteGain.gain.setValueAtTime(0, now);
  noteGain.gain.linearRampToValueAtTime(0.24, now + 0.35);
  noteGain.gain.linearRampToValueAtTime(0, now + 2.2);
  osc.start(now);
  osc.stop(now + 2.4);
}

function scheduleNextNote(c: AudioContext, mySession: number): void {
  const delay = MELODY_MIN_DELAY_MS + Math.random() * (MELODY_MAX_DELAY_MS - MELODY_MIN_DELAY_MS);
  const id = window.setTimeout(() => {
    if (!running || mySession !== sessionId) return;
    playMelodyNote(c);
    scheduleNextNote(c, mySession);
  }, delay);
  timers.push(id);
}

/** Starts the pad (fades in over ~2.5s). A no-op if already playing, or if
 * the browser has no Web Audio support at all. Safe to call from a page
 * mount effect — if the AudioContext comes up suspended (no user gesture
 * yet), it quietly retries on the next tap/keypress rather than erroring. */
export function startAmbience(): void {
  if (running) return;
  const c = ensureContext();
  if (!c) return;
  running = true;
  chordStep = 0;
  sessionId += 1;
  const mySession = sessionId;

  padFilter = c.createBiquadFilter();
  padFilter.type = "lowpass";
  // Noticeably more open than the original 900Hz — lets more of the pad's
  // own overtones through, which reads as brighter even before the higher
  // chord voicings above are accounted for.
  padFilter.frequency.value = 1600;
  padFilter.Q.value = 0.7;

  masterGain = c.createGain();
  masterGain.gain.value = 0;

  mixBus = c.createGain();
  mixBus.gain.value = 1;
  padFilter.connect(mixBus);

  // Dry signal straight through, plus a reverb send through a short
  // synthetic impulse response — together these are most of what makes
  // this read as produced ambient music rather than a bare synth tone.
  const dryGain = c.createGain();
  dryGain.gain.value = 0.75;
  const reverbSend = c.createGain();
  reverbSend.gain.value = 0.45;
  const convolver = c.createConvolver();
  convolver.buffer = createReverbImpulse(c);

  mixBus.connect(dryGain).connect(masterGain);
  mixBus.connect(reverbSend).connect(convolver).connect(masterGain);
  masterGain.connect(c.destination);

  voices = CHORDS[0].map((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const oscGain = c.createGain();
    oscGain.gain.value = 1 / CHORDS[0].length;

    // A slow, per-voice detune wobble (phase-offset so the voices don't
    // swell in unison) — what keeps a held chord from reading as a static,
    // obviously-looping tone in between chord changes.
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08 + i * 0.017;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain).connect(osc.detune);

    osc.connect(oscGain).connect(padFilter!);
    lfo.start();
    osc.start();
    return { osc, lfo };
  });

  filterLfo = c.createOscillator();
  filterLfo.type = "sine";
  filterLfo.frequency.value = 0.03;
  const filterLfoGain = c.createGain();
  filterLfoGain.gain.value = 450;
  filterLfo.connect(filterLfoGain).connect(padFilter.frequency);
  filterLfo.start();

  const vol = clampVolume(loadLocalSettings().ambientVolume);
  const now = c.currentTime;
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(vol, now + 2.5);

  scheduleNextChord(c, mySession);
  scheduleNextNote(c, mySession);

  if (c.state === "suspended") {
    const retry = () => c.resume().catch(() => {});
    document.addEventListener("pointerdown", retry, { once: true });
    document.addEventListener("keydown", retry, { once: true });
  }
}

/** Fades out over ~1.2s and tears down the oscillator graph. Safe to call
 * even if nothing's playing. */
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
  gain.gain.linearRampToValueAtTime(0, now + 1.2);

  const toStop = voices;
  const fLfo = filterLfo;
  setTimeout(() => {
    toStop.forEach(({ osc, lfo }) => {
      try {
        osc.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
    });
    try {
      fLfo?.stop();
    } catch {
      /* already stopped */
    }
  }, 1300);

  voices = [];
  filterLfo = null;
  mixBus = null;
  running = false;
}

/** Re-reads the volume setting and ramps to it smoothly — called when the
 * player moves the slider while ambience is already playing. */
export function setAmbienceVolume(volume: number): void {
  if (!masterGain || !ctx) return;
  masterGain.gain.setTargetAtTime(clampVolume(volume), ctx.currentTime, 0.3);
}
