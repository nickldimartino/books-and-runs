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

function soundEnabled(): boolean {
  return loadLocalSettings().soundEnabled;
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
// "card-like" than an oscillator would.
function noiseBurst(c: AudioContext, start: number, duration: number, filterFreq: number, q: number, peak: number) {
  const bufferSize = Math.max(1, Math.ceil(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const gain = c.createGain();
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

/** Drawing or discarding a single card — a short, dry tap. */
export function playCardTap(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  noiseBurst(c, 0, 0.05, 2200, 6, 0.35);
}

/** Sorting the hand, or dropping a card after a drag-reorder — a slide. */
export function playCardSlide(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  noiseBurst(c, 0, 0.14, 1400, 3, 0.2);
}

/** Confirming a meld — two quick taps (cards going down) plus a soft thump. */
export function playMeld(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  noiseBurst(c, 0, 0.05, 1800, 5, 0.3);
  noiseBurst(c, 0.05, 0.05, 2000, 5, 0.28);
  tone(c, 180, 0, 0.12, 0.15, "sine");
}

/** A round ends (someone went out) — a short 3-note rising chime. */
export function playRoundWin(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  tone(c, 523.25, 0, 0.18, 0.22, "triangle"); // C5
  tone(c, 659.25, 0.09, 0.18, 0.22, "triangle"); // E5
  tone(c, 783.99, 0.18, 0.28, 0.24, "triangle"); // G5
}

/** The whole game ends — a bigger 4-note fanfare. */
export function playGameWin(): void {
  if (!soundEnabled()) return;
  const c = getContext();
  if (!c) return;
  tone(c, 523.25, 0, 0.16, 0.2, "triangle"); // C5
  tone(c, 659.25, 0.1, 0.16, 0.2, "triangle"); // E5
  tone(c, 783.99, 0.2, 0.16, 0.22, "triangle"); // G5
  tone(c, 1046.5, 0.3, 0.4, 0.26, "triangle"); // C6
}
