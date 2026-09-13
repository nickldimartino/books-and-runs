import { AmbientTrackChoice, loadLocalSettings } from "./settingsStore";

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
 * Ten songs (AMBIENT_SONGS below) — by default they rotate, 3 minutes
 * each, so a long session doesn't loop the same ~35s progression for the
 * whole game; Settings can also pin playback to just one of them
 * (settingsStore.ts's ambientTrack). All ten stay in C major (or its
 * closely related ii/iii/vi chords) specifically so any two can overlap
 * during a crossfade without clashing — the same reason each song's own
 * chord cycle is built to resolve smoothly right before wrapping back to
 * its own first chord. Rotation crossfades the outgoing song out and the
 * incoming one in together (see startVoice/stopVoice) rather than a hard
 * cut, on every transition — including the ping-pong turnaround at either
 * end of the list (song 10 back into song 9, or song 1 back into song 2;
 * see nextRotationIndex), so the whole set reads as one continuous piece
 * played forward and then backward rather than a loop with a seam.
 * Entirely separate from sound.ts's own AudioContext/volume — see
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
  id: Exclude<AmbientTrackChoice, "rotate">;
  label: string;
  /** ms between arpeggio notes — the main tempo/energy knob per song. */
  noteMs: number;
  waveform: OscillatorType;
  filterHz: number;
  chords: ChordSpec[];
}

// Song 1 "Arpeggio" — the original, deliberately unchanged. Phrase A
// (I–V–vi–IV) is a simple root-third-fifth-third bounce; phrase B
// (ii–vi–IV–V) is a busier root-fifth-third-octave-fifth-third shape, real
// melodic contrast rather than just different chords, briefly reaching a
// full octave higher (A5) at its peak before its final chord (G, the
// dominant) resolves back to phrase A's C.
const SONG_ARPEGGIO: Song = {
  id: "arpeggio",
  label: "Arpeggio",
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

// Song 2 "Bounce" — IV–I–vi–V (F–C–Am–G), played twice. Rebuilt after the
// original "Pop Run" (a soft sine voice on a smooth ascending run) read as
// too mellow/ambient rather than upbeat — back to song 1's triangle voice
// and bounce-family energy, but its own root-fifth-third-fifth contour and
// a peppier tempo keep it from just being song 1 again.
const SONG_BOUNCE: Song = {
  id: "bounce",
  label: "Bounce",
  noteMs: 330,
  waveform: "triangle",
  filterHz: 3800,
  chords: [
    { root: 174.61, arp: [349.23, 523.25, 440.0, 523.25], repeats: 3 }, // F  — F3 root, F4 C5 A4 C5
    { root: 130.81, arp: [261.63, 392.0, 329.63, 392.0], repeats: 3 }, // C  — C3 root, C4 G4 E4 G4
    { root: 220.0, arp: [440.0, 659.25, 523.25, 659.25], repeats: 3 }, // Am — A3 root, A4 E5 C5 E5
    { root: 196.0, arp: [392.0, 587.33, 493.88, 587.33], repeats: 3 }, // G  — G3 root, G4 D5 B4 D5 — dominant, resolves the wrap
    { root: 174.61, arp: [349.23, 523.25, 440.0, 523.25], repeats: 3 }, // F
    { root: 130.81, arp: [261.63, 392.0, 329.63, 392.0], repeats: 3 }, // C
    { root: 220.0, arp: [440.0, 659.25, 523.25, 659.25], repeats: 3 }, // Am
    { root: 196.0, arp: [392.0, 587.33, 493.88, 587.33], repeats: 3 }, // G
  ],
};

// Song 3 "Skip" — V–vi–IV–I (G–Am–F–C), played twice. A zigzagging
// root-octave-third-fifth shape (jump up an octave, then step back down
// through the chord) reads as syncopated/skipping rather than either other
// song's contour; quicker than its old ii–V–I–vi version (this was the
// song there wasn't time to confirm hearing — sped up and reordered to
// start on the bright dominant rather than the minor ii, so it reads as
// upbeat from its very first chord).
const SONG_SKIP: Song = {
  id: "skip",
  label: "Skip",
  noteMs: 350,
  waveform: "triangle",
  filterHz: 4000,
  chords: [
    { root: 196.0, arp: [392.0, 783.99, 493.88, 587.33], repeats: 3 }, // G  — G3 root, G4 G5 B4 D5
    { root: 220.0, arp: [440.0, 880.0, 523.25, 659.25], repeats: 3 }, // Am — A3 root, A4 A5 C5 E5
    { root: 174.61, arp: [349.23, 698.46, 440.0, 523.25], repeats: 3 }, // F  — F3 root, F4 F5 A4 C5
    { root: 130.81, arp: [261.63, 523.25, 329.63, 392.0], repeats: 3 }, // C  — C3 root, C4 C5 E4 G4 — tonic, resolves the wrap
    { root: 196.0, arp: [392.0, 783.99, 493.88, 587.33], repeats: 3 }, // G
    { root: 220.0, arp: [440.0, 880.0, 523.25, 659.25], repeats: 3 }, // Am
    { root: 174.61, arp: [349.23, 698.46, 440.0, 523.25], repeats: 3 }, // F
    { root: 130.81, arp: [261.63, 523.25, 329.63, 392.0], repeats: 3 }, // C
  ],
};

// Song 4 "Glide" — I–IV–I–V (C–F–C–G), played twice. A smooth ascending
// root-third-fifth-octave run each bar, the most straightforwardly "rising"
// contour of the set.
const SONG_GLIDE: Song = {
  id: "glide",
  label: "Glide",
  noteMs: 360,
  waveform: "triangle",
  filterHz: 3600,
  chords: [
    { root: 130.81, arp: [261.63, 329.63, 392.0, 523.25], repeats: 3 }, // C  — C4 E4 G4 C5
    { root: 174.61, arp: [349.23, 440.0, 523.25, 698.46], repeats: 3 }, // F  — F4 A4 C5 F5
    { root: 130.81, arp: [261.63, 329.63, 392.0, 523.25], repeats: 3 }, // C
    { root: 196.0, arp: [392.0, 493.88, 587.33, 783.99], repeats: 3 }, // G  — G4 B4 D5 G5 — dominant, resolves the wrap
    { root: 130.81, arp: [261.63, 329.63, 392.0, 523.25], repeats: 3 }, // C
    { root: 174.61, arp: [349.23, 440.0, 523.25, 698.46], repeats: 3 }, // F
    { root: 130.81, arp: [261.63, 329.63, 392.0, 523.25], repeats: 3 }, // C
    { root: 196.0, arp: [392.0, 493.88, 587.33, 783.99], repeats: 3 }, // G
  ],
};

// Song 5 "Descend" — vi–IV–I–V (Am–F–C–G), played twice. The mirror image
// of Glide's contour: each bar steps down from the octave to the root
// instead of climbing to it, the one song in the set that reads as
// coming down rather than going up while staying just as bright.
const SONG_DESCEND: Song = {
  id: "descend",
  label: "Descend",
  noteMs: 340,
  waveform: "triangle",
  filterHz: 3700,
  chords: [
    { root: 220.0, arp: [880.0, 659.25, 523.25, 440.0], repeats: 3 }, // Am — A5 E5 C5 A4
    { root: 174.61, arp: [698.46, 523.25, 440.0, 349.23], repeats: 3 }, // F  — F5 C5 A4 F4
    { root: 130.81, arp: [523.25, 392.0, 329.63, 261.63], repeats: 3 }, // C  — C5 G4 E4 C4
    { root: 196.0, arp: [783.99, 587.33, 493.88, 392.0], repeats: 3 }, // G  — G5 D5 B4 G4 — dominant, resolves the wrap
    { root: 220.0, arp: [880.0, 659.25, 523.25, 440.0], repeats: 3 }, // Am
    { root: 174.61, arp: [698.46, 523.25, 440.0, 349.23], repeats: 3 }, // F
    { root: 130.81, arp: [523.25, 392.0, 329.63, 261.63], repeats: 3 }, // C
    { root: 196.0, arp: [783.99, 587.33, 493.88, 392.0], repeats: 3 }, // G
  ],
};

// Song 6 "Drift" — I–vi–ii–V (C–Am–Dm–G), played twice. The gentlest tempo
// of the set, a gently rocking root-third-fifth-third contour rather than
// any of the others' bigger leaps — still upbeat, just the gentlest hand
// of the ten.
const SONG_DRIFT: Song = {
  id: "drift",
  label: "Drift",
  noteMs: 390,
  waveform: "triangle",
  filterHz: 3500,
  chords: [
    { root: 130.81, arp: [261.63, 329.63, 392.0, 329.63], repeats: 3 }, // C  — C4 E4 G4 E4
    { root: 220.0, arp: [440.0, 523.25, 659.25, 523.25], repeats: 3 }, // Am — A4 C5 E5 C5
    { root: 146.83, arp: [293.66, 349.23, 440.0, 349.23], repeats: 3 }, // Dm — D4 F4 A4 F4
    { root: 196.0, arp: [392.0, 493.88, 587.33, 493.88], repeats: 3 }, // G  — G4 B4 D5 B4 — dominant, resolves the wrap
    { root: 130.81, arp: [261.63, 329.63, 392.0, 329.63], repeats: 3 }, // C
    { root: 220.0, arp: [440.0, 523.25, 659.25, 523.25], repeats: 3 }, // Am
    { root: 146.83, arp: [293.66, 349.23, 440.0, 349.23], repeats: 3 }, // Dm
    { root: 196.0, arp: [392.0, 493.88, 587.33, 493.88], repeats: 3 }, // G
  ],
};

// Song 7 "Rise" — IV–V–iii–vi (F–G–Em–Am), played twice. The quickest
// tempo of the set and the only one built from a rising-tension
// progression rather than one that resolves straight back to the tonic —
// reads as the most energetic of the ten.
const SONG_RISE: Song = {
  id: "rise",
  label: "Rise",
  noteMs: 310,
  waveform: "triangle",
  filterHz: 4000,
  chords: [
    { root: 174.61, arp: [349.23, 440.0, 523.25, 698.46], repeats: 3 }, // F  — F4 A4 C5 F5
    { root: 196.0, arp: [392.0, 493.88, 587.33, 783.99], repeats: 3 }, // G  — G4 B4 D5 G5
    { root: 164.81, arp: [329.63, 392.0, 493.88, 659.25], repeats: 3 }, // Em — E4 G4 B4 E5
    { root: 220.0, arp: [440.0, 523.25, 659.25, 880.0], repeats: 3 }, // Am — A4 C5 E5 A5 — peak of the set
    { root: 174.61, arp: [349.23, 440.0, 523.25, 698.46], repeats: 3 }, // F
    { root: 196.0, arp: [392.0, 493.88, 587.33, 783.99], repeats: 3 }, // G
    { root: 164.81, arp: [329.63, 392.0, 493.88, 659.25], repeats: 3 }, // Em
    { root: 220.0, arp: [440.0, 523.25, 659.25, 880.0], repeats: 3 }, // Am
  ],
};

// Song 8 "Climb" — I–iii–IV–V (C–Em–F–G), played twice. A jump-and-return
// root-fifth-octave-fifth contour on every bar — the biggest single-bar
// leap of the set, landing an octave up before stepping back down.
const SONG_CLIMB: Song = {
  id: "climb",
  label: "Climb",
  noteMs: 345,
  waveform: "triangle",
  filterHz: 3800,
  chords: [
    { root: 130.81, arp: [261.63, 392.0, 523.25, 392.0], repeats: 3 }, // C  — C4 G4 C5 G4
    { root: 164.81, arp: [329.63, 493.88, 659.25, 493.88], repeats: 3 }, // Em — E4 B4 E5 B4
    { root: 174.61, arp: [349.23, 523.25, 698.46, 523.25], repeats: 3 }, // F  — F4 C5 F5 C5
    { root: 196.0, arp: [392.0, 587.33, 783.99, 587.33], repeats: 3 }, // G  — G4 D5 G5 D5 — dominant, resolves the wrap
    { root: 130.81, arp: [261.63, 392.0, 523.25, 392.0], repeats: 3 }, // C
    { root: 164.81, arp: [329.63, 493.88, 659.25, 493.88], repeats: 3 }, // Em
    { root: 174.61, arp: [349.23, 523.25, 698.46, 523.25], repeats: 3 }, // F
    { root: 196.0, arp: [392.0, 587.33, 783.99, 587.33], repeats: 3 }, // G
  ],
};

// Song 9 "Settle" — vi–V–IV–iii (Am–G–F–Em), played twice. Climb's
// progression in reverse, with a matching third-root-fifth-root contour
// that steps down each bar instead of leaping — the set's other
// "coming down" song alongside Descend, built from different chords.
const SONG_SETTLE: Song = {
  id: "settle",
  label: "Settle",
  noteMs: 370,
  waveform: "triangle",
  filterHz: 3600,
  chords: [
    { root: 220.0, arp: [523.25, 440.0, 659.25, 440.0], repeats: 3 }, // Am — C5 A4 E5 A4
    { root: 196.0, arp: [493.88, 392.0, 587.33, 392.0], repeats: 3 }, // G  — B4 G4 D5 G4
    { root: 174.61, arp: [440.0, 349.23, 523.25, 349.23], repeats: 3 }, // F  — A4 F4 C5 F4
    { root: 164.81, arp: [392.0, 329.63, 493.88, 329.63], repeats: 3 }, // Em — G4 E4 B4 E4
    { root: 220.0, arp: [523.25, 440.0, 659.25, 440.0], repeats: 3 }, // Am
    { root: 196.0, arp: [493.88, 392.0, 587.33, 392.0], repeats: 3 }, // G
    { root: 174.61, arp: [440.0, 349.23, 523.25, 349.23], repeats: 3 }, // F
    { root: 164.81, arp: [392.0, 329.63, 493.88, 329.63], repeats: 3 }, // Em
  ],
};

// Song 10 "Home" — I–V–vi–IV (C–G–Am–F), played twice — pop's own most
// familiar progression, ending on the subdominant for a plagal ("amen")
// resolution back to the tonic instead of the dominant every other song
// in the set uses, the strongest close of the ten for the far end of the
// rotation before it plays back toward Arpeggio.
const SONG_HOME: Song = {
  id: "home",
  label: "Home",
  noteMs: 365,
  waveform: "triangle",
  filterHz: 3750,
  chords: [
    { root: 130.81, arp: [261.63, 329.63, 392.0, 329.63], repeats: 3 }, // C  — C4 E4 G4 E4
    { root: 196.0, arp: [392.0, 493.88, 587.33, 493.88], repeats: 3 }, // G  — G4 B4 D5 B4
    { root: 220.0, arp: [440.0, 523.25, 659.25, 523.25], repeats: 3 }, // Am — A4 C5 E5 C5
    { root: 174.61, arp: [349.23, 440.0, 523.25, 440.0], repeats: 3 }, // F  — F4 A4 C5 A4 — subdominant, plagal resolution
    { root: 130.81, arp: [261.63, 329.63, 392.0, 329.63], repeats: 3 }, // C
    { root: 196.0, arp: [392.0, 493.88, 587.33, 493.88], repeats: 3 }, // G
    { root: 220.0, arp: [440.0, 523.25, 659.25, 523.25], repeats: 3 }, // Am
    { root: 174.61, arp: [349.23, 440.0, 523.25, 440.0], repeats: 3 }, // F
  ],
};

/** Playback order — "rotate" ping-pongs through this list (1→2→…→10→9→…→1,
 * see nextRotationIndex below) rather than wrapping straight from the last
 * song back to the first, so a long session reads as one continuous piece
 * played forward and then backward rather than a loop with a seam. Also
 * what Settings' song picker lists, in this same order. */
export const AMBIENT_SONGS: Song[] = [
  SONG_ARPEGGIO,
  SONG_BOUNCE,
  SONG_SKIP,
  SONG_GLIDE,
  SONG_DESCEND,
  SONG_DRIFT,
  SONG_RISE,
  SONG_CLIMB,
  SONG_SETTLE,
  SONG_HOME,
];

function songIndexFor(id: Exclude<AmbientTrackChoice, "rotate">): number {
  return AMBIENT_SONGS.findIndex((s) => s.id === id);
}

// C major pentatonic, an octave above the arpeggios' own register — the
// occasional bright "sparkle" note's pool. Every chord in every song above
// is diatonic to C major, so this stays consonant against all of them,
// which is what lets it run as one continuous layer straight through every
// song and every crossfade rather than needing its own per-song variant.
const SPARKLE_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const SPARKLE_MIN_DELAY_MS = 4000;
const SPARKLE_MAX_DELAY_MS = 9000;

// How long one song plays before crossfading into the next, in "rotate"
// mode.
const SONG_DURATION_MS = 3 * 60 * 1000;
// How long the outgoing/incoming songs overlap during a rotation — long
// enough to read as a deliberate blend, not a cut.
const CROSSFADE_MS = 4000;
// How long stopAmbience's own fade takes when leaving a game screen
// entirely (Home, How to play, etc.) — shorter than CROSSFADE_MS so it
// doesn't linger; still long enough to read as dying away rather than
// cutting off, which is what its old 1s length was reported as doing.
const STOP_FADE_MS = 3000;

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
// Ping-pong, not a circular wrap: 0→1→…→9→8→…→0→1→… — reset to forward on
// every fresh start so a session's rotation always begins the same way.
let rotationDirection: 1 | -1 = 1;

/** The next index in the ping-pong sequence — reverses direction at either
 * end instead of wrapping, so song 10 is followed by song 9 again (not a
 * jump back to song 1) and the whole set reads as one continuous piece
 * played forward then backward rather than a loop with a seam. */
function nextRotationIndex(currentIndex: number): number {
  if (AMBIENT_SONGS.length <= 1) return currentIndex;
  const next = currentIndex + rotationDirection;
  if (next >= AMBIENT_SONGS.length) {
    rotationDirection = -1;
    return AMBIENT_SONGS.length - 2;
  }
  if (next < 0) {
    rotationDirection = 1;
    return 1;
  }
  return next;
}

let previewMasterGain: GainNode | null = null;
let previewVoice: Voice | null = null;

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
// currently playing underneath it. Never plays during a preview (masterGain
// is null then) — a preview is meant to be just that one song.
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

// Builds one song's own audio graph (arp + filter + slap-delay + bass) into
// `destination` and fades its dedicated gain node in over fadeInMs.
// `destination` is masterGain for the real in-game rotation, or a preview's
// own standalone gain node — either way this function doesn't know or care
// which. Multiple voices exist simultaneously only during a crossfade — see
// rotate() below.
function startVoice(c: AudioContext, songIndex: number, fadeInMs: number, destination: GainNode): Voice {
  const song = AMBIENT_SONGS[songIndex];

  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(destination);

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

// How long until `voice` finishes its current chord and every chord after
// it, up through (and including) the song's own last chord — each song's
// chords array is written to land its last entry on a dominant/subdominant
// "resolves the wrap" chord (see e.g. SONG_ARPEGGIO's own comments) right
// before it cycles back to chord 0. That's the one moment in a song's own
// phrase a crossfade actually lands cleanly: the outgoing voice is on its
// designed resolution and about to loop, and the incoming voice opens on
// its own tonic — not two arbitrary, unrelated chords colliding mid-bar.
function msUntilPhraseEnd(voice: Voice, song: Song): number {
  let ms = 0;
  let step = voice.chordStep;
  let arpStep = voice.arpStep;
  for (;;) {
    const chord = song.chords[step];
    const notesLeft = chord.arp.length * chord.repeats - arpStep;
    ms += notesLeft * song.noteMs;
    if (step === song.chords.length - 1) return ms;
    step += 1;
    arpStep = 0;
  }
}

function scheduleRotation(c: AudioContext): void {
  rotationTimer = window.setTimeout(() => {
    if (!running) return;
    const current = voices[voices.length - 1];
    const song = AMBIENT_SONGS[current.songIndex];
    // SONG_DURATION_MS is a floor, not the exact trigger — the crossfade
    // itself waits for the current voice to actually reach that resolving
    // moment, however close it already is once the floor elapses.
    rotationTimer = window.setTimeout(() => {
      if (!running) return;
      const nextIndex = nextRotationIndex(current.songIndex);
      const incoming = startVoice(c, nextIndex, CROSSFADE_MS, masterGain!);
      voices.push(incoming);
      stopVoice(c, current, CROSSFADE_MS);
      voices = voices.filter((v) => v === incoming || !v.stopped);
      scheduleRotation(c);
    }, msUntilPhraseEnd(current, song));
  }, SONG_DURATION_MS);
}

/** Starts the loop (fades in over ~2s) at whatever settingsStore's
 * ambientTrack currently says — "rotate" begins the 3-minute rotation
 * through every song; anything else pins playback to just that one song
 * (still looping it) with no rotation timer at all. A no-op if already
 * playing, or if the browser has no Web Audio support at all. Safe to call
 * from a page mount effect — if the AudioContext comes up suspended (no
 * user gesture yet), it quietly retries on the next tap/keypress rather
 * than erroring. */
export function startAmbience(): void {
  if (running) return;
  const c = ensureContext();
  if (!c) return;
  running = true;
  voices = [];
  rotationDirection = 1;

  masterGain = c.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(c.destination);

  const track = loadLocalSettings().ambientTrack;
  const startIndex = track === "rotate" ? 0 : Math.max(0, songIndexFor(track));

  // The very first voice's own gain fades in near-instantly — masterGain's
  // ramp just below is what actually provides the perceptible fade-in, so
  // stacking a second slow fade on top of it would just make the opening
  // feel muted for longer than intended.
  voices.push(startVoice(c, startIndex, 50, masterGain));

  const vol = clampVolume(loadLocalSettings().ambientVolume);
  const now = c.currentTime;
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(vol, now + 2);

  sparkleSessionId += 1;
  scheduleNextSparkle(c, sparkleSessionId);
  if (track === "rotate") scheduleRotation(c);

  if (c.state === "suspended") {
    const retry = () => c.resume().catch(() => {});
    document.addEventListener("pointerdown", retry, { once: true });
    document.addEventListener("keydown", retry, { once: true });
  }
}

/** Fades out over STOP_FADE_MS (~3s — long enough to read as the music
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
  gain.gain.linearRampToValueAtTime(0, now + STOP_FADE_MS / 1000);

  const bassOscs = voices.map((v) => v.bassOsc);
  setTimeout(() => {
    bassOscs.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    });
  }, STOP_FADE_MS + 100);

  voices = [];
  running = false;
}

/** Re-reads the volume setting and ramps to it smoothly — called when the
 * player moves the slider while ambience is already playing. */
export function setAmbienceVolume(volume: number): void {
  if (!masterGain || !ctx) return;
  masterGain.gain.setTargetAtTime(clampVolume(volume), ctx.currentTime, 0.3);
}

/** Plays just one song on its own, independent of the real startAmbience/
 * stopAmbience lifecycle (and safe to call even while that's separately
 * running elsewhere, however unlikely — this uses its own gain node, never
 * masterGain) — the "listen" button next to each song on the Settings
 * picker. Calling it again (with the same or a different song) tears down
 * whatever preview was already playing first, so only one ever sounds at a
 * time. */
export function previewSong(id: Exclude<AmbientTrackChoice, "rotate">): void {
  const c = ensureContext();
  if (!c) return;
  stopPreview();

  previewMasterGain = c.createGain();
  previewMasterGain.gain.value = 0;
  previewMasterGain.connect(c.destination);
  previewVoice = startVoice(c, songIndexFor(id), 300, previewMasterGain);

  const vol = clampVolume(loadLocalSettings().ambientVolume || 0.4);
  const now = c.currentTime;
  previewMasterGain.gain.setValueAtTime(0, now);
  previewMasterGain.gain.linearRampToValueAtTime(vol, now + 0.5);
}

/** Stops whatever previewSong() started. Safe to call even if nothing's
 * previewing (e.g. an unconditional cleanup on the Settings page unmount). */
export function stopPreview(): void {
  if (!previewVoice || !ctx || !previewMasterGain) {
    previewVoice = null;
    previewMasterGain = null;
    return;
  }
  const c = ctx;
  stopVoice(c, previewVoice, 300);
  const gain = previewMasterGain;
  const now = c.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.3);
  previewVoice = null;
  previewMasterGain = null;
}

export function isPreviewing(id?: Exclude<AmbientTrackChoice, "rotate">): boolean {
  if (!previewVoice) return false;
  return id === undefined || previewVoice.songIndex === songIndexFor(id);
}
