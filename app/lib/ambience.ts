import { loadLocalSettings } from "./settingsStore";

/**
 * Optional generative ambient pad for the game screens — synthesized with
 * the Web Audio API, same "no audio files, no licensing, works offline"
 * approach sound.ts already uses for SFX, just sustained instead of a
 * one-shot burst. A bare open-fifth drone (no major/minor third) across
 * four octaves, each voice very slowly detuned by its own LFO so the chord
 * never quite locks into a static, looping-sounding tone, with a slow
 * filter sweep on top for a little movement. Entirely separate from
 * sound.ts's own AudioContext/volume — see settingsStore.ts's own doc for
 * why this is its own toggle, off by default.
 */

let ctx: AudioContext | null = null;
let ambientGain: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let voices: { osc: OscillatorNode; lfo: OscillatorNode }[] = [];
let filterLfo: OscillatorNode | null = null;
let running = false;

// C2, G2, C3, G3 — a bare fifth, calm and harmonically neutral rather than
// clearly major or minor (which would read as more "cheerful"/"tense" than
// a background pad should).
const CHORD_HZ = [65.41, 98.0, 130.81, 196.0];

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

/** Starts the pad (fades in over ~2.5s). A no-op if already playing, or if
 * the browser has no Web Audio support at all. Safe to call from a page
 * mount effect — if the AudioContext comes up suspended (no user gesture
 * yet), it quietly retries on the next tap/keypress rather than erroring. */
export function startAmbience(): void {
  if (running) return;
  const c = ensureContext();
  if (!c) return;
  running = true;

  filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.7;

  ambientGain = c.createGain();
  ambientGain.gain.value = 0;
  filter.connect(ambientGain);
  ambientGain.connect(c.destination);

  voices = CHORD_HZ.map((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const oscGain = c.createGain();
    oscGain.gain.value = 1 / CHORD_HZ.length;

    // A slow, per-voice detune wobble (phase-offset so the voices don't
    // swell in unison) — what keeps a sustained drone from reading as a
    // static, obviously-looping tone.
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + i * 0.013;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain).connect(osc.detune);

    osc.connect(oscGain).connect(filter!);
    lfo.start();
    osc.start();
    return { osc, lfo };
  });

  filterLfo = c.createOscillator();
  filterLfo.type = "sine";
  filterLfo.frequency.value = 0.02;
  const filterLfoGain = c.createGain();
  filterLfoGain.gain.value = 350;
  filterLfo.connect(filterLfoGain).connect(filter.frequency);
  filterLfo.start();

  const vol = clampVolume(loadLocalSettings().ambientVolume);
  const now = c.currentTime;
  ambientGain.gain.setValueAtTime(0, now);
  ambientGain.gain.linearRampToValueAtTime(vol, now + 2.5);

  if (c.state === "suspended") {
    const retry = () => c.resume().catch(() => {});
    document.addEventListener("pointerdown", retry, { once: true });
    document.addEventListener("keydown", retry, { once: true });
  }
}

/** Fades out over ~1.2s and tears down the oscillator graph. Safe to call
 * even if nothing's playing. */
export function stopAmbience(): void {
  if (!running || !ctx || !ambientGain) {
    running = false;
    return;
  }
  const c = ctx;
  const gain = ambientGain;
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
  running = false;
}

/** Re-reads the volume setting and ramps to it smoothly — called when the
 * player moves the slider while ambience is already playing. */
export function setAmbienceVolume(volume: number): void {
  if (!ambientGain || !ctx) return;
  ambientGain.gain.setTargetAtTime(clampVolume(volume), ctx.currentTime, 0.3);
}
