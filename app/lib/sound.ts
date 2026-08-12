import { loadLocalSettings } from "./settingsStore";

/**
 * Every sound effect here is synthesized on the fly with the Web Audio
 * API — short noise bursts (through a bandpass filter) for card taps/slides,
 * plain oscillator tones for the win chimes. No audio files, no network
 * fetch, no licensing to worry about, and it works fully offline like the
 * rest of the app.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // Safari < 14.1 only exposed the webkit-prefixed constructor; harmless to
  // keep checking for it even though this app's deployment targets are
  // well past that now.
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!ctx) ctx = new AudioContextClass();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Set by GameContext while a tutorial game is active, so the tutorial can
// show off sound effects regardless of the player's saved preference,
// without ever touching (or reading as changed) their real setting.
let tutorialOverride = false;
export function setTutorialSoundOverride(enabled: boolean): void {
  tutorialOverride = enabled;
}

function soundEnabled(): boolean {
  return tutorialOverride || loadLocalSettings().soundEnabled;
}

function tone(c: AudioContext, freq: number, start: number, duration: number, peak: number, type: OscillatorType) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// A short burst of filtered white noise — the raw material for every
// card-handling sound (tap, slide, meld) below. Real cards make noise, not
// pitched tones, so noise (shaped by a bandpass filter) reads as much more
// "card-like" than an oscillator would. When filterFreqEnd is given, the
// filter sweeps from filterFreq down to it over the burst — used for the
// long, slide-y "sort your hand" sound.
function noiseBurst(
  c: AudioContext,
  start: number,
  duration: number,
  filterFreq: number,
  q: number,
  peak: number,
  filterFreqEnd?: number
) {
  const bufferSize = Math.max(1, Math.ceil(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  const t0 = c.currentTime + start;
  filter.frequency.setValueAtTime(filterFreq, t0);
  if (filterFreqEnd) filter.frequency.linearRampToValueAtTime(filterFreqEnd, t0 + duration);
  filter.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

/** Drawing or discarding a single card — a soft, low-pitched flick. */
export function playCardTap(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  noiseBurst(c, 0, 0.07, 900, 4, 0.28);
}

/** Sorting the hand, or dropping a card after a drag-reorder — a long sweep. */
export function playCardSlide(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  noiseBurst(c, 0, 0.22, 2000, 3, 0.18, 600);
}

/** Confirming a meld — three quick descending taps, cards landing in sequence. */
export function playMeld(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  noiseBurst(c, 0, 0.04, 2400, 6, 0.3);
  noiseBurst(c, 0.045, 0.04, 2100, 6, 0.28);
  noiseBurst(c, 0.09, 0.05, 1800, 6, 0.32);
}

/** A round ends (someone went out) — a two-note bell chime resolving down. */
export function playRoundWin(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  tone(c, 659.25, 0, 0.32, 0.22, "sine"); // E5
  tone(c, 523.25, 0.14, 0.4, 0.22, "sine"); // C5
}

/** The whole game ends — a melodic victory flourish (G5-C6-B5-C6). */
export function playGameWin(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  tone(c, 783.99, 0, 0.16, 0.22, "triangle"); // G5
  tone(c, 1046.5, 0.11, 0.16, 0.24, "triangle"); // C6
  tone(c, 987.77, 0.22, 0.14, 0.2, "triangle"); // B5
  tone(c, 1046.5, 0.33, 0.45, 0.28, "triangle"); // C6
}
